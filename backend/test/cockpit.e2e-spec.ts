/**
 * Précontrôle et plan de travail (plan L1.1 / L8.1) : les mêmes blocages, compteurs et
 * identifiants pour l'interface (routes) et l'assistant (outils), calculés par le serveur.
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
import { AssistantTools } from '../src/ia/assistant';

const M = '2026-08';
describe('Précontrôle et plan de travail', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string;
  let complete: number, incomplete: number, dup: number;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-cockpit-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-cockpit';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    const a = await app.get(AuthService).inscrire({ nom: 'Admin', email: 'cockpit@example.test', motDePasse: 'CockpitTest2026!' });
    user = { sub: a.utilisateur.id, nom: a.utilisateur.nom }; token = a.accessToken;
    const base = { libFrss: 'Fournisseur', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT', taux: 0.2, idPaie: 4, sousType: SousType.FACTURE_FOURNISSEUR, dateFac: `${M}-02`, datePaie: `${M}-05` };
    complete = (await factures.creer({ ...base, factNum: 'OK-1', mTtc: 1200 }, service.actor(user))).id;
    incomplete = (await factures.creer({ ...base, factNum: 'INC-1', mTtc: 600, iceFrs: undefined }, service.actor(user))).id;
    dup = (await factures.creer({ ...base, factNum: 'OK-1', mTtc: 1200 }, service.actor(user))).id;
    await factures.creer({ mTtc: 1200, taux: 0, datePaie: `${M}-05`, idPaie: 4, sousType: SousType.AVIS_DEBIT_VIREMENT }, service.actor(user));
    const buffer = Buffer.from('FACT_NUM;LIB_FRSS;M_TTC;TAUX;DATE_FAC\nX;Autre;120;20;2026-08-01');
    await service.upload({ originalname: 'classeur-inconnu.csv', size: buffer.length, buffer } as any, user, false, false, 'a_classifier');
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('précontrôle : société incomplète, lignes non revues, incomplètes, doublons et documents à classer, avec actions', async () => {
    const p = (await auth(api().get(`/workspace/precontrole?month=${M}`)).expect(200)).body;
    expect(p.societe.complete).toBe(false); expect(p.societe.manques).toEqual(['identifiant fiscal (IF)']);
    expect(p.periode).toEqual(expect.objectContaining({ lignes: 3, bancaires: 1, nonRevues: 1, incompletes: 1, doublons: 1 }));
    expect(p.sources).toEqual(expect.objectContaining({ documents: 1, aClassifier: 1, references: 1 }));
    const codes = p.blocages.map((b: any) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['societe_incomplete', 'documents_a_classifier', 'lignes_incompletes', 'doublons_non_traites', 'lignes_non_revues']));
    const revue = p.blocages.find((b: any) => b.code === 'lignes_non_revues');
    expect(revue.action).toEqual({ type: 'valider_lignes', factureIds: [complete], libelle: 'Marquer 1 ligne(s) revue(s)' });
    expect(p.blocages.find((b: any) => b.code === 'lignes_incompletes').ids).toEqual([incomplete]);
    expect(p.blocages.find((b: any) => b.code === 'doublons_non_traites').ids).toEqual([dup]);
    expect(p.pret).toEqual({ brouillon: true, definitif: false, cloture: false });
    expect(p.releve.ecarteesParMotif.revue).toBe(3); // les trois lignes d'achat sont non revues
  });
  it('plan de travail : entonnoir avec identifiants, états et invites prêtes pour l’assistant', async () => {
    const plan = (await auth(api().get(`/workspace/plan-travail?month=${M}`)).expect(200)).body;
    const by = Object.fromEntries(plan.etapes.map((e: any) => [e.code, e]));
    expect(by.a_classer).toEqual(expect.objectContaining({ nombre: 1, etat: 'attention' }));
    expect(by.a_completer).toEqual(expect.objectContaining({ nombre: 1, ids: [incomplete], etat: 'a_faire' }));
    expect(by.a_controler).toEqual(expect.objectContaining({ nombre: 1, ids: [dup] }));
    expect(by.pret_revue).toEqual(expect.objectContaining({ nombre: 1, ids: [complete] }));
    expect(by.releve.etat).toBe('bloque'); expect(by.cloture.etat).toBe('bloque');
    expect(by.a_completer.invite).toContain(M);
    expect(plan.prochaineEtape.code).toBe('a_classer');
  });
  it('les mêmes résultats sont servis à l’assistant, puis les blocages tombent quand le travail est fait', async () => {
    const tools = new AssistantTools((service as any).assistantHost(user.sub, true), M);
    const before = JSON.parse((await tools.run('precontroler_releve', {})).content);
    expect(before.blocages.map((b: any) => b.code)).toContain('societe_incomplete');
    expect(tools.traces[0].summary).toContain('bloquant');
    await service.updateSettings({ company: { name: 'Société Test', iff: '12345678' } }, user);
    await factures.validerLigne(complete, service.actor(user));
    await service.archive(dup, user);
    await factures.modifier(incomplete, { iceFrs: '001234567000099' }, service.actor(user));
    await factures.validerLigne(incomplete, service.actor(user));
    const after = JSON.parse((await tools.run('precontroler_releve', {})).content);
    const codes = after.blocages.map((b: any) => b.code);
    for (const c of ['societe_incomplete', 'lignes_non_revues', 'lignes_incompletes', 'doublons_non_traites']) expect(codes).not.toContain(c);
    expect(after.pret.definitif).toBe(true); expect(after.releve.retenues).toBe(2);
    const plan = JSON.parse((await tools.run('plan_de_travail', {})).content);
    expect(plan.etapes.find((e: any) => e.code === 'releve').etat).toBe('fait');
    expect(plan.etapes.find((e: any) => e.code === 'cloture')).toEqual(expect.objectContaining({ etat: 'a_faire', invite: expect.stringContaining('clôture') }));
    expect(after.pret.cloture).toBe(true);
  });
});
