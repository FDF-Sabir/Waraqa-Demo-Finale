/**
 * Verrou de période commun (plan directeur L1.4, invariant 7) : après clôture, aucune route —
 * historique (/factures), atelier (/workspace) ou agent — ne modifie une ligne déclarée.
 * Base et stockage temporaires ; aucun service externe.
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

const M = '2026-05';
describe('Période clôturée : protection sur tous les chemins', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string;
  let declared: number, payment: number, other: number, doc: string;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-closed-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-closed-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    const a = await app.get(AuthService).inscrire({ nom: 'Admin', email: 'closed@example.test', motDePasse: 'ClosedPeriod2026!' });
    user = { sub: a.utilisateur.id, nom: a.utilisateur.nom }; token = a.accessToken;
    await service.updateSettings({ company: { name: 'Société Test', iff: '12345678' } }, user);
    const base = { libFrss: 'Fournisseur A', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT', taux: 0.2, idPaie: 4, sousType: SousType.FACTURE_FOURNISSEUR };
    declared = (await factures.creer({ ...base, factNum: 'CLOSE-1', mTtc: 1200, dateFac: `${M}-03`, datePaie: `${M}-10` }, service.actor(user))).id;
    other = (await factures.creer({ ...base, factNum: 'OPEN-2', mTtc: 600, dateFac: '2026-06-03', datePaie: '2026-06-10' }, service.actor(user))).id;
    payment = (await factures.creer({ mTtc: 1200, taux: 0, datePaie: `${M}-10`, idPaie: 4, sousType: SousType.AVIS_DEBIT_VIREMENT }, service.actor(user))).id;
    await factures.validerLigne(declared, service.actor(user));
    const buffer = Buffer.from('%PDF-fictif');
    doc = (await service.upload({ originalname: 'piece.pdf', size: buffer.length, buffer } as any, user)).id;
    const r = await service.releveClose(M, user);
    expect(r.cloture.ids).toEqual([declared]);
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('la ligne déclarée porte la période clôturée', async () => {
    expect((await factures.trouver(declared)).fiscalMonth).toBe(M);
  });
  it('PUT et PATCH /factures/:id sont refusés (409) et ne changent rien', async () => {
    await auth(api().put(`/factures/${declared}`)).send({ designation: 'MODIF' }).expect(409);
    await auth(api().patch(`/factures/${declared}`)).send({ mTtc: 999 }).expect(409);
    const f = await factures.trouver(declared);
    expect(f.designation).toBe('ACHAT'); expect(f.mTtc).toBe(1200);
  });
  it('impossible de déplacer la ligne vers une autre période, ni d’en rattacher une à la période close', async () => {
    await auth(api().put(`/factures/${declared}`)).send({ fiscalMonth: '2026-06' }).expect(409);
    await auth(api().put(`/factures/${other}`)).send({ fiscalMonth: M }).expect(409);
    await auth(api().post('/workspace/releve/attach')).send({ ids: [other], month: M }).expect(409);
    await auth(api().post('/workspace/releve/attach')).send({ ids: [declared], month: '2026-06' }).expect(409);
    await auth(api().post(`/workspace/releve/detach/${declared}`)).expect(409);
    await auth(api().post('/factures')).send({ factNum: 'NEW', libFrss: 'X', iceFrs: '001234567000099', mTtc: 12, taux: 0.2, dateFac: `${M}-04`, sousType: SousType.FACTURE_FOURNISSEUR, fiscalMonth: M }).expect(409);
    expect((await factures.trouver(other)).fiscalMonth).toBeFalsy();
  });
  it('archivage, liaison de pièce, affectation et annulation sont refusés', async () => {
    await auth(api().post(`/workspace/invoices/${declared}/archive`)).expect(409);
    await auth(api().post(`/workspace/invoices/${declared}/document`)).send({ documentId: doc }).expect(409);
    await auth(api().post('/workspace/reconciliation')).send({ paymentId: payment, invoiceId: declared }).expect(409);
    expect((await factures.trouver(declared)).archivee).toBe(false);
  });
  it('l’agent IA reçoit le même refus que les routes', async () => {
    const actions = (service as any).agentActions(await (service as any).users.findOneBy({ id: user.sub }), 'conv');
    await expect(actions.corriger(declared, { designation: 'AGENT' }, 'test')).rejects.toThrow('clôturé');
    await expect(actions.rattacher([other], M)).rejects.toThrow('clôturé');
  });
  it('après réouverture, la modification redevient possible et est tracée', async () => {
    await auth(api().post('/workspace/releve/reopen')).send({ month: M }).expect(201);
    await auth(api().put(`/factures/${declared}`)).send({ designation: 'ACHAT REVU' }).expect(200);
    expect((await factures.trouver(declared)).designation).toBe('ACHAT REVU');
    const journal = await auth(api().get('/journal')).expect(200);
    expect(journal.body.some((j: any) => j.action === 'releve_rouvert')).toBe(true);
  });
});
