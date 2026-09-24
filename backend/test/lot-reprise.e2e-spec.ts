/**
 * Import durable (plan L2.5) et manifeste avant traitement (plan L2.2) : un lot interrompu reprend
 * depuis sa dernière entrée sans rejouer les pièces déjà traitées ; le ZIP est conservé et sauvegardé.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { zipSync, strToU8 } from 'fflate';
import { gunzipSync } from 'zlib';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';

const T5 = 'OR;FACT_NUM;DESIGNATION;M_TTC;IF;LIB_FRSS;ICE_FRS;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC';
const row = (i: number) => `${i};R-${i};ACHAT;120;12345678;Fournisseur ${i};001234567000012;20;4;2026-07-10;2026-07-03`;
describe('Import en lot durable et manifeste', () => {
  let app: INestApplication, dir: string, token: string, service: UnifiedService, user: any;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const zip = () => Buffer.from(zipSync({ 'Juillet/a.csv': strToU8([T5, row(1)].join('\n')), 'Juillet/b.csv': strToU8([T5, row(2)].join('\n')), 'Juillet/99_Verite_terrain/c.csv': strToU8([T5, row(3)].join('\n')) }));
  const wait = async (id: string) => { for (let i = 0; i < 200; i++) { const l = (await auth(api().get('/api/workspace/imports/' + id))).body; if (l.data.status !== 'en_cours') return l.data; await new Promise(r => setTimeout(r, 50)); } throw new Error('lot trop long'); };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-lot-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-lot';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init();
    service = app.get(UnifiedService);
    const r = await api().post('/api/auth/inscription').send({ nom: 'Admin', email: 'lot@example.test', motDePasse: 'LotTest2026!' }).expect(201);
    token = r.body.accessToken; user = { sub: r.body.utilisateur.id, nom: 'Admin' };
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('manifeste avant traitement : rôles prévus et exclusions, rien de stocké', async () => {
    const m = (await auth(api().post('/api/workspace/imports/zip?dryRun=true')).attach('file', zip(), 'juillet.zip').expect(201)).body;
    expect(m).toEqual(expect.objectContaining({ total: 3, candidatsPieces: 2, references: 1, parRole: { piece_comptable: 2, evaluation: 1 } }));
    expect((await auth(api().get('/api/workspace/documents')).expect(200)).body).toHaveLength(0);
    expect((await auth(api().get('/api/workspace/imports')).expect(200)).body).toHaveLength(0);
  });
  it('le lot conserve son archive, annonce les rôles prévus, et une interruption reprend sans rejouer', async () => {
    const lot = (await auth(api().post('/api/workspace/imports/zip')).attach('file', zip(), 'juillet.zip').expect(201)).body;
    expect(lot.data.origin).toEqual({ type: 'zip', file: lot.id + '.zip' });
    expect(lot.data.items.map((x: any) => x.rolePrevu)).toEqual(['evaluation', 'piece_comptable', 'piece_comptable']); // entrées triées par nom
    const done = await wait(lot.id);
    expect(done.status).toBe('termine'); expect(done.processed).toBe(3); expect(done.lines).toBe(2);
    expect(await readdir(join(dir, 'lots'))).toEqual([lot.id + '.zip']);
    // Simulation d'un arrêt du serveur après la première entrée : état persisté « en_cours », deux entrées en attente.
    const rec = await service.get(lot.id, 'import_lot');
    rec.data.status = 'en_cours'; rec.data.processed = 1;
    rec.data.items[1] = { ...rec.data.items[1], state: 'en_cours', documentId: null, lines: 0 };
    rec.data.items[2] = { ...rec.data.items[2], state: 'en_attente', documentId: null, lines: 0 };
    const firstDoc = rec.data.items[0].documentId;
    await service.save(lot.id, 'import_lot', rec.data);
    const linesBefore = (await auth(api().get('/api/factures')).expect(200)).body.length;
    expect(await service.recoverLots()).toEqual([lot.id]);
    const resumed = await wait(lot.id);
    expect(resumed.status).toBe('termine'); expect(resumed.reprises).toBe(1); expect(resumed.processed).toBe(3);
    expect(resumed.items[0].documentId).toBe(firstDoc); // jamais rejouée
    expect(resumed.items[1].state).toBe('deja_importe'); // même fichier déjà connu : reconnu, pas dupliqué
    expect(resumed.items[2].state).toBe('deja_importe');
    expect((await auth(api().get('/api/factures')).expect(200)).body.length).toBe(linesBefore);
    // Lot sans origine conservée : signalé interrompu, reprise manuelle refusée avec explication.
    await service.save('lot-ancien', 'import_lot', { source: 'zip', label: 'ancien', status: 'en_cours', total: 1, processed: 0, items: [{ name: 'x.pdf', state: 'en_attente' }], skipped: [], author: 'Admin', authorId: user.sub, createdAt: new Date().toISOString() });
    expect(await service.recoverLots()).toEqual([]);
    expect((await service.get('lot-ancien', 'import_lot')).data.status).toBe('interrompu');
    await auth(api().post('/api/workspace/imports/lot-ancien/reprendre')).expect(400);
    await auth(api().post(`/api/workspace/imports/${lot.id}/reprendre`)).expect(409);
    // Sauvegarde : l'archive du lot est incluse.
    const data = JSON.parse(gunzipSync(await service.backup(user)).toString());
    expect(Object.keys(data.files)).toContain('lots/' + lot.id + '.zip');
  });
});
