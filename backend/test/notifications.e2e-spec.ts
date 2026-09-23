import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DesignationsService } from '../src/designations/designations.service';
import { SousType } from '../src/common/types';

/**
 * Notifications actionnables (#14, services-a-developper.md) — vue par
 * utilisateur au-dessus des entrées de journal `notifiable: true`, avec état
 * lu/traité par utilisateur (jamais écrit sur le journal lui-même, immuable).
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let http: any;
  let token: string;
  let autreToken: string;

  beforeAll(async () => {
    process.env.WARAQA_DB_PATH = ':memory:';
    process.env.WARAQA_JWT_SECRET = 'secret-test-notifications-e2e';
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

    const inscription = await request(http)
      .post('/auth/inscription')
      .send({
        nom: 'Testeur Notif',
        email: `notif-${Date.now()}@fem.ma`,
        motDePasse: 'motdepasse123',
      })
      .expect(201);
    token = inscription.body.accessToken;

    const autreInscription = await request(http)
      .post('/auth/inscription')
      .send({
        nom: 'Autre Testeur Notif',
        email: `notif-autre-${Date.now()}@fem.ma`,
        motDePasse: 'motdepasse123',
      })
      .expect(201);
    autreToken = autreInscription.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(t = token) {
    return { Authorization: `Bearer ${t}` };
  }

  it('nécessite une authentification', async () => {
    await request(http).get('/notifications').expect(401);
  });

  it('un doublon détecté produit une notification non lue', async () => {
    const payload = {
      factNum: 'F-2026-NOTIF-001',
      mTtc: 555,
      taux: 0.2,
      iceFrs: '001122334400055',
      libFrss: 'FOURNISSEUR NOTIF',
      sousType: SousType.FACTURE_FOURNISSEUR,
      dateFac: '2026-09-01',
    };
    await request(http).post('/factures').set(auth()).send(payload).expect(201);
    const doublon = await request(http).post('/factures').set(auth()).send(payload).expect(201);
    expect(doublon.body.notifiable).toBe(true);

    const notifications = await request(http).get('/notifications').set(auth()).expect(200);
    const celleDuDoublon = notifications.body.find(
      (n: any) => n.factureId === doublon.body.id,
    );
    expect(celleDuDoublon).toBeDefined();
    expect(celleDuDoublon.lue).toBe(false);
    expect(celleDuDoublon.traitee).toBe(false);
  });

  it('marquer-lue puis marquer-traitee persistent un état par utilisateur, pas globalement', async () => {
    const payload = {
      factNum: 'F-2026-NOTIF-002',
      mTtc: 720,
      taux: 0.2,
      iceFrs: '009900112233044',
      libFrss: 'FOURNISSEUR NOTIF 2',
      sousType: SousType.FACTURE_FOURNISSEUR,
      dateFac: '2026-09-02',
    };
    await request(http).post('/factures').set(auth()).send(payload).expect(201);
    const doublon = await request(http).post('/factures').set(auth()).send(payload).expect(201);

    const avant = await request(http).get('/notifications').set(auth()).expect(200);
    const notif = avant.body.find((n: any) => n.factureId === doublon.body.id);
    expect(notif).toBeDefined();

    const lue = await request(http)
      .post(`/notifications/${notif.id}/marquer-lue`)
      .set(auth())
      .expect(201);
    expect(lue.body.lue).toBe(true);
    expect(lue.body.traitee).toBe(false);

    const traitee = await request(http)
      .post(`/notifications/${notif.id}/marquer-traitee`)
      .set(auth())
      .expect(201);
    expect(traitee.body.lue).toBe(true);
    expect(traitee.body.traitee).toBe(true);

    // Un autre utilisateur voit la même notification (source commune : le
    // journal), mais avec son propre état, non affecté par le premier.
    const vuParAutre = await request(http).get('/notifications').set(auth(autreToken)).expect(200);
    const memeNotifPourAutre = vuParAutre.body.find((n: any) => n.id === notif.id);
    expect(memeNotifPourAutre).toBeDefined();
    expect(memeNotifPourAutre.lue).toBe(false);
    expect(memeNotifPourAutre.traitee).toBe(false);
  });

  it('?non_lues=true ne retourne que les notifications non lues de cet utilisateur', async () => {
    const payload = {
      factNum: 'F-2026-NOTIF-003',
      mTtc: 810,
      taux: 0.2,
      iceFrs: '007766554433022',
      libFrss: 'FOURNISSEUR NOTIF 3',
      sousType: SousType.FACTURE_FOURNISSEUR,
      dateFac: '2026-09-03',
    };
    await request(http).post('/factures').set(auth()).send(payload).expect(201);
    const doublon = await request(http).post('/factures').set(auth()).send(payload).expect(201);

    const toutes = await request(http).get('/notifications').set(auth()).expect(200);
    const nonLues = await request(http)
      .get('/notifications?non_lues=true')
      .set(auth())
      .expect(200);

    expect(nonLues.body.length).toBeLessThanOrEqual(toutes.body.length);
    expect(nonLues.body.every((n: any) => n.lue === false)).toBe(true);
    expect(nonLues.body.some((n: any) => n.factureId === doublon.body.id)).toBe(true);
  });

  it('une désignation proposée par l\'IA produit aussi une notification', async () => {
    await request(http)
      .post('/factures')
      .set(auth())
      .send({
        mTtc: 480,
        taux: 0.2,
        designation: 'DESIGNATION NOTIF INEDITE',
        sousType: SousType.NOTE_DE_FRAIS,
        dateFac: '2026-09-04',
      })
      .expect(201);

    const notifications = await request(http).get('/notifications').set(auth()).expect(200);
    expect(
      notifications.body.some((n: any) => n.action === 'designation_suggeree_ia'),
    ).toBe(true);
  });

  it('marquer-lue sur une notification inexistante renvoie 404', async () => {
    await request(http).post('/notifications/999999/marquer-lue').set(auth()).expect(404);
  });
});
