/**
 * Gros classeur joint au chat (plan L3.1) : plus de refus « 50 000 caractères ». Le modèle reçoit
 * un index et un aperçu, puis lit des plages avec couverture explicite. Client Anthropic simulé.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { IaGateway } from '../src/ocr/ia-gateway';

const KEY = 'sk-ant-api03-TESTONLY' + 'y'.repeat(40) + 'WB01';
const M = '2026-07';
describe('Classeur volumineux dans le chat', () => {
  let app: INestApplication, dir: string, token = '';
  const calls: any[] = [];
  let docId = '';
  const fake = {
    models: { retrieve: jest.fn(async (id: string) => ({ id, display_name: 'Simulé' })) },
    messages: { create: jest.fn(async (params: any) => {
      calls.push(params);
      const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      if (!params.tools) return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'OK' }] };
      const last = params.messages[params.messages.length - 1];
      const results = Array.isArray(last.content) ? last.content.filter((b: any) => b.type === 'tool_result') : [];
      if (!results.length) return { stop_reason: 'tool_use', usage, content: [
        { type: 'tool_use', id: 'i1', name: 'lire_classeur', input: { id: docId } },
        { type: 'tool_use', id: 'p1', name: 'lire_plage', input: { id: docId, debut: 1, nombre: 200 } },
        { type: 'tool_use', id: 'p2', name: 'lire_piece', input: { id: docId } },
      ] };
      const plage = JSON.parse(results[1].content);
      return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: `Classeur lu : ${plage.couvert}/${plage.total} lignes, reste ${plage.reste}.` }] };
    }) },
  };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-wb-'));
    await writeFile(join(dir, '.env'), 'WARAQA_JWT_SECRET=x\nANTHROPIC_API_KEY=\n');
    Object.assign(process.env, { WARAQA_DB_PATH: join(dir, 'db.sqlite'), WARAQA_FILES_PATH: join(dir, 'files'), WARAQA_ENV_PATH: join(dir, '.env'), ANTHROPIC_API_KEY: '' });
    IaGateway.testClientFactory = () => fake;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.setGlobalPrefix('api'); await app.init();
    token = (await request(app.getHttpServer()).post('/api/auth/inscription').send({ nom: 'Admin', email: 'wb@example.test', motDePasse: 'WorkbookTest2026!' }).expect(201)).body.accessToken;
    await auth(api().put('/api/workspace/ai/key')).send({ key: KEY }).expect(200);
    await auth(api().put('/api/workspace/settings')).send({ ai: { mode: 'live', effort: 'low' }, company: { name: 'Finder Electronic Morocco', iff: '12345678' } }).expect(200);
  });
  afterAll(async () => {
    IaGateway.testClientFactory = null; await app?.close(); await rm(dir, { recursive: true, force: true });
    for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH', 'WARAQA_ENV_PATH', 'ANTHROPIC_API_KEY']) delete process.env[k];
  });
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);

  it('un CSV de plus de 50 000 caractères est accepté : index + aperçu, puis lecture par plages', async () => {
    const rows = ['OR;FACT_NUM;DESIGNATION;M_HT;TVA;M_TTC;IF;LIB_FRSS;ICE_FRS;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC'];
    for (let i = 1; i <= 1500; i++) rows.push(`${i};HIST-${i};ACHAT;100;20;120;123;Fournisseur ${i};001234567000012;0.2;4;2025-${String((i % 6) + 1).padStart(2, '0')}-10;2025-${String((i % 6) + 1).padStart(2, '0')}-01`);
    const csv = Buffer.from(rows.join('\n'));
    expect(csv.length).toBeGreaterThan(50000);
    const d = (await auth(api().post('/api/workspace/documents?reuse=true')).attach('file', csv, '07_Classeurs_EDI_TVA_historiques/TVA_2025.csv').expect(201)).body;
    docId = d.id;
    expect(d.data.role).toBe('historique'); expect(d.data.invoiceIds).toEqual([]);
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Lis ce classeur en entier', documentIds: [docId] }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.mode).toBe('live');
    expect(reply.content).toBe('Classeur lu : 200/1501 lignes, reste 1301.');
    // Le message utilisateur transmis contient l'index et un aperçu, jamais le classeur entier.
    const userBlocks = calls[1].messages[0].content;
    const joined = userBlocks.map((b: any) => b.text || '').join('\n');
    expect(joined).toContain('Index du classeur'); expect(joined).toMatch(/historique/i); expect(joined).toContain('Aperçu des 25 premières lignes');
    expect(joined.length).toBeLessThan(15000);
    expect(reply.result.sources.map((s: any) => s.name)).toEqual(['lire_classeur', 'lire_plage', 'lire_piece']);
    expect(reply.result.sources[1].summary).toContain('reste 1301');
    expect(reply.result.sources[2].summary).toContain('TVA_2025.csv');
  });
});
