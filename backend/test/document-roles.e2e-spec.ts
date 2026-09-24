/**
 * Rôles documentaires de bout en bout (plan L1.3 / L2.1) : un lot hétérogène ne crée des lignes
 * que depuis les pièces comptables ; modèles, historiques, référentiels, vérité terrain et annexes
 * sont conservés comme références, reclassables par le comptable ; le chat les distingue.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { zipSync, strToU8 } from 'fflate';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';

const T5 = 'OR;FACT_NUM;DESIGNATION;M_TTC;IF;LIB_FRSS;ICE_FRS;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC';
const row = (i: number, month: string) => `${i};F-${month}-${i};ACHAT;120;12345678;Fournisseur ${i};001234567000012;20;4;${month}-10;${month}-03`;
function xlsx(rows: any[][], raison = 'STE AUTRE') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['', '', '', '', '', '', '', '', '', '', '', '', 'RAISON SOCIAL'], ['', raison, '', 'ID_FISCAL'], ['', '999', '', 'ANNEE'], [], [], [], [],
    ['OR', 'FACT_NUM', 'DESIGNATION', 'M_HT', 'TVA', 'M_TTC', 'IF', 'LIB_FRSS', 'ICE_FRS', 'TAUX', 'ID_PAIE', 'DATE_PAIE', 'DATE_FAC'], ...rows]), 'EDI');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
const hist = Array.from({ length: 30 }, (_, i) => [i + 1, 'H-' + i, 'ACHAT', 100, 20, 120, '123', 'Frs', '001234567000012', 0.2, 4, `2025-0${(i % 4) + 1}-10`, `2025-0${(i % 4) + 1}-01`]);

describe('Rôles documentaires', () => {
  let app: INestApplication, dir: string, token: string, service: UnifiedService;
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const wait = async (id: string) => { for (let i = 0; i < 200; i++) { const l = await auth(api().get('/api/workspace/imports/' + id)); if (l.body.data.status !== 'en_cours') return l.body.data; await new Promise(r => setTimeout(r, 50)); } throw new Error('lot trop long'); };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-roles-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite'); process.env.WARAQA_FILES_PATH = join(dir, 'files'); process.env.WARAQA_JWT_SECRET = 'test-only-roles';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); app.setGlobalPrefix('api'); await app.init();
    service = app.get(UnifiedService);
    token = (await api().post('/api/auth/inscription').send({ nom: 'Admin', email: 'roles@example.test', motDePasse: 'RolesTest2026!' }).expect(201)).body.accessToken;
    await auth(api().put('/api/workspace/settings')).send({ company: { name: 'Finder Electronic Morocco', iff: '12345678' } }).expect(200);
  });
  afterAll(async () => { await app?.close(); await rm(dir, { recursive: true, force: true }); for (const k of ['WARAQA_DB_PATH', 'WARAQA_FILES_PATH']) delete process.env[k]; });

  it('un ZIP hétérogène ne comptabilise que les pièces ; les références sont conservées sans ligne', async () => {
    const zip = Buffer.from(zipSync({
      'Jeu/01_Factures/juillet.csv': strToU8([T5, row(1, '2026-07'), row(2, '2026-07')].join('\n')),
      'Jeu/99_Verite_terrain/attendu.csv': strToU8([T5, row(1, '2026-07'), row(2, '2026-07'), row(3, '2026-07')].join('\n')),
      'Jeu/07_Classeurs_EDI_TVA_historiques/TVA_2025.xlsx': new Uint8Array(xlsx(hist)),
      'Jeu/14_Referentiels/fournisseurs.csv': strToU8('ICE;Nom\n001234567000012;Fournisseur 1'),
      'Jeu/10_Documents_non_comptabilisables_BL_BC_Devis_Proforma/devis-7.pdf': strToU8('%PDF-1.4 devis'),
      'Jeu/lecture.txt': strToU8('notes'),
    }));
    const lot = (await auth(api().post('/api/workspace/imports/zip')).attach('file', zip, 'Jeu_de_test.zip').expect(201)).body;
    expect(lot.data.total).toBe(5); expect(lot.data.skipped).toHaveLength(1);
    const done = await wait(lot.id);
    const byName = Object.fromEntries(done.items.map((x: any) => [x.name.split('/')[1], x]));
    expect(byName['01_Factures']).toEqual(expect.objectContaining({ state: 'a_verifier', lines: 2, role: 'piece_comptable' }));
    expect(byName['99_Verite_terrain']).toEqual(expect.objectContaining({ state: 'reference', lines: 0, role: 'evaluation' }));
    expect(byName['07_Classeurs_EDI_TVA_historiques']).toEqual(expect.objectContaining({ state: 'reference', lines: 0, role: 'historique' }));
    expect(byName['14_Referentiels']).toEqual(expect.objectContaining({ state: 'reference', role: 'referentiel' }));
    expect(byName['10_Documents_non_comptabilisables_BL_BC_Devis_Proforma']).toEqual(expect.objectContaining({ state: 'reference', role: 'justificatif_annexe' }));
    expect(done.lines).toBe(2); expect(done.references).toBe(4);
    expect((await auth(api().get('/api/factures')).expect(200)).body).toHaveLength(2);
    const journal = (await auth(api().get('/api/journal')).expect(200)).body;
    expect(journal.filter((j: any) => j.action === 'document_reference')).toHaveLength(4);
  });
  it('un classeur d’une autre société reste à classer ; la contradiction d’identité est signalée', async () => {
    const buffer = xlsx([[1, 'X-1', 'ACHAT', 100, 20, 120, '123', 'Frs', '001234567000012', 0.2, 4, '2026-07-10', '2026-07-01']], 'STE TRANS RIYAD SELLAM');
    const d = (await auth(api().post('/api/workspace/documents')).attach('file', buffer, 'TVA 07 2026.xlsx').expect(201)).body;
    expect(d.data.status).toBe('reference'); expect(d.data.role).toBe('a_classifier'); expect(d.data.identiteContradictoire).toBe(true);
    expect(d.data.identite.raisonSociale).toBe('STE TRANS RIYAD SELLAM');
    expect((await auth(api().get('/api/workspace/settings')).expect(200)).body.company.name).toBe('Finder Electronic Morocco');
    // Relecture ou reprise : jamais de ligne tant que le rôle n'est pas « pièce ».
    await auth(api().post(`/api/workspace/documents/${d.id}/retry`)).expect(409);
    // Reclassement explicite par le comptable → lecture et création des lignes, tracée.
    const piece = (await auth(api().post(`/api/workspace/documents/${d.id}/role`)).send({ role: 'piece_comptable' }).expect(201)).body;
    expect(piece.data.role).toBe('piece_comptable'); expect(piece.data.roleSource).toBe('utilisateur'); expect(piece.data.invoiceIds).toHaveLength(1);
    await auth(api().post(`/api/workspace/documents/${d.id}/role`)).send({ role: 'modele' }).expect(409);
    await auth(api().post(`/api/workspace/documents/${d.id}/role`)).send({ role: 'inconnu' }).expect(400);
  });
  it('rôle imposé au dépôt : un classeur joint comme modèle ne change aucun total', async () => {
    const before = (await auth(api().get('/api/workspace/summary?month=2026-07')).expect(200)).body;
    const d = (await auth(api().post('/api/workspace/documents?role=modele')).attach('file', xlsx([[1, 'M-1', 'ACHAT', 100, 20, 120, '123', 'Frs', '001234567000012', 0.2, 4, '2026-07-10', '2026-07-01']], 'Finder Electronic Morocco'), 'modele-comptable.xlsx').expect(201)).body;
    expect(d.data).toEqual(expect.objectContaining({ role: 'modele', roleSource: 'utilisateur', status: 'reference', invoiceIds: [] }));
    const after = (await auth(api().get('/api/workspace/summary?month=2026-07')).expect(200)).body;
    expect(after.count).toBe(before.count); expect(after.totalTtc).toBe(before.totalTtc);
    expect((await auth(api().get('/api/workspace/documents/roles')).expect(200)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'modele', creeDesLignes: false })]));
  });
  it('le chat distingue les documents de référence et le catalogue liste les capacités réelles', async () => {
    const docs = (await auth(api().get('/api/workspace/documents')).expect(200)).body.filter((x: any) => x.data.status === 'reference');
    const c = (await auth(api().post('/api/workspace/conversations')).send({ month: '2026-07' }).expect(201)).body;
    const r = await auth(api().post(`/api/workspace/conversations/${c.id}/messages`)).send({ text: 'Analyse ce modèle', documentIds: [docs[0].id] }).expect(201);
    expect(r.body.data.messages[1].content).toContain('sans création de ligne');
    const cap = (await auth(api().get('/api/workspace/capacites')).expect(200)).body;
    expect(cap.actions.map((a: any) => a.nom)).toContain('importer_drive');
    expect(cap.lecture.map((a: any) => a.nom)).toEqual(expect.arrayContaining(['capacites', 'pieces', 'releve_deduction']));
    expect(cap.rolesDocumentaires).toHaveLength(8); expect(cap.acces.administrateur).toBe(true);
    expect(cap.acces.googleDrive.etat).toContain('Intégrations');
  });
});
