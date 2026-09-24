/**
 * Compléments 4.7 : pièce jointe en attente puis comptabilisée sur demande, corrections en masse,
 * consignes mémorisées (injectées au prompt, révocables), calcul exact, classeur libre, rapport HTML,
 * proposition d'autorisation Drive. Client Anthropic simulé.
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

const KEY = 'sk-ant-api03-TESTONLY' + 'w'.repeat(40) + 'ST01';
const M = '2026-09';
describe('Pièces en attente, corrections en masse, consignes, calcul, classeur', () => {
  let app: INestApplication, dir: string, token = '', service: UnifiedService, factures: FacturesService, docId = '', ids: number[] = [];
  let scenario: 'comptabiliser' | 'masse' | 'drive' = 'comptabiliser';
  const calls: any[] = [];
  const fake = {
    models: { retrieve: jest.fn(async (id: string) => ({ id, display_name: 'Simulé' })) },
    messages: { create: jest.fn(async (params: any) => {
      calls.push(params);
      const usage = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      if (!params.tools) return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'OK' }] };
      const last = params.messages[params.messages.length - 1];
      const results = Array.isArray(last.content) ? last.content.filter((b: any) => b.type === 'tool_result') : [];
      if (!results.length) {
        if (scenario === 'comptabiliser') return { stop_reason: 'tool_use', usage, content: [
          { type: 'tool_use', id: 'k1', name: 'calculer', input: { expression: 'round(1200/1.2,2)' } },
          { type: 'tool_use', id: 'p1', name: 'comptabiliser_piece', input: { documentId: docId } },
          { type: 'tool_use', id: 'm1', name: 'memoriser_consigne', input: { texte: 'Livrer toujours le relevé en XML et en Excel DGI', portee: 'globale', demande: 'retiens que…' } },
          { type: 'tool_use', id: 'c1', name: 'generer_classeur', input: { titre: 'Échéancier', feuilles: [{ nom: 'Octobre', lignes: [['Date', 'Tâche'], ['2026-10-05', 'Relevé']] }], mois: M } },
          { type: 'tool_use', id: 'r1', name: 'generer_rapport', input: { titre: 'Note', contenu: '## Point\n\nPièce comptabilisée.', formats: ['html'] } },
        ] };
        if (scenario === 'masse') return { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'b1', name: 'corriger_lignes', input: { corrections: [
          { factureId: ids[0], champs: { idPaie: 2 }, justification: 'Chèque lu sur le relevé', source: { type: 'utilisateur' } },
          { factureId: ids[1], champs: { idPaie: 2 }, justification: 'Chèque lu sur le relevé', source: { type: 'utilisateur' } },
          { factureId: 999999, champs: { idPaie: 2 }, justification: 'Ligne inexistante', source: { type: 'utilisateur' } },
        ] } }] };
        return { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'd1', name: 'proposer_action', input: { type: 'autoriser_drive', libelle: 'Autoriser la lecture Drive' } }] };
      }
      const summaries = results.map((r: any) => r.content.slice(0, 80)).join(' | ');
      return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Fait. ' + summaries }] };
    }) },
  };
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const binary = (res: any, cb: any) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-staging-'));
    await writeFile(join(dir, '.env'), 'WARAQA_JWT_SECRET=x\nANTHROPIC_API_KEY=\n');
    Object.assign(process.env, { WARAQA_DB_PATH: join(dir, 'db.sqlite'), WARAQA_FILES_PATH: join(dir, 'files'), WARAQA_ENV_PATH: join(dir, '.env'), ANTHROPIC_API_KEY: '' });
    IaGateway.testClientFactory = () => fake;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.setGlobalPrefix('api'); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    token = (await api().post('/api/auth/inscription').send({ nom: 'Admin', email: 'staging@example.test', motDePasse: 'StagingTest2026!' }).expect(201)).body.accessToken;
    await auth(api().put('/api/workspace/ai/key')).send({ key: KEY }).expect(200);
    await auth(api().put('/api/workspace/settings')).send({ ai: { mode: 'live', effort: 'low' }, company: { name: 'Société Test', iff: '12345678' } }).expect(200);
  });
  afterAll(async () => {
    IaGateway.testClientFactory = null; await app?.close(); await rm(dir, { recursive: true, force: true });
    for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH', 'WARAQA_ENV_PATH', 'ANTHROPIC_API_KEY']) delete process.env[k];
  });

  it('une pièce jointe au chat reste en attente, puis est comptabilisée sur demande ; consigne, calcul, classeur et rapport HTML livrés', async () => {
    const csv = Buffer.from(`FACT_NUM;LIB_FRSS;ICE_FRS;IF;DESIGNATION;M_TTC;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC\nST-1;Fournisseur;001234567000012;12345678;ACHAT;1200;20;4;${M}-05;${M}-02\nST-2;Fournisseur;001234567000012;12345678;ACHAT;600;20;4;${M}-06;${M}-03`);
    const d = (await auth(api().post('/api/workspace/documents?reuse=true&staging=true')).attach('file', csv, 'achats.csv').expect(201)).body;
    docId = d.id;
    expect(d.data.status).toBe('a_comptabiliser'); expect(d.data.invoiceIds).toEqual([]);
    expect((await auth(api().get(`/api/workspace/precontrole?month=${M}`)).expect(200)).body.blocages.map((b: any) => b.code)).toContain('pieces_en_attente');
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Comptabilise cette pièce, retiens ma préférence, prépare l’échéancier', documentIds: [docId] }).expect(201);
    const reply = r.body.data.messages[1];
    expect(reply.mode).toBe('live');
    expect(reply.result.sources.find((s: any) => s.name === 'calculer').summary).toContain('= 1000');
    expect(reply.result.executees.map((e: any) => e.outil)).toEqual(['comptabiliser_piece', 'memoriser_consigne', 'generer_classeur', 'generer_rapport']);
    const doc = (await auth(api().get('/api/workspace/documents')).expect(200)).body.find((x: any) => x.id === docId);
    expect(doc.data.status).toBe('a_verifier'); expect(doc.data.invoiceIds).toHaveLength(2); ids = doc.data.invoiceIds;
    expect(reply.result.livrables.map((l: any) => l.nom)).toEqual([`Waraqa-Echeancier-${M}.xlsx`, 'Waraqa-rapport-Note.html']);
    const html = await auth(api().get(`/api/workspace/livrables/${reply.result.livrables[1].id}`)).buffer().parse(binary).expect(200);
    expect(html.body.toString()).toContain('<h3>Point</h3>');
    const consignes = (await auth(api().get('/api/workspace/consignes')).expect(200)).body;
    expect(consignes).toHaveLength(1); expect(consignes[0].texte).toContain('XML');
    // La consigne est rappelée dans les instructions dès l'appel suivant.
    scenario = 'masse';
    const c2 = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r2 = await auth(api().post(`/api/workspace/conversations/${c2.id}/messages`)).send({ text: 'Passe ces lignes en chèque' }).expect(201);
    const system = calls[calls.length - 1].system.map((b: any) => b.text).join('\n');
    expect(system).toContain('Consignes mémorisées'); expect(system).toContain('Livrer toujours le relevé en XML');
    const masse = r2.body.data.messages[1].result;
    expect(masse.executees.map((e: any) => e.outil)).toEqual(['corriger_ligne', 'corriger_ligne']);
    expect(masse.sources[0].summary).toContain('2/3');
    expect((await factures.trouver(ids[0])).idPaie).toBe(2); expect((await factures.trouver(ids[1])).idPaie).toBe(2);
    await auth(api().delete(`/api/workspace/consignes/${consignes[0].id}`)).expect(200);
    expect((await auth(api().get('/api/workspace/consignes')).expect(200)).body).toHaveLength(0);
  });
  it('un import Drive refusé pour autorisation débouche sur une proposition d’autorisation, pas sur un refus de format', async () => {
    scenario = 'drive';
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: M }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Autorise Drive' }).expect(201);
    const reply = r.body.data.messages[1];
    // Identifiants Google absents dans ce test : la proposition explique la vraie cause au lieu d'inventer une limite.
    expect(reply.result.sources[0].summary).toContain('Identifiants Google absents');
    expect((await service.consignes()).length).toBe(0);
    await auth(api().post('/api/workspace/consignes')).send({ texte: 'Ma clé sk-ant-xxxx' }).expect(400);
    await auth(api().post('/api/workspace/consignes')).send({ texte: 'Toujours vérifier les ICE de ce fournisseur', portee: 'fournisseur', fournisseur: 'Atlas' }).expect(201);
  });
});
