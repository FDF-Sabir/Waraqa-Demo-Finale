/**
 * Profil « en ligne » : IA connectée imposée dès qu'une clé existe, et Google Drive synchronisé
 * automatiquement (OAuth verrouillé sur un compte, arborescence créée, file durable, reprises).
 * Google est SIMULÉ en mémoire : aucun appel réseau réel n'est possible depuis cette suite.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { IaGateway } from '../src/ocr/ia-gateway';
import { IntegrationsService } from '../src/unified/integrations.service';

const MONTH = '2026-09';
const CLIENT = '123456789012-abcdefghijklmnopqrstu.apps.googleusercontent.com';
const OWNER = 'saberrochdi509@gmail.com';
const KEY = 'sk-ant-api03-TESTONLY' + 'y'.repeat(40) + 'Q7W2';

/** Faux Google : OAuth + Drive v3 (dossiers, recherche par appProperties, envoi reprenable, corbeille). */
class FakeGoogle {
  files = new Map<string, any>();
  seq = 0;
  email = OWNER;
  offline = false;
  refreshRevoked = false;
  accessToken = 'at-1';
  grantScope = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file';
  calls: string[] = [];
  private uploads = new Map<string, any>();
  jwt(payload: any) { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'RS256' })}.${b(payload)}.sig`; }
  json(body: any, status = 200, headers: Record<string, string> = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
  byName(name: string) { return [...this.files.values()].find(f => f.name === name && !f.trashed); }
  children(parent: string) { return [...this.files.values()].filter(f => f.parents?.includes(parent) && !f.trashed); }
  fetch = async (input: any, init: any = {}): Promise<Response> => {
    const url = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
    this.calls.push(`${method} ${url.pathname}`);
    if (this.offline) throw new TypeError('fetch failed');
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const p = new URLSearchParams(String(init.body));
      if (p.get('grant_type') === 'refresh_token') {
        if (this.refreshRevoked) return this.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
        this.accessToken = 'at-' + (++this.seq);
        return this.json({ access_token: this.accessToken, expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
      }
      return this.json({ access_token: this.accessToken, refresh_token: 'rt-secret', expires_in: 3600, scope: this.grantScope, id_token: this.jwt({ iss: 'https://accounts.google.com', aud: CLIENT, email: this.email, email_verified: true }) });
    }
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') return new Response('', { status: 200 });
    if (init.headers?.Authorization !== 'Bearer ' + this.accessToken) return this.json({ error: { message: 'Invalid Credentials' } }, 401);
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const prop = /appProperties has \{ key='(\w+)' and value='([^']*)' \}/.exec(q), parent = /'([^']+)' in parents/.exec(q);
      let list = [...this.files.values()].filter(f => !f.trashed);
      if (prop) list = list.filter(f => f.appProperties?.[prop[1]] === prop[2]);
      if (parent) list = list.filter(f => f.parents?.includes(parent[1]));
      if (q.includes('google-apps.folder')) list = list.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      list.sort((a, b) => b.createdTime - a.createdTime);
      return this.json({ files: list.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.content ? String(f.content.length) : undefined, createdTime: new Date(f.createdTime).toISOString() })) });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(init.body), id = 'f' + (++this.seq);
      this.files.set(id, { ...meta, id, createdTime: Date.now() + this.seq });
      return this.json({ id });
    }
    const exported = /^\/drive\/v3\/files\/([^/]+)\/export$/.exec(url.pathname);
    if (exported) {
      const f = this.files.get(decodeURIComponent(exported[1]));
      return f?.content ? new Response(new Uint8Array(f.content), { status: 200 }) : this.json({ error: { message: 'File not found' } }, 404);
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const f = this.files.get(decodeURIComponent(one[1]));
      if (!f) return this.json({ error: { message: 'File not found' } }, 404);
      if (method === 'PATCH') Object.assign(f, JSON.parse(init.body));
      if (url.searchParams.get('alt') === 'media') return new Response(new Uint8Array(f.content), { status: 200 });
      return this.json({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.content ? String(f.content.length) : undefined, trashed: Boolean(f.trashed) });
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const uploadId = 'u' + (++this.seq);
      this.uploads.set(uploadId, JSON.parse(init.body));
      return this.json({}, 200, { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${uploadId}` });
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'PUT') {
      const meta = this.uploads.get(url.searchParams.get('upload_id')!), id = 'f' + (++this.seq);
      this.files.set(id, { ...meta, id, size: (init.body as Uint8Array).length, mime: init.headers['Content-Type'], createdTime: Date.now() + this.seq });
      return this.json({ id });
    }
    return this.json({ error: { message: 'route inconnue ' + url.pathname } }, 404);
  };
}

