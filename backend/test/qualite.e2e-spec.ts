/**
 * Qualité d'extraction, fiabilité des lignes et bilan quotidien (plan §3.3, §9.9, L7.3).
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

const M = new Date().toISOString().slice(0, 7);
describe('Qualité d’extraction et bilan quotidien', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-qualite-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-qualite';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    service = app.get(UnifiedService); factures = app.get(FacturesService);
    const a = await app.get(AuthService).inscrire({ nom: 'Admin', email: 'qualite@example.test', motDePasse: 'QualiteTest2026!' });
    user = { sub: a.utilisateur.id, nom: a.utilisateur.nom }; token = a.accessToken;
    const csv = Buffer.from(`FACT_NUM;LIB_FRSS;ICE_FRS;IF;DESIGNATION;M_TTC;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC\nQ-1;Frs;001234567000012;12345678;ACHAT;1200;20;4;${M}-05;${M}-02\nQ-2;Frs;001234567000012;12345678;ACHAT;abc;20;4;${M}-05;${M}-02`);
    await service.upload({ originalname: 'structure.csv', size: csv.length, buffer: csv } as any, user);
    // Pièce lue par l'IA avec une confiance sous le seuil : simulée par l'enregistrement du document.
    const pdf = Buffer.from('%PDF-fictif-ia');
    const doc = await service.upload({ originalname: 'scan.pdf', size: pdf.length, buffer: pdf } as any, user);
    const row = await factures.creer({ factNum: 'Q-3', libFrss: 'Scan', iceFrs: '001234567000013', iff: '12345679', designation: 'ACHAT', mTtc: 240, taux: 0.2, idPaie: 4, dateFac: `${M}-04`, datePaie: `${M}-06`, sousType: SousType.FACTURE_FOURNISSEUR }, service.actor(user), { documentId: doc.id, importKey: doc.id + ':0' });
    doc.data.mode = 'ia_live'; doc.data.confidence = 0.62; doc.data.status = 'a_verifier'; doc.data.invoiceIds = [row.id];
    await service.save(doc.id, 'document', doc.data);
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('mesure modes, confiance, erreurs normalisées et fiabilité des lignes', async () => {
    const q = (await auth(api().get(`/workspace/qualite?month=${M}`)).expect(200)).body;
    expect(q.documents.parMode).toEqual({ import_structure: 1, ia_live: 1 });
    expect(q.confianceIA).toEqual(expect.objectContaining({ documents: 1, moyenne: 0.62, distribution: { faible: 0, moyenne: 1, haute: 0 } }));
    expect(q.confianceIA.sousSeuil[0]).toEqual(expect.objectContaining({ nom: 'scan.pdf', confiance: 0.62, lignes: 1 }));
    expect(q.erreurs.causes[0]).toEqual({ message: 'mTtc à corriger', occurrences: 1 });
    expect(q.lignes).toEqual(expect.objectContaining({ total: 2, fiablesNonRevues: 1, aExaminer: 1 }));
    expect(q.lignes.aExaminerDetail[0].raisons[0]).toContain('confiance IA 62 %');
    const plan = (await auth(api().get(`/workspace/plan-travail?month=${M}`)).expect(200)).body;
    const step = plan.etapes.find((e: any) => e.code === 'pret_revue');
    expect(step.fiables).toHaveLength(1); expect(step.aExaminer).toHaveLength(1); expect(step.invite).toContain('1 ligne(s) fiables');
    const tools = new AssistantTools((service as any).assistantHost(user.sub, true), M);
    expect(tools.traces.length).toBe(0);
    const r = await tools.run('qualite_extraction', {});
    expect(tools.traces[0].summary).toContain('1 fiable(s), 1 à examiner');
    expect(JSON.parse(r.content).seuilConfiance).toBe(0.85);
  });
  it('le bilan quotidien est produit une seule fois par jour et notifié', async () => {
    await service.schedule(); await service.schedule();
    const briefs = (await auth(api().get('/workspace/briefs')).expect(200)).body;
    expect(briefs).toHaveLength(1);
    expect(briefs[0].data).toEqual(expect.objectContaining({ month: M, prochaineEtape: expect.objectContaining({ code: 'a_completer' }) }));
    const journal = (await auth(api().get('/journal')).expect(200)).body.filter((j: any) => j.action === 'bilan_quotidien');
    expect(journal).toHaveLength(1);
    const notifications = (await auth(api().get('/notifications')).expect(200)).body;
    expect(notifications.some((n: any) => n.action === 'bilan_quotidien')).toBe(true);
    await service.updateSettings({ integrations: { dailyBrief: false } }, user);
    expect((await service.settings()).integrations.dailyBrief).toBe(false);
  });
});
