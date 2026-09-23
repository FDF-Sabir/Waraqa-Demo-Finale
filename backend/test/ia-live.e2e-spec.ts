/**
 * Parcours IA connecté complet avec un client Anthropic SIMULÉ (aucun appel réseau) :
 * clé enregistrée depuis l'interface, test de connexion, chat avec outils, cache des
 * réponses, propositions d'action, budget, extraction d'une pièce et suppression de clé.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { IaGateway } from '../src/ocr/ia-gateway';
import { UnifiedService } from '../src/unified/unified.service';

const KEY = 'sk-ant-api03-TESTONLY' + 'x'.repeat(40) + 'K9Z1';
const MONTH = '2026-09';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('IA connectée (client simulé)', () => {
  let app: INestApplication, dir: string, token = '', service: UnifiedService;
  const calls: any[] = [];
  let scenario: 'synthese' | 'action' = 'synthese';
  let actionTarget = 0;
  const fake = {
    models: { retrieve: jest.fn(async (id: string) => ({ id, display_name: 'Claude Sonnet 5 (simulé)' })) },
    messages: {
      create: jest.fn(async (params: any) => {
        calls.push(params);
        const usage = { input_tokens: 1200, output_tokens: 150, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 };
        if (params.output_config?.format) {
          return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify({ sousType: 'facture_fournisseur', confiance: 0.93, lignes: [
            { factNum: 'LIVE-001', libFrss: 'Fournisseur Test', iceFrs: '000111222333444', iff: '00123', designation: 'ACHAT', mTtc: 600, taux: 0.2, dateFac: '2026-09-15', mHt: 999 },
          ] }) }] };
        }
        if (!params.tools) return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'OK' }] };
        const last = params.messages[params.messages.length - 1];
        const answered = Array.isArray(last.content) && last.content.some((b: any) => b.type === 'tool_result');
        if (!answered) {
          const tool = scenario === 'action'
            ? { type: 'tool_use', id: 'tu-' + calls.length, name: 'proposer_action', input: { type: 'ouvrir_ligne', factureId: actionTarget, libelle: 'Compléter la ligne' } }
            : { type: 'tool_use', id: 'tu-' + calls.length, name: 'synthese_mois', input: {} };
          return { stop_reason: 'tool_use', usage, content: [tool] };
        }
        return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: '## Synthèse\n- **6 lignes** sur la période.' }] };
      }),
    },
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-ia-'));
    await writeFile(join(dir, '.env'), 'WARAQA_JWT_SECRET=x\nANTHROPIC_API_KEY=\n');
    Object.assign(process.env, { WARAQA_DB_PATH: join(dir, 'db.sqlite'), WARAQA_FILES_PATH: join(dir, 'files'), WARAQA_ENV_PATH: join(dir, '.env'), ANTHROPIC_API_KEY: '' });
    IaGateway.testClientFactory = () => fake;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api');
    await app.init();
    service = app.get(UnifiedService);
    const r = await request(app.getHttpServer()).post('/api/auth/inscription').send({ nom: 'Admin IA', email: 'ia@example.test', motDePasse: 'AdminIaTest2026!' }).expect(201);
    token = r.body.accessToken;
    await request(app.getHttpServer()).post('/api/workspace/seed').set('Authorization', 'Bearer ' + token).send({ month: MONTH }).expect(201);
  });
  afterAll(async () => {
    IaGateway.testClientFactory = null;
    await app?.close();
    await rm(dir, { recursive: true, force: true });
    for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH', 'WARAQA_ENV_PATH', 'ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']) delete process.env[k];
  });
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);

  it('enregistre la clé depuis les réglages sans jamais la renvoyer', async () => {
    await auth(api().put('/api/workspace/ai/key')).send({ key: 'mauvaise' }).expect(400);
    const r = await auth(api().put('/api/workspace/ai/key')).send({ key: KEY }).expect(200);
    expect(r.body.keyConfigured).toBe(true);
    expect(r.body.keyMask).toBe('sk-ant-…K9Z1');
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    const settings = await auth(api().get('/api/workspace/settings')).expect(200);
    expect(JSON.stringify(settings.body)).not.toContain(KEY);
    expect(settings.body.ai.keyConfigured).toBe(true);
    expect(await readFile(join(dir, '.env'), 'utf8')).toContain('ANTHROPIC_API_KEY=' + KEY);
    const journal = await auth(api().get('/api/journal')).expect(200);
    expect(JSON.stringify(journal.body)).not.toContain(KEY);
  });

  it('teste la connexion (modèle + appel minimal) et comptabilise le coût', async () => {
    const r = await auth(api().post('/api/workspace/ai/test')).expect(201);
    expect(r.body).toEqual(expect.objectContaining({ ok: true, reply: 'OK', model: 'Claude Sonnet 5 (simulé)' }));
    const status = await auth(api().get('/api/workspace/ai')).expect(200);
    expect(status.body.usage.calls).toBe(1);
    expect(status.body.usage.costUsd).toBeGreaterThan(0);
  });

  it('active le mode connecté et répond avec outils, sources et consommation', async () => {
    await auth(api().put('/api/workspace/settings')).send({ ai: { mode: 'live', effort: 'low' } }).expect(200);
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const before = calls.length;
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Fais la synthèse du mois' }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.mode).toBe('live');
    expect(reply.content).toContain('6 lignes');
    expect(reply.result.sources[0]).toEqual(expect.objectContaining({ name: 'synthese_mois' }));
    expect(reply.result.usage.calls).toBe(2);
    expect(reply.result.usage.cacheReadTokens).toBe(1600);
    expect(calls.length - before).toBe(2);
    const first = calls[before];
    expect(first.output_config).toEqual({ effort: 'low' });
    expect(first.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const toolResult = calls[before + 1].messages[2].content[0];
    expect(JSON.parse(toolResult.content).achats.totalTtc).toBe(19090);
  });

  it('réutilise une réponse identique tant que les données ne changent pas', async () => {
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const before = calls.length;
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: '  Fais la SYNTHÈSE du mois ' }).expect(201);
    expect(calls.length).toBe(before);
    expect(r.body.data.messages[1].result.cached).toBeDefined();
    expect(r.body.data.messages[1].result.usage.costUsd).toBe(0);
    const forced = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    await auth(api().post(`/api/workspace/conversations/${forced.body.id}/messages`)).send({ text: 'Fais la synthèse du mois', noCache: true }).expect(201);
    expect(calls.length).toBe(before + 2);
    const invoices = await auth(api().get('/api/factures?mois=' + MONTH)).expect(200);
    const target = invoices.body.find((f: any) => f.factNum === 'DEMO-INC-003');
    await auth(api().patch('/api/factures/' + target.id)).send({ iceFrs: '001234567000099' }).expect(200);
    const again = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const n = calls.length;
    await auth(api().post(`/api/workspace/conversations/${again.body.id}/messages`)).send({ text: 'Fais la synthèse du mois' }).expect(201);
    // Donnée modifiée : l'empreinte change, la réponse en cache n'est plus utilisée.
    expect(calls.length).toBe(n + 2);
  });

  it('les propositions d’action sont affichées, jamais exécutées', async () => {
    const invoices = await auth(api().get('/api/factures?mois=' + MONTH)).expect(200);
    actionTarget = invoices.body.find((f: any) => f.factNum === 'DEMO-INC-003').id;
    scenario = 'action';
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Que dois-je corriger ?', noCache: true }).expect(201);
    expect(r.body.data.messages[1].result.actions).toEqual([expect.objectContaining({ type: 'ouvrir_ligne', factureId: actionTarget })]);
    const progress = await auth(api().get(`/api/workspace/conversations/${c.body.id}/progress`)).expect(200);
    expect(progress.body).toEqual({ busy: false, steps: [] });
    scenario = 'synthese';
  });

  it('extrait une pièce en mode connecté ; montants dérivés recalculés par le serveur', async () => {
    const r = await auth(api().post('/api/workspace/documents')).attach('file', PNG, 'facture-live.png').expect(201);
    expect(r.body.data.mode).toBe('ia_live');
    expect(r.body.data.invoiceIds).toHaveLength(1);
    const f = (await auth(api().get('/api/factures/' + r.body.data.invoiceIds[0])).expect(200)).body;
    expect(f).toEqual(expect.objectContaining({ factNum: 'LIVE-001', mTtc: 600, mHt: 500, tva: 100, iceFrs: '000111222333444', revueHumaine: false }));
    const extraction = calls[calls.length - 1];
    expect(extraction.output_config.format.type).toBe('json_schema');
    expect(extraction.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const status = await auth(api().get('/api/workspace/ai')).expect(200);
    expect(status.body.usage.byFeature.extraction).toBeGreaterThan(0);
  });

  it('bloque les appels au-delà du budget mensuel', async () => {
    const usage = await service.iaUsage();
    await service.save('ia-usage-' + usage.month, 'ia_usage', { ...usage, costUsd: 50 });
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const before = calls.length;
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Autre question', noCache: true }).expect(201);
    expect(r.body.data.messages[1].mode).toBe('error');
    expect(r.body.data.messages[1].content).toContain('Budget IA mensuel atteint');
    expect(calls.length).toBe(before);
    await auth(api().put('/api/workspace/settings')).send({ ai: { monthlyBudgetUsd: 0 } }).expect(400);
  });

  it('supprime la clé et repasse en démo', async () => {
    const r = await auth(api().delete('/api/workspace/ai/key')).expect(200);
    expect(r.body.keyConfigured).toBe(false);
    expect(r.body.mode).toBe('demo');
    expect(await readFile(join(dir, '.env'), 'utf8')).toMatch(/^ANTHROPIC_API_KEY=$/m);
    await auth(api().post('/api/workspace/ai/test')).expect(400);
  });
});
