/**
 * Orchestrateur fiable (plan L4.2–L4.5) : missions persistées, idempotence des actions, provenance
 * et version des corrections, bilan structuré, réservation de budget. Client Anthropic simulé.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { IaGateway } from '../src/ocr/ia-gateway';
import { UnifiedService } from '../src/unified/unified.service';
import { FacturesService } from '../src/factures/factures.service';
import { SousType } from '../src/common/types';

const KEY = 'sk-ant-api03-TESTONLY' + 'z'.repeat(40) + 'MI01';
const M = '2026-06';
describe('Missions, idempotence, provenance et budget', () => {
  let app: INestApplication, dir: string, token = '', service: UnifiedService, target = 0, version = 0, docId = '';
  let scenario: 'double' | 'stale' = 'double';
  const fake = {
    models: { retrieve: jest.fn(async (id: string) => ({ id, display_name: 'Simulé' })) },
    messages: { create: jest.fn(async (params: any) => {
      const usage = { input_tokens: 500, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      if (!params.tools) return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'OK' }] };
      const last = params.messages[params.messages.length - 1];
      const results = Array.isArray(last.content) ? last.content.filter((b: any) => b.type === 'tool_result') : [];
      if (!results.length) {
        const correction = { factureId: target, champs: { designation: 'ACHAT CORRIGE' }, justification: 'Désignation lue sur la pièce', source: { type: 'piece', documentId: docId, reference: 'ligne 2 du CSV' }, expectedVersion: scenario === 'stale' ? version - 1 : version };
        return { stop_reason: 'tool_use', usage, content: [
          { type: 'tool_use', id: 'c1', name: 'corriger_ligne', input: correction },
          { type: 'tool_use', id: 'c2', name: 'corriger_ligne', input: correction },
          { type: 'tool_use', id: 'f1', name: 'generer_fichier', input: { format: 'json', scope: 'all' } },
          { type: 'tool_use', id: 'm1', name: 'etat_mission', input: {} },
        ] };
      }
      const outcomes = results.map((r: any) => r.content.slice(0, 60)).join(' | ');
      return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Fait. ' + outcomes }] };
    }) },
  };
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-missions-'));
    await writeFile(join(dir, '.env'), 'WARAQA_JWT_SECRET=x\nANTHROPIC_API_KEY=\n');
    Object.assign(process.env, { WARAQA_DB_PATH: join(dir, 'db.sqlite'), WARAQA_FILES_PATH: join(dir, 'files'), WARAQA_ENV_PATH: join(dir, '.env'), ANTHROPIC_API_KEY: '' });
    IaGateway.testClientFactory = () => fake;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.setGlobalPrefix('api'); await app.init();
    service = app.get(UnifiedService);
    const r = await api().post('/api/auth/inscription').send({ nom: 'Admin', email: 'missions@example.test', motDePasse: 'MissionsTest2026!' }).expect(201);
    token = r.body.accessToken;
    await auth(api().put('/api/workspace/ai/key')).send({ key: KEY }).expect(200);
    await auth(api().put('/api/workspace/settings')).send({ ai: { mode: 'live', effort: 'low' }, company: { name: 'Société Test', iff: '12345678' } }).expect(200);
    const user = { sub: r.body.utilisateur.id, nom: 'Admin' };
    const csv = Buffer.from(`FACT_NUM;LIB_FRSS;ICE_FRS;IF;DESIGNATION;M_TTC;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC\nMI-1;Fournisseur;001234567000012;12345678;ACHAT;1200;20;4;${M}-05;${M}-02`);
    const doc = await service.upload({ originalname: 'pieces.csv', size: csv.length, buffer: csv } as any, user);
    docId = doc.id; target = doc.data.invoiceIds[0];
    version = (await app.get(FacturesService).trouver(target)).version;
  });
  afterAll(async () => {
    IaGateway.testClientFactory = null; await app?.close(); await rm(dir, { recursive: true, force: true });
    for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH', 'WARAQA_ENV_PATH', 'ANTHROPIC_API_KEY']) delete process.env[k];
  });

  it('une action répétée n’est exécutée qu’une fois ; la mission est persistée avec ses étapes, actions et fichiers', async () => {
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Corrige la désignation et livre le JSON' }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.mode).toBe('live');
    expect(reply.result.executees.map((e: any) => e.outil)).toEqual(['corriger_ligne', 'generer_fichier']);
    expect(reply.result.executees[0].resume).toContain('d’après piece « pieces.csv » (ligne 2 du CSV)');
    expect(reply.result.bilan).toEqual(expect.objectContaining({ actions: 2, fichiers: 1, propositions: 0, outils: ['corriger_ligne', 'generer_fichier', 'etat_mission'] }));
    expect(reply.result.missionId).toMatch(/^mission-/);
    const journal = (await auth(api().get('/api/journal')).expect(200)).body;
    const corrections = journal.filter((j: any) => j.action === 'correction_agent');
    expect(corrections).toHaveLength(1);
    const details = JSON.parse(corrections[0].details);
    expect(details.source).toEqual(expect.objectContaining({ type: 'piece', nom: 'pieces.csv', reference: 'ligne 2 du CSV', coherente: true }));
    expect(details.versionLue).toBe(version);
    const missions = (await auth(api().get('/api/workspace/missions')).expect(200)).body;
    expect(missions).toHaveLength(1);
    expect(missions[0]).toEqual(expect.objectContaining({ id: reply.result.missionId, status: 'terminee', conversationId: c.id, question: 'Corrige la désignation et livre le JSON', actions: 0, calls: 2 }));
    expect(missions[0].executees).toHaveLength(2); expect(missions[0].livrables).toHaveLength(1); expect(missions[0].costUsd).toBeGreaterThan(0);
    expect(missions[0].outils.map((o: any) => o.nom)).toEqual(['corriger_ligne', 'corriger_ligne', 'generer_fichier', 'etat_mission']);
    // La mission en cours était déjà visible pour l'outil etat_mission (checkpoint avant la réponse finale).
    expect(reply.result.sources.find((s: any) => s.name === 'etat_mission').summary).toBe('1 mission(s)');
  });
  it('une version périmée est refusée : aucune écriture, cause explicite', async () => {
    scenario = 'stale';
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Recorrige' }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.result.executees.map((e: any) => e.outil)).toEqual(['generer_fichier']);
    expect(reply.result.sources[0].summary).toContain('modifiée depuis sa lecture');
    expect((await app.get(FacturesService).trouver(target)).version).toBe(version + 1);
  });
  it('le budget mensuel tient compte des réservations : un appel qui dépasserait le plafond est refusé avant d’être lancé', async () => {
    await auth(api().put('/api/workspace/settings')).send({ ai: { monthlyBudgetUsd: 0.01 } }).expect(200);
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const calls = fake.messages.create.mock.calls.length;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Encore', noCache: true }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.mode).toBe('error'); expect(reply.content).toContain('Budget IA mensuel atteint');
    expect(fake.messages.create.mock.calls.length).toBe(calls);
    const missions = (await auth(api().get('/api/workspace/missions?conversationId=' + c.id)).expect(200)).body;
    expect(missions[0].status).toBe('echouee'); expect(missions[0].erreur).toContain('Budget');
    expect((service as any).reservedUsd).toBe(0);
  });
});
