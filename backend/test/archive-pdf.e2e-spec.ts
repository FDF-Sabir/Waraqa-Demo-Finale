import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import parsePdf from 'pdf-parse';
import * as XLSX from 'xlsx';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { FacturesService } from '../src/factures/factures.service';
import { UnifiedService } from '../src/unified/unified.service';
import { archivePdf } from '../src/unified/archive-pdf';
import { SousType } from '../src/common/types';

describe('Archives PDF', () => {
  let app: INestApplication, dir: string, service: UnifiedService, factures: FacturesService, user: any, token: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-pdf-'));
    process.env.WARAQA_DB_PATH = join(dir, 'test.sqlite');
    process.env.WARAQA_FILES_PATH = join(dir, 'files');
    process.env.WARAQA_JWT_SECRET = 'pdf-test-only-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    service = app.get(UnifiedService);
    factures = app.get(FacturesService);
    const account = await app.get(AuthService).inscrire({ nom: 'Test PDF', email: 'pdf@example.test', motDePasse: 'PdfTestOnly2026!' });
    user = { sub: account.utilisateur.id, nom: account.utilisateur.nom };
    token = account.accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
    delete process.env.WARAQA_DB_PATH;
    delete process.env.WARAQA_FILES_PATH;
    delete process.env.WARAQA_JWT_SECRET;
  });
  async function getPdf(path: string) {
    const result = await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
      .expect(200).expect('Content-Type', /application\/pdf/).expect('Content-Disposition', /attachment; filename=".*\.pdf"/);
    expect(result.body.subarray(0, 5).toString()).toBe('%PDF-');
    return parsePdf(result.body);
  }
  it('protège les téléchargements et refuse les snapshots absents', async () => {
    await request(app.getHttpServer()).get('/workspace/archives/pdf').expect(401);
    await request(app.getHttpServer()).get('/workspace/snapshots/unknown/pdf').expect(401);
    await request(app.getHttpServer()).get('/workspace/snapshots/unknown/pdf').set('Authorization', `Bearer ${token}`).expect(404);
  });
  it('génère un PDF lisible même sans archive', async () => {
    const pdf = await getPdf('/workspace/archives/pdf');
    expect(pdf.numpages).toBe(1);
    expect(pdf.text).toContain('Aucune ligne dans cette archive.');
  });
  it('exporte uniquement les archives et préserve le contenu figé des snapshots', async () => {
    const row = await factures.creer({ factNum: 'PDF-ORIGINAL', libFrss: 'Société Électricité', iceFrs: '000123456000012', iff: '0012345', designation: 'Réparation', mTtc: 120, taux: 0.2, dateFac: '2026-09-01', sousType: SousType.FACTURE_FOURNISSEUR }, service.actor(user));
    await factures.creer({ factNum: 'ACTIVE-EXCLUDED', mTtc: 60, taux: 0.2, dateFac: '2026-09-01', sousType: SousType.FACTURE_FOURNISSEUR }, service.actor(user));
    const snapshot = await service.snapshot('2026-09', user);
    await factures.modifier(row.id, { factNum: 'PDF-MODIFIED', mTtc: 240 }, service.actor(user));
    await service.archive(row.id, user);
    const archived = await getPdf('/workspace/archives/pdf');
    expect(archived.text).toContain('PDF-MODIFIED');
    expect(archived.text).toContain('240,00 MAD');
    expect(archived.text).toContain('000123456000012');
    expect(archived.text).toContain('Société Électricité');
    expect(archived.text).not.toContain('ACTIVE-EXCLUDED');
    const frozen = await getPdf(`/workspace/snapshots/${snapshot.id}/pdf`);
    expect(frozen.text).toContain('PDF-ORIGINAL');
    expect(frozen.text).toContain('120,00');
    expect(frozen.text).toContain('TTC · MAD');
    expect(frozen.text).not.toContain('PDF-MODIFIED');
    expect(frozen.text).toContain(snapshot.data.createdAt);
    expect((await factures.trouver(row.id)).archivee).toBe(true);
  });
  it('conserve toutes les lignes et les textes longs sur plusieurs pages', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, factNum: `REFERENCE-${i + 1}-FIN`, designation: i === 0 ? 'Désignation très longue '.repeat(200) + 'FIN-DESIGNATION' : 'Réparation', mHt: -100, tva: -20, mTtc: -120, taux: 0.2, demonstration: true, champsManquants: ['ICE'] } as any));
    const pdf = await parsePdf(await archivePdf({ title: 'Test pagination', createdAt: '2026-09-23', rows }));
    expect(pdf.numpages).toBeGreaterThan(2);
    for (const row of rows) expect(pdf.text).toContain(row.factNum);
    expect(pdf.text).toContain('FIN-DESIGNATION');
    expect(pdf.text).toContain('-120,00');
    expect(pdf.text).toContain('TTC · MAD');
    expect(pdf.text).toContain('EXEMPLE FICTIF');
    expect(pdf.text).toContain('Champs manquants : ICE');
  });
  it('exporte en PDF exactement les lignes Excel avec les mêmes filtres', async () => {
    await service.seed('2026-10', user);
    const common = {libFrss:'Fournisseur réel', iceFrs:'000123456000012', iff:'1234', designation:'SERVICE', mTtc:120, taux:0.2, dateFac:'2026-10-01', datePaie:'2026-10-03', idPaie:4, sousType:SousType.FACTURE_FOURNISSEUR};
    const reviewed = await factures.creer({...common, factNum:'PDF-REVIEWED'}, service.actor(user));
    await factures.validerLigne(reviewed.id, service.actor(user));
    await factures.creer({...common, factNum:'PDF-PENDING'}, service.actor(user));
    await factures.creer({mTtc:999999, taux:0, datePaie:'2026-10-01', sousType:SousType.AVIS_DEBIT_VIREMENT, factNum:'BANK-EXCLUDED'}, service.actor(user));
    for (const scope of ['all', 'reviewed']) for (const examples of [false, true]) {
      const excel = await service.export('2026-10','xlsx',scope,user,examples);
      const wb = XLSX.read(excel.buffer, {type:'buffer'});
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets.EDI);
      const pdf = await getPdf(`/workspace/export?month=2026-10&format=pdf&scope=${scope}&examples=${examples}`);
      for (const row of rows) if (row.FACT_NUM) expect(pdf.text).toContain(row.FACT_NUM);
      expect(pdf.text).not.toContain('BANK-EXCLUDED');
      if (scope === 'reviewed') expect(pdf.text).not.toContain('PDF-PENDING');
      if (!examples) expect(pdf.text).not.toContain('EXEMPLES FICTIFS');
      expect(pdf.text).toContain(scope === 'all' ? 'BROUILLON' : 'Lignes revues humainement');
    }
  });
  it('fige aussi l’identité de l’entreprise dans les nouveaux snapshots', async () => {
    const before = await service.settings();
    const snapshot = await service.snapshot('2026-11', user);
    await service.updateSettings({company:{...before.company,name:'Entreprise modifiée après snapshot'}},user);
    const pdf = await getPdf(`/workspace/snapshots/${snapshot.id}/pdf`);
    expect(pdf.text).toContain(before.company.name);
    expect(pdf.text).not.toContain('Entreprise modifiée après snapshot');
  });
});
