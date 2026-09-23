import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DesignationsService } from '../src/designations/designations.service';
import { SousType, IdPaie } from '../src/common/types';

describe('Waraqa backend (e2e)', () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    process.env.WARAQA_DB_PATH = ':memory:';
    process.env.WARAQA_JWT_SECRET = 'secret-test-e2e';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    http = app.getHttpServer();

    const designationsService = app.get(DesignationsService);
    await designationsService.initialiserSeed();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Authentification ---

  describe('Authentification', () => {
    const email = `test-${Date.now()}@fem.ma`;
    const motDePasse = 'motdepasse123';
    let token: string;

    it('POST /auth/inscription crée un compte et retourne un token', async () => {
      const res = await request(http)
        .post('/auth/inscription')
        .send({ nom: 'Rochdi Test', email, motDePasse })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.utilisateur.email).toBe(email);
      expect(res.body.utilisateur.motDePasseHache).toBeUndefined();
      token = res.body.accessToken;
    });

    it('refuse une seconde inscription avec le même email', async () => {
      await request(http)
        .post('/auth/inscription')
        .send({ nom: 'Doublon', email, motDePasse })
        .expect(409);
    });

    it('POST /auth/connexion avec les bons identifiants retourne un token', async () => {
      const res = await request(http)
        .post('/auth/connexion')
        .send({ email, motDePasse })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('POST /auth/connexion avec mauvais mot de passe est refusé', async () => {
      await request(http)
        .post('/auth/connexion')
        .send({ email, motDePasse: 'mauvais' })
        .expect(401);
    });

    it('GET /auth/moi sans token est refusé', async () => {
      await request(http).get('/auth/moi').expect(401);
    });

    it('GET /auth/moi avec token retourne l\'utilisateur courant', async () => {
      const res = await request(http)
        .get('/auth/moi')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.email).toBe(email);
    });

    it('GET /factures sans token est refusé (toutes les routes protégées)', async () => {
      await request(http).get('/factures').expect(401);
    });
  });

  // --- Scénarios métier, avec un utilisateur authentifié dédié ---

  describe('Scénarios métier', () => {
    let token: string;
    let userId: number;

    beforeAll(async () => {
      const email = `metier-${Date.now()}@fem.ma`;
      const res = await request(http)
        .post('/auth/inscription')
        .send({ nom: 'Comptable FEM', email, motDePasse: 'motdepasse123' })
        .expect(201);
      token = res.body.accessToken;
      userId = res.body.utilisateur.id;
    });

    function auth() {
      return { Authorization: `Bearer ${token}` };
    }

    it('crée une facture fournisseur complète → statut validee', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'F-2026-100',
          designation: 'ACHAT',
          mTtc: 1200,
          taux: 0.2,
          iceFrs: '001234567000012',
          iff: '001234567',
          libFrss: 'FOURNISSEUR TEST SARL',
          idPaie: IdPaie.VIREMENT,
          dateFac: '2026-07-05',
          datePaie: '2026-07-10',
          sousType: SousType.FACTURE_FOURNISSEUR,
        })
        .expect(201);

      expect(res.body.statut).toBe('validee');
      expect(res.body.mHt).toBeCloseTo(1000, 2);
      expect(res.body.tva).toBeCloseTo(200, 2);
      expect(res.body.utilisateurId).toBe(userId);
      expect(res.body.saisiPar).toBe('Comptable FEM');
    });

    it('crée une facture fournisseur incomplète (ICE manquant) → statut incomplete', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'F-2026-101',
          designation: 'SERVICE',
          mTtc: 500,
          taux: 0.2,
          libFrss: 'AUTRE FOURNISSEUR',
          sousType: SousType.FACTURE_FOURNISSEUR,
        })
        .expect(201);

      expect(res.body.statut).toBe('incomplete');
      expect(res.body.champsManquants).toContain('iceFrs');
    });

    it('déclaration douanière avec IF=ICE="1111" et LIB_FRSS "DOUANE" → pas de champ manquant lié à ICE', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'DUM-2026-007',
          designation: 'RECEVEUR DOUANE',
          mTtc: 690000,
          taux: 0.2,
          iff: '1111',
          iceFrs: '1111',
          libFrss: ' DROIT DOUANE',
          idPaie: IdPaie.AUTRES,
          dateFac: '2026-07-12',
          sousType: SousType.DECLARATION_DOUANIERE,
        })
        .expect(201);

      expect(res.body.statut).toBe('validee');
      expect(res.body.vigilanceRenforcee).toBe(true);
      expect(res.body.notifiable).toBe(true);
    });

    it('note de frais sans FACT_NUM ni ICE → validee (contrôle allégé)', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 85,
          taux: 0.2,
          designation: 'CARBURANT',
          sousType: SousType.NOTE_DE_FRAIS,
        })
        .expect(201);

      expect(res.body.statut).toBe('validee');
    });

    it('rejette un idPaie hors plage DGI (1-7)', async () => {
      await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 100,
          taux: 0.2,
          idPaie: 9,
          sousType: SousType.NOTE_DE_FRAIS,
        })
        .expect(400);
    });

    it('rejette un taux non légal', async () => {
      await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 100,
          taux: 0.99,
          sousType: SousType.NOTE_DE_FRAIS,
        })
        .expect(400);
    });

    it('détecte un doublon à la création (même factNum/ICE/montant)', async () => {
      await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'F-2026-200',
          mTtc: 900,
          taux: 0.2,
          iceFrs: '009988776600011',
          libFrss: 'FOURNISSEUR DOUBLON',
          sousType: SousType.FACTURE_FOURNISSEUR,
          dateFac: '2026-07-01',
        })
        .expect(201);

      const res2 = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'F-2026-200',
          mTtc: 900,
          taux: 0.2,
          iceFrs: '009988776600011',
          libFrss: 'FOURNISSEUR DOUBLON',
          sousType: SousType.FACTURE_FOURNISSEUR,
          dateFac: '2026-07-01',
        })
        .expect(201);

      // La création n'est jamais bloquée (principe "jamais de blocage"),
      // mais la ligne est marquée notifiable pour signaler le doublon.
      expect(res2.body.notifiable).toBe(true);
    });

    it('crée une ligne bancaire orpheline → statut en_attente_confirmation_paiement', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 3200,
          taux: 0.2,
          idPaie: IdPaie.VIREMENT,
          datePaie: '2026-07-18',
          sousType: SousType.AVIS_DEBIT_VIREMENT,
        })
        .expect(201);

      expect(res.body.statut).toBe('en_attente_confirmation_paiement');

      // Issue 1 : insertion de la facture source retrouvée.
      const res2 = await request(http)
        .put(`/factures/${res.body.id}`)
        .set(auth())
        .send({
          factNum: 'F-2026-300',
          designation: 'ACHAT',
          dateFac: '2026-07-15',
          libFrss: 'FOURNISSEUR RETROUVE',
        })
        .expect(200);

      expect(res2.body.statut).not.toBe('en_attente_confirmation_paiement');
    });

    it('confirme une ligne orpheline sans facture source (issue 2)', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 45,
          taux: 0.1,
          idPaie: IdPaie.VIREMENT,
          datePaie: '2026-07-22',
          sousType: SousType.RELEVE_BANCAIRE,
        })
        .expect(201);

      expect(res.body.statut).toBe('en_attente_confirmation_paiement');

      const res2 = await request(http)
        .post(`/factures/${res.body.id}/confirmer-sans-facture`)
        .set(auth())
        .expect(201);

      expect(res2.body.statut).toBe('validee');
    });

    it('refuse confirmer-sans-facture sur une ligne qui n\'est pas orpheline', async () => {
      const res = await request(http)
        .post('/factures')
        .set(auth())
        .send({
          factNum: 'F-2026-400',
          mTtc: 200,
          taux: 0.2,
          iceFrs: '001111222233334',
          libFrss: 'FOURNISSEUR NORMAL',
          dateFac: '2026-07-01',
          sousType: SousType.FACTURE_FOURNISSEUR,
        })
        .expect(201);

      await request(http)
        .post(`/factures/${res.body.id}/confirmer-sans-facture`)
        .set(auth())
        .expect(400);
    });

    it('une désignation nouvelle déclenche le workflow de confirmation IA', async () => {
      await request(http)
        .post('/factures')
        .set(auth())
        .send({
          mTtc: 60,
          taux: 0.2,
          designation: 'FRAIS EXCEPTIONNEL INCONNU',
          sousType: SousType.NOTE_DE_FRAIS,
        })
        .expect(201);

      const res = await request(http)
        .get('/designations/en-attente')
        .set(auth())
        .expect(200);

      const libelles = res.body.map((d: any) => d.libelle);
      expect(libelles).toContain('FRAIS EXCEPTIONNEL INCONNU');
    });

    it('confirme une désignation en attente', async () => {
      const enAttente = await request(http)
        .get('/designations/en-attente')
        .set(auth())
        .expect(200);
      const cible = enAttente.body.find(
        (d: any) => d.libelle === 'FRAIS EXCEPTIONNEL INCONNU',
      );
      expect(cible).toBeDefined();

      await request(http)
        .post(`/designations/${cible.id}/confirmer`)
        .set(auth())
        .expect(201);

      const apres = await request(http)
        .get('/designations/en-attente')
        .set(auth())
        .expect(200);
      expect(apres.body.find((d: any) => d.id === cible.id)).toBeUndefined();
    });

    it('GET /designations retourne le référentiel seed (5 valeurs réelles)', async () => {
      const res = await request(http).get('/designations').set(auth()).expect(200);
      const libelles = res.body.map((d: any) => d.libelle);
      expect(libelles).toEqual(
        expect.arrayContaining(['COMMISSION', 'SERVICE', 'GASOIL', 'ACHAT', 'RECEVEUR DOUANE']),
      );
    });

    it('GET /factures/:id sur un id inexistant retourne 404', async () => {
      await request(http).get('/factures/999999').set(auth()).expect(404);
    });
  });
});
