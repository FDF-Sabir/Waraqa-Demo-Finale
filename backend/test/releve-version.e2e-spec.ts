/**
 * Clôture versionnée (plan L5.3) : version figée complète, export définitif depuis la version,
 * réouverture tracée qui conserve l'historique, égalité des empreintes.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';
import { AuthService } from '../src/auth/auth.service';
import { FacturesService } from '../src/factures/factures.service';
import { SousType } from '../src/common/types';

const M = '2026-04';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
describe('Relevé : clôture versionnée', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string, a: number, b: number;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const binary = (res: any, cb: any) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-version-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-version';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    const r = await app.get(AuthService).inscrire({ nom: 'Admin', email: 'version@example.test', motDePasse: 'VersionTest2026!' });
    user = { sub: r.utilisateur.id, nom: r.utilisateur.nom }; token = r.accessToken;
    await service.updateSettings({ company: { name: 'Société Test', iff: '12345678' } }, user);
    const base = { libFrss: 'Fournisseur', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT', taux: 0.2, idPaie: 4, sousType: SousType.FACTURE_FOURNISSEUR, dateFac: `${M}-02`, datePaie: `${M}-05` };
    a = (await factures.creer({ ...base, factNum: 'V-1', mTtc: 1200 }, service.actor(user))).id;
    b = (await factures.creer({ ...base, factNum: 'V-2', mTtc: 600 }, service.actor(user))).id;
    await factures.validerLigne(a, service.actor(user)); await factures.validerLigne(b, service.actor(user));
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('la clôture crée une version complète dont l’empreinte XML égale celle du fichier exporté', async () => {
    const before = (await auth(api().get(`/workspace/releve/export?month=${M}&format=xml&scope=reviewed`)).buffer().parse(binary).expect(200)).body as Buffer;
    const closed = (await auth(api().post('/workspace/releve/close')).send({ month: M }).expect(201)).body;
    expect(closed.cloture).toEqual(expect.objectContaining({ version: 1, versionId: `releve-version-${M}-1`, xmlSha256: sha(before) }));
    expect(closed.versions).toHaveLength(1);
    const v = (await auth(api().get(`/workspace/releve/versions/releve-version-${M}-1`)).expect(200)).body.data;
    expect(v.lignes).toHaveLength(2); expect(v.lignes.every((l: any) => l.fiscalMonth === M)).toBe(true);
    expect(v).toEqual(expect.objectContaining({ version: 1, header: expect.objectContaining({ raisonSociale: 'Société Test', identifiantFiscal: '12345678' }), regles: expect.objectContaining({ version: 'releve-dgi-2026.09' }) }));
    expect(v.empreintes.xml).toBe(sha(before)); expect(v.empreintes.xlsx).toHaveLength(64);
    const after = (await auth(api().get(`/workspace/releve/export?month=${M}&format=xml&scope=reviewed`)).buffer().parse(binary).expect(200)).body as Buffer;
    expect(sha(after)).toBe(v.empreintes.xml);
    const pdf = await auth(api().get(`/workspace/releve/export?month=${M}&format=pdf&scope=reviewed`)).buffer().parse(binary).expect(200);
    expect(pdf.headers['content-disposition']).toContain('-v1.pdf');
  });
  it('la réouverture conserve la version 1 avec son motif ; une nouvelle clôture produit la version 2 depuis les données corrigées', async () => {
    await auth(api().post('/workspace/releve/reopen')).send({ month: M, motif: 'Désignation à corriger sur V-2' }).expect(201);
    const versions = (await auth(api().get(`/workspace/releve/versions?month=${M}`)).expect(200)).body;
    expect(versions).toHaveLength(1); expect(versions[0].reouverte).toEqual(expect.objectContaining({ motif: 'Désignation à corriger sur V-2', par: 'Admin' }));
    await factures.modifier(b, { designation: 'SERVICE' }, service.actor(user)); await factures.validerLigne(b, service.actor(user));
    const closed = (await auth(api().post('/workspace/releve/close')).send({ month: M }).expect(201)).body;
    expect(closed.cloture.version).toBe(2); expect(closed.versions.map((v: any) => v.version)).toEqual([2, 1]);
    const v1 = (await auth(api().get(`/workspace/releve/versions/releve-version-${M}-1`)).expect(200)).body.data;
    const v2 = (await auth(api().get(`/workspace/releve/versions/releve-version-${M}-2`)).expect(200)).body.data;
    expect(v1.lignes.find((l: any) => l.id === b).designation).toBe('ACHAT'); expect(v2.lignes.find((l: any) => l.id === b).designation).toBe('SERVICE');
    expect(v1.empreintes.xml).not.toBe(v2.empreintes.xml);
    const xml = (await auth(api().get(`/workspace/releve/export?month=${M}&format=xml&scope=reviewed`)).buffer().parse(binary).expect(200)).body as Buffer;
    expect(sha(xml)).toBe(v2.empreintes.xml);
    const journal = (await auth(api().get('/journal')).expect(200)).body;
    expect(journal.filter((j: any) => j.action === 'releve_cloture')).toHaveLength(2);
    expect(JSON.parse(journal.find((j: any) => j.action === 'releve_rouvert').details).motif).toContain('V-2');
  });
  it('le brouillon (scope all) reste un recalcul courant, jamais présenté comme la version figée', async () => {
    const r = await auth(api().get(`/workspace/releve/export?month=${M}&format=xml&scope=all`)).buffer().parse(binary).expect(200);
    expect(r.headers['content-disposition']).toContain('BROUILLON'); expect(r.headers['content-disposition']).not.toContain('-v');
  });
});
