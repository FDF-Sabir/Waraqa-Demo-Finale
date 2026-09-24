/**
 * Doublons explicables (plan L2.4) et rapport rédactionnel (plan L3.4), de bout en bout.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';
import { AuthService } from '../src/auth/auth.service';
import { FacturesService } from '../src/factures/factures.service';
import { SousType } from '../src/common/types';

describe('Doublons explicables et rapport rédactionnel', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string, a: number, b: number;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const binary = (res: any, cb: any) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-dup-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-dup';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    const r = await app.get(AuthService).inscrire({ nom: 'Admin', email: 'dup@example.test', motDePasse: 'DupTest2026!' });
    user = { sub: r.utilisateur.id, nom: r.utilisateur.nom }; token = r.accessToken;
    const base = { factNum: 'D-1', libFrss: 'Fournisseur', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT', mTtc: 1200, taux: 0.2, idPaie: 4, sousType: SousType.FACTURE_FOURNISSEUR, dateFac: '2026-03-02', datePaie: '2026-03-05' };
    a = (await factures.creer(base, service.actor(user))).id;
    b = (await factures.creer({ ...base, designation: 'ACHAT LIVRAISON 2', datePaie: '2026-03-06' }, service.actor(user))).id;
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('le groupe explique critères communs et différences, sans rien supprimer', async () => {
    expect((await factures.trouver(b)).doublonDe).toBe(a);
    const g = (await auth(api().get(`/workspace/invoices/${b}/doublon`)).expect(200)).body;
    expect(g.reference).toBe(a); expect(g.membres.map((m: any) => m.id)).toEqual([a, b]);
    const m = g.membres.find((x: any) => x.id === b);
    expect(m.communs).toEqual(expect.arrayContaining(['factNum', 'iceFrs', 'mTtc', 'dateFac']));
    expect(m.differences).toEqual(expect.objectContaining({ designation: { reference: 'ACHAT', ligne: 'ACHAT LIVRAISON 2' }, datePaie: { reference: '2026-03-05', ligne: '2026-03-06' } }));
    expect(g.decisionsPossibles.map((d: any) => d.code)).toEqual(['ligne_distincte', 'archiver', 'corriger']);
  });
  it('la levée exige un motif, est tracée, et la re-détection respecte la décision', async () => {
    await auth(api().post(`/workspace/invoices/${b}/doublon/lever`)).send({ motif: 'ok' }).expect(400);
    await auth(api().post(`/workspace/invoices/${a}/doublon/lever`)).send({ motif: 'Pas un doublon, ligne de référence' }).expect(409);
    const lifted = (await auth(api().post(`/workspace/invoices/${b}/doublon/lever`)).send({ motif: 'Deux livraisons distinctes facturées sous le même numéro' }).expect(201)).body;
    expect(lifted.doublonDe).toBeNull(); expect(lifted.revueHumaine).toBe(false);
    // Une modification ultérieure recalcule la détection : la décision humaine est respectée.
    const again = await factures.modifier(b, { designation: 'ACHAT LIVRAISON 2 BIS' }, service.actor(user));
    expect(again.doublonDe).toBeNull();
    // Une troisième copie identique reste, elle, détectée.
    const c = await factures.creer({ factNum: 'D-1', libFrss: 'Fournisseur', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT', mTtc: 1200, taux: 0.2, idPaie: 4, sousType: SousType.FACTURE_FOURNISSEUR, dateFac: '2026-03-02', datePaie: '2026-03-05' }, service.actor(user));
    expect(c.doublonDe).toBe(a);
    const g = (await auth(api().get(`/workspace/invoices/${b}/doublon`)).expect(200)).body;
    expect(g.decision).toEqual(expect.objectContaining({ decision: 'ligne_distincte', de: a, par: 'Admin' }));
    const journal = (await auth(api().get('/journal')).expect(200)).body;
    expect(journal.some((j: any) => j.action === 'doublon_leve' && j.factureId === b)).toBe(true);
    // L'agent passe par la même règle métier (mêmes contrôles) : une ligne non marquée est refusée.
    const actions = (service as any).agentActions(await (service as any).users.findOneBy({ id: user.sub }), 'conv');
    await expect(actions.leverDoublon(b, 'Encore une fois')).rejects.toThrow('pas marquée');
  });
  it('le rapport rédactionnel est livré en Markdown et PDF, téléchargeable et tracé', async () => {
    const actions = (service as any).agentActions(await (service as any).users.findOneBy({ id: user.sub }), 'conv-1');
    const files = await actions.rapport({ titre: 'Analyse des doublons de mars', contenu: '## Constat\n\nLe groupe #1/#2 a été **levé** par le comptable.\n\n| Ligne | Décision |\n|---|---|\n| #2 | distincte |\n\n## Sources\n\n- comparer_doublons', mois: '2026-03', sources: ['comparer_doublons'] });
    expect(files.map((f: any) => f.nom)).toEqual(['Waraqa-rapport-Analyse-des-doublons-de-mars-2026-03.md', 'Waraqa-rapport-Analyse-des-doublons-de-mars-2026-03.pdf']);
    const md = await auth(api().get(`/workspace/livrables/${files[0].id}`)).buffer().parse(binary).expect(200);
    expect(md.headers['content-type']).toContain('text/markdown'); expect(md.body.toString()).toContain('brouillon de travail'); expect(md.body.toString()).toContain('comparer_doublons');
    const pdf = await auth(api().get(`/workspace/livrables/${files[1].id}`)).buffer().parse(binary).expect(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(actions.rapport({ titre: 'X', contenu: 'trop court' })).rejects.toThrow('trop court');
    const journal = (await auth(api().get('/journal')).expect(200)).body;
    expect(journal.some((j: any) => j.action === 'rapport_genere')).toBe(true);
  });
});
