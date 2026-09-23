import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DesignationsService } from '../src/designations/designations.service';
import { SousType } from '../src/common/types';

/**
 * Couche de compatibilité avec le frontend waraqa-hub-main (Lovable) —
 * routes additives (login/register/me, ?mois=, PATCH, /valider,
 * /journal, /snapshots/synthese) qui n'existaient pas dans le contrat
 * backend d'origine. Voir `architecture/mapping-frontend-backend.md`
 * dans le projet claude.ai pour le tableau de correspondance complet.
 */
describe('Compatibilité frontend waraqa-hub-main (e2e)', () => {
  let app: INestApplication;
  let http: any;
  let token: string;

  beforeAll(async () => {
    process.env.WARAQA_DB_PATH = ':memory:';
    process.env.WARAQA_JWT_SECRET = 'secret-test-compat-e2e';
    delete process.env.WARAQA_IA_MODE;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    http = app.getHttpServer();

    await app.get(DesignationsService).initialiserSeed();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth — alias login/register/me', () => {
    const email = `compat-${Date.now()}@fem.ma`;

    it('POST /auth/register retourne { access_token, utilisateur } (snake_case)', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({ nom: 'Compat Test', email, motDePasse: 'motdepasse123' })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.utilisateur.email).toBe(email);
      expect(res.body.utilisateur.cle_api_anthropic).toBeNull();
      token = res.body.access_token;
    });

    it('POST /auth/login authentifie avec les mêmes identifiants', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email, motDePasse: 'motdepasse123' })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
    });

    it('GET /auth/me retourne le profil au format compat', async () => {
      const res = await request(http)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.email).toBe(email);
      expect(res.body.cle_api_anthropic).toBeNull();
    });

    it('les routes originales /auth/inscription et /auth/connexion restent inchangées', async () => {
      const res = await request(http)
        .post('/auth/connexion')
        .send({ email, motDePasse: 'motdepasse123' })
        .expect(200);
      // Contrat d'origine : accessToken en camelCase, pas access_token.
      expect(res.body.accessToken).toBeDefined();
    });
  });

  describe('Factures — filtre ?mois, PATCH, /valider', () => {
    let factureId: number;

    beforeAll(async () => {
      const res = await request(http)
        .post('/factures')
        .set('Authorization', `Bearer ${token}`)
        .send({
          factNum: 'F-COMPAT-001',
          designation: 'ACHAT',
          mTtc: 1200,
          taux: 0.2,
          iceFrs: '001234567000099',
          libFrss: 'FOURNISSEUR COMPAT',
          dateFac: '2026-09-15',
          sousType: SousType.FACTURE_FOURNISSEUR,
        })
        .expect(201);
      factureId = res.body.id;
    });

    it('GET /factures?mois=2026-09 retourne la ligne créée avec dateFac de septembre', async () => {
      const res = await request(http)
        .get('/factures?mois=2026-09')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.some((f: any) => f.id === factureId)).toBe(true);
    });

    it('GET /factures?mois=2026-01 ne retourne pas la ligne (mois différent)', async () => {
      const res = await request(http)
        .get('/factures?mois=2026-01')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.some((f: any) => f.id === factureId)).toBe(false);
    });

    it('GET /factures sans ?mois reste inchangé (toutes les lignes)', async () => {
      const res = await request(http)
        .get('/factures')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.some((f: any) => f.id === factureId)).toBe(true);
    });

    it('PATCH /factures/:id se comporte comme PUT /factures/:id', async () => {
      const res = await request(http)
        .patch(`/factures/${factureId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ libFrss: 'FOURNISSEUR COMPAT MODIFIE' })
        .expect(200);
      expect(res.body.libFrss).toBe('FOURNISSEUR COMPAT MODIFIE');
    });

    it("POST /factures/:id/valider journalise une validation humaine sans modifier la ligne", async () => {
      const avant = await request(http)
        .get(`/factures/${factureId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(http)
        .post(`/factures/${factureId}/valider`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.id).toBe(factureId);
      expect(res.body.statut).toBe(avant.body.statut); // inchangé

      const journal = await request(http)
        .get('/journal')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        journal.body.some(
          (j: any) => j.factureId === factureId && j.action === 'validation_humaine',
        ),
      ).toBe(true);
    });
  });

  describe('GET /journal', () => {
    it('nécessite une authentification', async () => {
      await request(http).get('/journal').expect(401);
    });

    it('retourne une liste triée (horodatage croissant)', async () => {
      const res = await request(http)
        .get('/journal')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const horodatages = res.body.map((j: any) => j.horodatage);
      const trie = [...horodatages].sort();
      expect(horodatages).toEqual(trie);
    });
  });

  describe('GET /snapshots/synthese', () => {
    it('agrège les totaux HT/TVA/TTC et la répartition par statut', async () => {
      await request(http)
        .post('/factures')
        .set('Authorization', `Bearer ${token}`)
        .send({
          mTtc: 240,
          taux: 0.2,
          designation: 'GASOIL',
          sousType: SousType.NOTE_DE_FRAIS,
          dateFac: '2026-09-10',
        })
        .expect(201);

      const res = await request(http)
        .get('/snapshots/synthese?mois=2026-09')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.mois).toBe('2026-09');
      expect(res.body.lignes_total).toBeGreaterThan(0);
      expect(res.body.total_ttc).toBeGreaterThan(0);
      expect(res.body.par_statut).toBeDefined();
      expect(res.body.en_erreur).toBe(0);
      expect(res.body.dernier_snapshot).toBeNull();
    });
  });

  describe('GET/PUT /reglages', () => {
    it('nécessite une authentification', async () => {
      await request(http).get('/reglages').expect(401);
    });

    it('GET crée la ligne avec les valeurs par défaut au premier accès', async () => {
      const res = await request(http)
        .get('/reglages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({
        frequence_snapshot: 'fin_de_mois',
        notif_push_web: true,
        notif_email: true,
      });
    });

    it('PUT modifie uniquement les champs fournis (sémantique PATCH partielle)', async () => {
      const res = await request(http)
        .put('/reglages')
        .set('Authorization', `Bearer ${token}`)
        .send({ frequence_snapshot: 'hebdomadaire', notif_email: false })
        .expect(200);
      expect(res.body).toEqual({
        frequence_snapshot: 'hebdomadaire',
        notif_push_web: true,
        notif_email: false,
      });
    });

    it('GET reflète la modification persistée', async () => {
      const res = await request(http)
        .get('/reglages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.frequence_snapshot).toBe('hebdomadaire');
      expect(res.body.notif_email).toBe(false);
    });

    it('rejette un champ non whitelisté ou une valeur de fréquence invalide', async () => {
      await request(http)
        .put('/reglages')
        .set('Authorization', `Bearer ${token}`)
        .send({ frequence_snapshot: 'quotidien' })
        .expect(400);
      await request(http)
        .put('/reglages')
        .set('Authorization', `Bearer ${token}`)
        .send({ champInconnu: true })
        .expect(400);
    });

    it('les réglages sont isolés par utilisateur', async () => {
      const autreEmail = `compat-reglages-${Date.now()}@fem.ma`;
      const inscription = await request(http)
        .post('/auth/register')
        .send({ nom: 'Autre Compat', email: autreEmail, motDePasse: 'motdepasse123' })
        .expect(201);
      const autreToken = inscription.body.access_token;

      const res = await request(http)
        .get('/reglages')
        .set('Authorization', `Bearer ${autreToken}`)
        .expect(200);
      expect(res.body.frequence_snapshot).toBe('fin_de_mois'); // valeurs par défaut, pas celles de `token`
    });
  });
});
