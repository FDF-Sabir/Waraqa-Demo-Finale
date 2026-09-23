import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DesignationsService } from '../src/designations/designations.service';

describe('OCR — dépôt de fichier → extraction IA → facture (e2e, mode mock)', () => {
  let app: INestApplication;
  let http: any;
  let token: string;

  beforeAll(async () => {
    process.env.WARAQA_DB_PATH = ':memory:';
    process.env.WARAQA_JWT_SECRET = 'secret-test-ocr-e2e';
    // WARAQA_IA_MODE volontairement non défini → mode mock par défaut,
    // aucun appel réseau réel pendant les tests.
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

    const res = await request(http)
      .post('/auth/inscription')
      .send({ nom: 'Testeur OCR', email: `ocr-${Date.now()}@fem.ma`, motDePasse: 'motdepasse123' })
      .expect(201);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuse une requête sans fichier', async () => {
    await request(http)
      .post('/ocr/traiter')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('refuse une requête sans authentification', async () => {
    await request(http)
      .post('/ocr/traiter')
      .attach('fichier', Buffer.from('contenu'), 'facture.jpg')
      .expect(401);
  });

  it('traite une image de facture fournisseur (mock) et crée la ligne Tableau5 correspondante', async () => {
    const res = await request(http)
      .post('/ocr/traiter')
      .set('Authorization', `Bearer ${token}`)
      .attach('fichier', Buffer.from('fake-image-bytes'), 'facture_test.jpg')
      .expect(201);

    expect(res.body.sousType).toBe('facture_fournisseur');
    expect(res.body.facturesCreees).toHaveLength(1);

    const facture = res.body.facturesCreees[0];
    expect(facture.mHt).toBeDefined();
    expect(facture.tva).toBeDefined();
    // Vérifie le calcul serveur-only : mHt + tva doit reconstituer mTtc.
    expect(facture.mHt + facture.tva).toBeCloseTo(facture.mTtc, 1);
  });

  it('traite un CSV de relevé bancaire (mock) et crée une ligne COMMISSION', async () => {
    const res = await request(http)
      .post('/ocr/traiter')
      .set('Authorization', `Bearer ${token}`)
      .attach('fichier', Buffer.from('date,montant\n2026-07-01,45.5'), 'releve_bancaire_bmce.csv')
      .expect(201);

    expect(res.body.sousType).toBe('releve_bancaire');
    expect(res.body.facturesCreees.length).toBeGreaterThan(0);
  });

  it("la ligne créée depuis l'extraction IA est bien tracée dans le journal avec l'auteur réel", async () => {
    const res = await request(http)
      .post('/ocr/traiter')
      .set('Authorization', `Bearer ${token}`)
      .attach('fichier', Buffer.from('fake'), 'notedefrais.jpg')
      .expect(201);

    const factureId = res.body.facturesCreees[0].id;
    const facture = await request(http)
      .get(`/factures/${factureId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(facture.body.saisiPar).toBe('Testeur OCR');
  });
});
