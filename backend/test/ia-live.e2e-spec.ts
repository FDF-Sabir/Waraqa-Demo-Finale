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
  let scenario: 'synthese' | 'action' | 'agent' | 'worker' = 'synthese';
  let workerTarget = 0;
  let actionTarget = 0;
  let agentIds: number[] = [];
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
          if (scenario === 'worker') return { stop_reason: 'tool_use', usage, content: [
            { type: 'tool_use', id: 'w1-' + calls.length, name: 'corriger_ligne', input: { factureId: workerTarget, champs: { iceFrs: '001234567000077', idPaie: 2 }, justification: 'ICE et chèque lus sur la pièce' } },
            { type: 'tool_use', id: 'w2-' + calls.length, name: 'generer_tableau', input: { format: 'xlsx', mois: MONTH, regrouperPar: 'fournisseur', titre: 'Achats par fournisseur' } },
            { type: 'tool_use', id: 'w3-' + calls.length, name: 'generer_fichier', input: { format: 'json', scope: 'all' } },
            { type: 'tool_use', id: 'w4-' + calls.length, name: 'corriger_ligne', input: { factureId: workerTarget, champs: { mHt: 1 }, justification: 'essai interdit' } },
          ] };
          if (scenario === 'agent') return { stop_reason: 'tool_use', usage, content: [
            { type: 'text', text: 'Analyse du dossier de septembre : lignes complètes à valider, export et snapshot demandés. ' + 'Détail des contrôles effectués sur chaque ligne avant proposition. '.repeat(3) },
            { type: 'tool_use', id: 'a1-' + calls.length, name: 'proposer_action', input: { type: 'valider_lignes', factureIds: agentIds, libelle: 'Valider les lignes conformes' } },
            { type: 'tool_use', id: 'a2-' + calls.length, name: 'proposer_action', input: { type: 'exporter', format: 'json', scope: 'all', libelle: 'Télécharger en JSON' } },
            { type: 'tool_use', id: 'a3-' + calls.length, name: 'proposer_action', input: { type: 'creer_snapshot', libelle: 'Créer le snapshot' } },
            { type: 'tool_use', id: 'a4-' + calls.length, name: 'proposer_action', input: { type: 'cloturer_releve', mois: MONTH, libelle: 'Clôturer' } },
          ] };
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

  it('agent : propose plusieurs actions vérifiées ; chacune s’exécute par sa route habituelle, tracée', async () => {
    const invoices = (await auth(api().get('/api/factures?mois=' + MONTH)).expect(200)).body;
    agentIds = invoices.map((f: any) => f.id);
    scenario = 'agent';
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Valide ce qui est conforme, donne-moi le JSON et fais un snapshot', noCache: true }).expect(201);
    scenario = 'synthese';
    const reply = r.body.data.messages[1];
    expect(reply.content).toContain('Analyse du dossier de septembre');
    const actions = reply.result.actions;
    // Clôture refusée (entreprise sans IF) : seules trois propositions sont retenues.
    expect(actions.map((a: any) => a.type)).toEqual(['valider_lignes', 'exporter', 'creer_snapshot']);
    const valid = invoices.filter((f: any) => f.statut === 'validee' && !f.doublonDe && !f.revueHumaine).map((f: any) => f.id);
    expect(actions[0].factureIds.sort()).toEqual(valid.sort());
    expect(actions[1]).toEqual(expect.objectContaining({ format: 'json', mois: MONTH, scope: 'all' }));
    // Exécution telle que le fait l'interface après confirmation.
    for (const id of actions[0].factureIds) await auth(api().post(`/api/factures/${id}/valider`)).expect(201);
    const json = await auth(api().get('/api/workspace/export')).query({ month: MONTH, format: 'json', scope: 'all', examples: 'true' }).expect(200);
    expect(json.headers['content-type']).toContain('application/json');
    const body = JSON.parse(json.text);
    expect(body.lignes.length).toBeGreaterThan(0);
    expect(body.lignes[0]).toEqual(expect.objectContaining({ id: expect.any(Number), mTtc: expect.any(Number), revueHumaine: expect.any(Boolean) }));
    await auth(api().post('/api/workspace/snapshots')).send({ month: MONTH }).expect(201);
    const journal = JSON.stringify((await auth(api().get('/api/journal')).expect(200)).body);
    expect(journal).toContain('validation_humaine');
    expect(journal).toContain('snapshot_cree');
  });

  it('cache : une réponse n’est plus réutilisée après un import de dossier', async () => {
    const ask = async () => {
      const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
      return (await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Question stable sur le cache' }).expect(201)).body.data.messages[1];
    };
    await ask();
    expect((await ask()).result.cached).toBeDefined();
    const { zipSync, strToU8 } = require('fflate');
    const zip = zipSync({ 'lot/achats.csv': strToU8('FACT_NUM,LIB_FRSS,M_TTC,TAUX,DATE_FAC\nCACHE-1,Cache,120,20%,05/09/2026\n') });
    const lot = await auth(api().post('/api/workspace/imports/zip')).attach('file', Buffer.from(zip), 'lot.zip').expect(201);
    for (let i = 0; i < 100; i++) {
      if ((await auth(api().get('/api/workspace/imports/' + lot.body.id)).expect(200)).body.data.status === 'termine') break;
      await new Promise(r => setTimeout(r, 25));
    }
    expect((await ask()).result.cached).toBeUndefined();
  });

  it('formats d’entrée : WebP lu par l’IA, HEIC refusé avec la conversion à faire', async () => {
    const webp = await auth(api().post('/api/workspace/documents')).attach('file', Buffer.concat([PNG, Buffer.from('webp')]), 'photo-facture.webp').expect(201);
    expect(webp.body.data.mode).toBe('ia_live');
    const extraction = calls[calls.length - 1];
    expect(JSON.stringify(extraction.messages)).toContain('image/webp');
    const heic = await auth(api().post('/api/workspace/documents')).attach('file', PNG, 'IMG_0001.HEIC').expect(400);
    expect(heic.body.message).toContain('JPG');
    const docx = await auth(api().post('/api/workspace/documents')).attach('file', PNG, 'facture.docx').expect(400);
    expect(docx.body.message).toContain('PDF');
  });

  it('agent qui travaille : corrige (avant/après tracés), produit tableau et fichier, jamais mis en cache', async () => {
    const invoices = (await auth(api().get('/api/factures?mois=' + MONTH)).expect(200)).body;
    const target = invoices.find((f: any) => f.factNum === 'DEMO-INC-003');
    workerTarget = target.id;
    scenario = 'worker';
    const cacheBefore = (await service.list('ia_cache')).length;
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const r = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Corrige la ligne incomplète et donne-moi un Excel par fournisseur et le JSON' }).expect(201);
    scenario = 'synthese';
    const reply = r.body.data.messages[1];
    expect(reply.result.executees.map((e: any) => e.outil)).toEqual(['corriger_ligne', 'generer_tableau', 'generer_fichier']);
    expect(reply.result.sources.find((s: any) => s.summary.includes('refusés : mHt'))).toBeTruthy();
    const line = (await auth(api().get('/api/factures/' + target.id)).expect(200)).body;
    expect(line).toEqual(expect.objectContaining({ iceFrs: '001234567000077', idPaie: 2, revueHumaine: false }));
    const journal = (await auth(api().get('/api/journal')).expect(200)).body;
    const corr = journal.find((j: any) => j.action === 'correction_agent' && j.factureId === target.id);
    expect(corr.saisiPar).toBe('Agent IA (pour Admin IA)');
    expect(JSON.parse(corr.details)).toEqual(expect.objectContaining({ avant: { iceFrs: '001234567000099', idPaie: null }, apres: { iceFrs: '001234567000077', idPaie: 2 }, justification: 'ICE et chèque lus sur la pièce' }));
    const [tableau, json] = reply.result.livrables;
    expect(tableau.nom).toBe(`Waraqa-Achats-par-fournisseur-${MONTH}.xlsx`);
    const xlsx = await auth(api().get('/api/workspace/livrables/' + tableau.id)).buffer(true).parse((res: any, cb: any) => { const b: Buffer[] = []; res.on('data', (x: Buffer) => b.push(x)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    const XLSX = require('xlsx');
    const wb = XLSX.read(xlsx.body, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Lignes', 'Synthèse', 'Paramètres']);
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Synthèse'])[0]).toEqual(expect.objectContaining({ Groupe: expect.any(String), TTC: expect.any(Number) }));
    const j = await auth(api().get('/api/workspace/livrables/' + json.id)).expect(200);
    expect(JSON.parse(j.text).lignes.length).toBeGreaterThan(0);
    await auth(api().get('/api/workspace/livrables/livrable-inconnu')).expect(404);
    expect((await service.list('ia_cache')).length).toBe(cacheBefore);
    // Même tableau hors discussion (route directe), avec filtre.
    const direct = await auth(api().post('/api/workspace/tableau')).send({ format: 'csv', mois: MONTH, statut: 'tout', colonnes: ['factNum', 'libFrss', 'mTtc'] }).expect(201);
    expect(direct.text.split('\r\n')[0]).toContain('N° facture');
    await auth(api().post('/api/workspace/tableau')).send({ format: 'csv', mois: '2020-01' }).expect(400);
  });

  it('dossier joint au chat : attente de l’import puis reprise automatique de la demande', async () => {
    const { zipSync, strToU8 } = require('fflate');
    const rows = Array.from({ length: 400 }, (_, i) => `REPRISE-${i},Fournisseur ${i % 7},${100 + i},20%,0${1 + (i % 9)}/09/2026`).join('\n');
    const zip = zipSync({ 'dossier/achats.csv': strToU8('FACT_NUM,LIB_FRSS,M_TTC,TAUX,DATE_FAC\n' + rows + '\n') });
    const lot = await auth(api().post('/api/workspace/imports/zip')).attach('file', Buffer.from(zip), 'dossier-reprise.zip').expect(201);
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const first = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Fais la synthèse du dossier', lotIds: [lot.body.id] }).expect(201);
    expect(first.body.data.messages[1].result.type).toBe('attente_import');
    expect(first.body.data.pending.lotIds).toEqual([lot.body.id]);
    let conv: any;
    for (let i = 0; i < 400; i++) {
      conv = (await auth(api().get('/api/workspace/conversations/' + c.body.id)).expect(200)).body;
      if (conv.data.messages.length >= 4) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const [, , auto, resumed] = conv.data.messages;
    expect(auto).toEqual(expect.objectContaining({ role: 'user', auto: true }));
    expect(auto.content).toContain('Import terminé');
    expect(auto.content).toContain('400 ligne(s)');
    expect(auto.content).toContain('Fais la synthèse du dossier');
    expect(resumed).toEqual(expect.objectContaining({ role: 'assistant', mode: 'live' }));
    expect(conv.data.pending).toBeNull();
    await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'x', lotIds: 'pas-un-tableau' }).expect(400);
  }, 60000);

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