describe('Profil en ligne : IA imposée et Google Drive synchronisé (Google simulé)', () => {
  let app: INestApplication, dir: string, token = '', drive: IntegrationsService;
  const google = new FakeGoogle();
  const fake = { models: { retrieve: jest.fn(async (id: string) => ({ id, display_name: 'simulé' })) }, messages: { create: jest.fn(async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify({ sousType: 'facture_fournisseur', confiance: 0.9, lignes: [{ factNum: 'ON-1', libFrss: 'Fournisseur En Ligne', iceFrs: '000111222333444', iff: '00123', designation: 'ACHAT', mTtc: 120, taux: 0.2, dateFac: '2026-09-10' }] }) }] })) } };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-online-'));
    await writeFile(join(dir, '.env'), 'WARAQA_JWT_SECRET=x\nANTHROPIC_API_KEY=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n');
    Object.assign(process.env, {
      WARAQA_DB_PATH: join(dir, 'db.sqlite'), WARAQA_FILES_PATH: join(dir, 'files'), WARAQA_ENV_PATH: join(dir, '.env'),
      WARAQA_JWT_SECRET: 'online-drive-e2e-secret', WARAQA_PROFILE: 'online', GOOGLE_ALLOWED_EMAIL: OWNER,
      ANTHROPIC_API_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    });
    IntegrationsService.fetchImpl = google.fetch as any;
    IaGateway.testClientFactory = () => fake;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api');
    await app.init();
    drive = app.get(IntegrationsService);
    const r = await request(app.getHttpServer()).post('/api/auth/inscription').send({ nom: 'Rochdi', email: 'admin@example.test', motDePasse: 'OnlineDrive2026!' }).expect(201);
    token = r.body.accessToken;
    await auth(api().post('/api/workspace/seed')).send({ month: MONTH }).expect(201);
  });
  afterAll(async () => {
    IntegrationsService.fetchImpl = null;
    IaGateway.testClientFactory = null;
    await app?.close();
    await rm(dir, { recursive: true, force: true });
    process.env.WARAQA_PROFILE = 'local';
    process.env.GOOGLE_ALLOWED_EMAIL = '';
    for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH', 'WARAQA_ENV_PATH', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[k];
  });
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  async function authorize(expectOk = true) {
    const start = await auth(api().post('/api/workspace/drive/start')).expect(201);
    const url = new URL(start.body.url);
    expect(url.searchParams.get('login_hint')).toBe(OWNER);
    expect(url.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.file');
    const cb = await api().get('/api/workspace/drive/callback').query({ state: url.searchParams.get('state'), code: 'code-1' }).expect(302);
    expect(cb.headers.location).toMatch(expectOk ? /^\/\?drive=ok#\/reglages$/ : /^\/\?drive=erreur&message=/);
    return cb.headers.location as string;
  }

  it('Mise en service : sans clé, aucune réponse préenregistrée et état « à terminer » exposé', async () => {
    const r = await auth(api().get('/api/workspace/readiness')).expect(200);
    expect(r.body).toEqual(expect.objectContaining({ profile: 'online', ready: false }));
    expect(r.body.ai.keyConfigured).toBe(false);
    expect(r.body.drive).toEqual(expect.objectContaining({ configured: false, authorized: false }));
    await api().get('/api/workspace/readiness').expect(401);
    const c = await auth(api().post('/api/workspace/conversations')).send({ month: MONTH }).expect(201);
    const m = await auth(api().post(`/api/workspace/conversations/${c.body.id}/messages`)).send({ text: 'Fais la synthèse du mois' }).expect(201);
    const reply = m.body.data.messages[1];
    expect(reply).toEqual(expect.objectContaining({ role: 'assistant', mode: 'error', result: { type: 'setup', missing: 'anthropic_key' } }));
    expect(reply.content).toContain('Réglages → Assistant IA');
    expect(reply.content).not.toContain('Synthèse locale');
  });

  it('IA : sans clé, mode démo ; dès que la clé est enregistrée, mode connecté imposé sans bascule', async () => {
    let s = await auth(api().get('/api/workspace/settings')).expect(200);
    expect(s.body.ai).toEqual(expect.objectContaining({ mode: 'demo', modeLocked: false, profile: 'online' }));
    await auth(api().put('/api/workspace/ai/key')).send({ key: KEY }).expect(200);
    s = await auth(api().get('/api/workspace/settings')).expect(200);
    expect(s.body.ai).toEqual(expect.objectContaining({ mode: 'live', modeLocked: true }));
    await auth(api().put('/api/workspace/settings')).send({ ai: { mode: 'demo' } }).expect(200);
    s = await auth(api().get('/api/workspace/settings')).expect(200);
    expect(s.body.ai.mode).toBe('live');
    const status = await api().get('/api/workspace/status').expect(200);
    expect(status.body).toEqual(expect.objectContaining({ profile: 'online', aiLive: true, configured: true }));
    expect(JSON.stringify(status.body)).not.toContain(KEY);
  });

  it('Drive : identifiants OAuth validés (champs ou JSON Google), secret jamais renvoyé', async () => {
    await auth(api().post('/api/workspace/drive/start')).expect(400);
    await auth(api().put('/api/workspace/drive/credentials')).send({ clientId: 'faux', clientSecret: 'GOCSPX-abcdefghijkl' }).expect(400);
    const wrongUri = { web: { client_id: CLIENT, client_secret: 'GOCSPX-testsecret123', redirect_uris: ['http://localhost:9999/x'] } };
    const bad = await auth(api().put('/api/workspace/drive/credentials')).send({ json: JSON.stringify(wrongUri) }).expect(400);
    expect(bad.body.message).toContain('http://localhost:3000/api/workspace/drive/callback');
    const good = { web: { ...wrongUri.web, redirect_uris: ['http://localhost:3000/api/workspace/drive/callback'] } };
    const r = await auth(api().put('/api/workspace/drive/credentials')).send({ json: JSON.stringify(good) }).expect(200);
    expect(r.body.drive).toEqual(expect.objectContaining({ configured: true, authorized: false, allowedEmail: OWNER }));
    expect(JSON.stringify(r.body)).not.toContain('GOCSPX-testsecret123');
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('GOOGLE_CLIENT_ID=' + CLIENT);
    expect(env).toContain('GOOGLE_CLIENT_SECRET=GOCSPX-testsecret123');
  });

  it('Drive : un autre compte Google est refusé et révoqué', async () => {
    google.email = 'autre.compte@gmail.com';
    const location = await authorize(false);
    expect(decodeURIComponent(location)).toContain(`seul ${OWNER} est autorisé`);
    expect(google.calls).toContain('POST /revoke');
    const s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.authorized).toBe(false);
    google.email = OWNER;
  });

  it('Drive : le bon compte est accepté, les pièces et snapshots existants sont mis en file', async () => {
    await auth(api().post('/api/workspace/snapshots')).send({ month: MONTH }).expect(201);
    await authorize(true);
    const s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive).toEqual(expect.objectContaining({ authorized: true, email: OWNER, needsReauth: false }));
    expect(s.body.drive.queue.pending).toBeGreaterThanOrEqual(2); // snapshot + sauvegarde du jour
    const ready = await auth(api().get('/api/workspace/readiness')).expect(200);
    expect(ready.body).toEqual(expect.objectContaining({ ready: true, ai: { keyConfigured: true, live: true } }));
    expect(ready.body.drive).toEqual({ configured: true, authorized: true, needsReauth: false, email: OWNER, canRead: false });
    expect(JSON.stringify(ready.body)).not.toContain('GOCSPX');
    const rec = JSON.stringify((await auth(api().get('/api/journal')).expect(200)).body);
    expect(rec).not.toContain('rt-secret');
  });

  it('Synchro : arborescence Waraqa créée, pièce, export et snapshot transférés, sauvegarde du jour', async () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const doc = await auth(api().post('/api/workspace/documents')).attach('file', PNG, 'facture-en-ligne.png').expect(201);
    expect(doc.body.data.mode).toBe('ia_live');
    await auth(api().get('/api/workspace/export')).query({ month: MONTH, format: 'xlsx', scope: 'all', examples: 'true' }).expect(200);
    expect((await readdir(join(dir, 'drive-outbox'))).length).toBe(1);
    const r = await auth(api().post('/api/workspace/drive/sync')).expect(201);
    expect(r.body).toEqual(expect.objectContaining({ processed: 4, failed: 0 }));
    const root = google.byName('Waraqa')!;
    const names = google.children(root.id).map(f => f.name).sort();
    expect(names).toEqual(['Exports', 'Pièces', 'Sauvegardes', 'Snapshots']);
    const pieces = google.byName('Pièces')!, month = google.children(pieces.id)[0];
    expect(month.name).toMatch(/^\d{4}-\d{2}$/);
    expect(google.children(month.id).map(f => f.name)).toEqual(['facture-en-ligne.png']);
    const exportsMonth = google.children(google.byName('Exports')!.id)[0];
    expect(exportsMonth.name).toBe(MONTH);
    expect(google.children(exportsMonth.id)[0].name).toBe(`Waraqa-xlsx-${MONTH}-EXEMPLES-BROUILLON.xlsx`);
    expect(google.children(google.byName('Snapshots')!.id)[0].mime).toBe('application/pdf');
    expect(google.children(google.byName('Sauvegardes')!.id)[0].name).toMatch(/^Waraqa-sauvegarde-\d{4}-\d{2}-\d{2}\.waraqa\.gz$/);
    expect((await readdir(join(dir, 'drive-outbox'))).length).toBe(0);
    const s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.queue).toEqual({ pending: 0, error: 0, done: 4 });
    expect(s.body.drive.folderUrl).toBe(`https://drive.google.com/drive/folders/${root.id}`);
  });

  it('Synchro : idempotente (aucun doublon) et arborescence recréée si la racine est supprimée', async () => {
    const before = google.files.size;
    await drive.runQueue(true);
    expect(google.files.size).toBe(before);
    google.byName('Waraqa')!.trashed = true;
    await auth(api().post('/api/workspace/snapshots')).send({ month: '2026-08' }).expect(201);
    await drive.runQueue(true);
    const roots = [...google.files.values()].filter(f => f.name === 'Waraqa' && !f.trashed);
    expect(roots).toHaveLength(1);
    expect(google.children(google.byName('Snapshots')!.id)).toHaveLength(1);
  });

  it('Import par lien de dossier Drive : lecture autorisée à la demande, sous-dossiers et Google Sheets lus, pièces importées', async () => {
    const XLSX = require('xlsx');
    const add = (name: string, mimeType: string, parent?: string, content?: Buffer) => {
      const id = '1DriveInput' + String(++google.seq).padStart(12, '0');
      google.files.set(id, { id, name, mimeType, parents: parent ? [parent] : [], content, createdTime: Date.now() + google.seq });
      return id;
    };
    const folder = add('Pièces juillet', 'application/vnd.google-apps.folder');
    add('facture-scan.pdf', 'application/pdf', folder, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
    const bank = add('Banque', 'application/vnd.google-apps.folder', folder);
    add('achats.csv', 'text/csv', bank, Buffer.from('FACT_NUM,LIB_FRSS,ICE_FRS,IF,DESIGNATION,M_TTC,TAUX,ID_PAIE,DATE_PAIE,DATE_FAC\nDRV-1,Fournisseur Drive,001111111000011,11111111,ACHAT,1200,20%,4,15/07/2026,10/07/2026\n'));
    const sheet = XLSX.utils.aoa_to_sheet([['FACT_NUM', 'LIB_FRSS', 'ICE_FRS', 'IF', 'DESIGNATION', 'M_TTC', 'TAUX', 'ID_PAIE', 'DATE_PAIE', 'DATE_FAC'], ['GS-1', 'Tableur Google', '002222222000022', '22222222', 'SERVICE', 2400, 0.2, 2, '2026-07-20', '2026-07-18']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, 'Feuille 1');
    add('Tableau fournisseurs', 'application/vnd.google-apps.spreadsheet', folder, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    add('notes.txt', 'text/plain', folder, Buffer.from('à ignorer'));
    const link = `https://drive.google.com/drive/folders/${folder}?usp=sharing`;

    const denied = await auth(api().post('/api/workspace/imports/drive')).send({ url: link }).expect(409);
    expect(denied.body.code).toBe('drive_lecture_requise');
    const start = await auth(api().post('/api/workspace/drive/start')).send({ readonly: true }).expect(201);
    const url = new URL(start.body.url);
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/drive.readonly');
    google.grantScope += ' https://www.googleapis.com/auth/drive.readonly';
    const cb = await api().get('/api/workspace/drive/callback').query({ state: url.searchParams.get('state'), code: 'code-2' }).expect(302);
    expect(cb.headers.location).toBe('/?drive=ok#/import');
    expect((await auth(api().get('/api/workspace/readiness')).expect(200)).body.drive.canRead).toBe(true);

    const jobsBefore = (await auth(api().get('/api/workspace/integrations')).expect(200)).body.drive.queue;
    await auth(api().post('/api/workspace/imports/drive')).send({ url: 'https://drive.google.com/drive/folders/inconnu1234567' }).expect(400);
    const lot = await auth(api().post('/api/workspace/imports/drive')).send({ url: link }).expect(201);
    expect(lot.body.data).toEqual(expect.objectContaining({ source: 'drive', label: 'Pièces juillet', total: 3 }));
    expect(lot.body.data.skipped).toEqual([{ name: 'notes.txt', reason: 'Format non pris en charge' }]);
    let done: any;
    for (let i = 0; i < 100 && done?.data.status !== 'termine'; i++) {
      await new Promise(r => setTimeout(r, 50));
      done = (await auth(api().get('/api/workspace/imports/' + lot.body.id)).expect(200)).body;
    }
    expect(done.data.status).toBe('termine');
    const byName = Object.fromEntries(done.data.items.map((x: any) => [x.name, x]));
    expect(Object.keys(byName).sort()).toEqual(['Banque/achats.csv', 'Tableau fournisseurs.xlsx', 'facture-scan.pdf']);
    expect(byName['Banque/achats.csv']).toEqual(expect.objectContaining({ state: 'a_verifier', lines: 1 }));
    expect(byName['Tableau fournisseurs.xlsx']).toEqual(expect.objectContaining({ state: 'a_verifier', lines: 1 }));
    expect(byName['facture-scan.pdf'].lines).toBe(1);
    const lines = (await auth(api().get('/api/factures')).expect(200)).body;
    expect(lines.find((f: any) => f.factNum === 'DRV-1')).toEqual(expect.objectContaining({ datePaie: '2026-07-15', dateFac: '2026-07-10', taux: 0.2, iceFrs: '001111111000011', mHt: 1000, tva: 200 }));
    // Pièces venues de Drive : pas de copie en double dans Waraqa/Pièces.
    const jobsAfter = (await auth(api().get('/api/workspace/integrations')).expect(200)).body.drive.queue;
    expect(jobsAfter.pending + jobsAfter.done).toBe(jobsBefore.pending + jobsBefore.done);
  });

  it('Synchro : hors ligne, la tâche reste en file puis part au retour du réseau', async () => {
    google.offline = true;
    await auth(api().get('/api/workspace/export')).query({ month: MONTH, format: 'csv', scope: 'all', examples: 'true' }).expect(200);
    let r = await drive.runQueue(true);
    expect(r.failed).toBe(1);
    let s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.queue.pending).toBe(1);
    expect(s.body.drive.lastError).toContain('injoignable');
    google.offline = false;
    r = (await auth(api().post('/api/workspace/drive/sync')).expect(201)).body;
    expect(r.processed).toBe(1);
    s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.queue.pending).toBe(0);
  });

  it('Jeton expiré : rafraîchi automatiquement ; accès révoqué : reconnexion demandée sans perte', async () => {
    google.accessToken = 'rotated-by-google';
    await auth(api().post('/api/workspace/snapshots')).send({ month: '2026-07' }).expect(201);
    let r = await drive.runQueue(true);
    expect(r).toEqual(expect.objectContaining({ processed: 1, failed: 0 }));
    expect(google.calls.filter(c => c === 'POST /token').length).toBeGreaterThanOrEqual(3);
    google.refreshRevoked = true;
    google.accessToken = 'rotated-again';
    await auth(api().post('/api/workspace/snapshots')).send({ month: '2026-06' }).expect(201);
    await drive.runQueue(true);
    const s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.needsReauth).toBe(true);
    expect(s.body.drive.queue.pending).toBe(1);
    const calls = google.calls.length;
    expect(await drive.runQueue()).toEqual(expect.objectContaining({ skipped: 'reconnexion_requise' }));
    expect(google.calls.length).toBe(calls);
    google.refreshRevoked = false;
  });

  it('Déconnexion : jeton révoqué, plus aucun envoi automatique', async () => {
    await auth(api().post('/api/workspace/drive/disconnect')).expect(201);
    const s = await auth(api().get('/api/workspace/integrations')).expect(200);
    expect(s.body.drive.authorized).toBe(false);
    const before = google.calls.length;
    await auth(api().post('/api/workspace/snapshots')).send({ month: '2026-05' }).expect(201);
    expect(await drive.runQueue()).toEqual(expect.objectContaining({ skipped: 'non_autorise' }));
    expect(google.calls.length).toBe(before);
  });
});
