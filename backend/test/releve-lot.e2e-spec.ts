/**
 * Dossier remis par le comptable (ZIP) → pièces importées → relevé de déduction DGI
 * (contrôles, déductions tardives, XML SIMPL, Excel au modèle officiel, clôture).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { AppModule } from '../src/app.module';
import { releveXlsx } from '../src/unified/releve';

const MONTH = '2026-07';
const header = 'FACT_NUM,DESIGNATION,LIB_FRSS,ICE_FRS,IF,M_TTC,TAUX,ID_PAIE,DATE_PAIE,DATE_FAC';

describe('Relevé de déduction et import de dossier ZIP', () => {
  let app: INestApplication, dir: string, token = '';
  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', 'Bearer ' + token);
  const binary = (res: any, cb: any) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
  async function waitLot(id: string) {
    let lot: any;
    for (let i = 0; i < 200 && lot?.data.status !== 'termine'; i++) {
      await new Promise(r => setTimeout(r, 25));
      lot = (await auth(api().get('/api/workspace/imports/' + id)).expect(200)).body;
    }
    return lot;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'waraqa-releve-'));
    process.env.WARAQA_DB_PATH = join(dir, 'db.sqlite');
    process.env.WARAQA_FILES_PATH = join(dir, 'files');
    process.env.WARAQA_JWT_SECRET = 'releve-e2e';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api');
    await app.init();
    token = (await api().post('/api/auth/inscription').send({ nom: 'Comptable', email: 'releve@example.test', motDePasse: 'ReleveDgi2026!' }).expect(201)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
    delete process.env.WARAQA_DB_PATH; delete process.env.WARAQA_FILES_PATH;
  });

  it('Entreprise : IF et régime validés', async () => {
    await auth(api().put('/api/workspace/settings')).send({ company: { regime: 3 } }).expect(400);
    await auth(api().put('/api/workspace/settings')).send({ company: { iff: 'IF-ABC' } }).expect(400);
    const s = await auth(api().put('/api/workspace/settings')).send({ company: { name: 'STE EXEMPLE SARL', iff: '12345678', regime: 1 } }).expect(200);
    expect(s.body.company).toEqual(expect.objectContaining({ iff: '12345678', regime: 1 }));
  });

  it('Import ZIP : sous-dossiers, modèle DGI (en-têtes ligne 8, ligne Total), CSV, JSON, formats ignorés', async () => {
    // Relevé DGI existant produit au modèle officiel : en-tête sur 7 lignes, Tableau5, ligne Total.
    // Classeur au modèle officiel de LA société configurée : lu comme pièce. (Un classeur d'une autre société
    // resterait « à classer » sans créer de ligne : voir document-roles.e2e-spec.ts.)
    const dgi = releveXlsx({ raisonSociale: 'STE EXEMPLE SARL', identifiantFiscal: '12345678', annee: 2026, periode: 6, regime: 1 }, [
      { id: 1, ord: 1, factNum: '8411', designation: 'RECEVEUR DOUANE', mHt: 1000, tva: 200, mTtc: 1200, iff: '1111', libFrss: 'DROIT DOUANE', iceFrs: '1111', taux: 0.2, idPaie: 4, datePaie: '2026-07-03', dateFac: '2026-07-01', revueHumaine: true },
      { id: 2, ord: 2, factNum: 'FA-GAS', designation: 'GASOIL', mHt: 1000, tva: 100, mTtc: 1100, iff: '15277977', libFrss: 'ENERIA MAROC', iceFrs: '002245147000017', taux: 0.1, idPaie: 3, datePaie: '2026-07-05', dateFac: '2026-07-02', revueHumaine: true },
      { id: 3, ord: 3, factNum: 'SANS-ICE', designation: 'SERVICE', mHt: 500, tva: 100, mTtc: 600, iff: '5550001', libFrss: 'PRESTATAIRE', iceFrs: '', taux: 0.2, idPaie: 4, datePaie: '2026-07-06', dateFac: '2026-07-06', revueHumaine: true },
    ]);
    const csv = `${header}\nCSV-1,ACHAT,Atlas,001234567000012,12345670,2400,20%,4,10/07/2026,08/07/2026\nCASH-1,ACHAT,Caisse Ouest,003333333000033,33333333,6000,20%,1,12/07/2026,12/07/2026\nOLD-1,ACHAT,Retard,004444444000044,44444444,1200,20%,4,15/05/2026,10/05/2026\nPRESCRIT,ACHAT,Ancien,005555555000055,55555555,1200,20%,4,15/05/2025,10/05/2025\n`;
    const json = JSON.stringify([{ factNum: 'JS-1', designation: 'SERVICE', libFrss: 'Json Services', iceFrs: '006666666000066', iff: '66666666', mTtc: 1140, taux: 0.14, idPaie: 2, datePaie: '2026-07-20', dateFac: '2026-07-15' }]);
    const inner = zipSync({ 'annexe.json': strToU8(json) });
    const zip = zipSync({
      'Juillet/Relevé DGI juin.xlsx': new Uint8Array(dgi),
      'Juillet/Banque/achats.csv': strToU8(csv),
      'Juillet/annexes.zip': inner,
      'Juillet/lisez-moi.txt': strToU8('ignoré'),
      '__MACOSX/Juillet/._achats.csv': strToU8('x'),
    });
    await auth(api().post('/api/workspace/imports/zip')).attach('file', Buffer.from('pas un zip'), 'faux.zip').expect(400);
    const lot = await auth(api().post('/api/workspace/imports/zip')).attach('file', Buffer.from(zip), 'dossier-juillet.zip').expect(201);
    expect(lot.body.data.total).toBe(3);
    expect(lot.body.data.skipped).toEqual([{ name: 'Juillet/lisez-moi.txt', reason: 'Format non pris en charge' }]);
    const done = await waitLot(lot.body.id);
    expect(done.data.status).toBe('termine');
    const items = Object.fromEntries(done.data.items.map((x: any) => [x.name, x]));
    expect(items['Juillet/Relevé DGI juin.xlsx']).toEqual(expect.objectContaining({ lines: 3 }));
    expect(items['Juillet/Banque/achats.csv']).toEqual(expect.objectContaining({ lines: 4, state: 'a_verifier' }));
    expect(items['Juillet/annexes/annexe.json']).toEqual(expect.objectContaining({ lines: 1 }));
    const rows = (await auth(api().get('/api/factures')).expect(200)).body;
    const douane = rows.find((f: any) => f.factNum === '8411');
    expect(douane).toEqual(expect.objectContaining({ iff: '1111', iceFrs: '1111', mTtc: 1200, datePaie: '2026-07-03', dateFac: '2026-07-01', idPaie: 4 }));
    expect(rows.find((f: any) => f.factNum === 'FA-GAS')).toEqual(expect.objectContaining({ taux: 0.1, iceFrs: '002245147000017', mHt: 1000, tva: 100 }));
    // Même archive : aucun doublon de pièce.
    const again = await auth(api().post('/api/workspace/imports/zip')).attach('file', Buffer.from(zip), 'dossier-juillet.zip').expect(201);
    expect((await waitLot(again.body.id)).data.items.every((x: any) => x.state === 'deja_importe')).toBe(true);
    expect(done.data.items.length).toBe(3);
    const lots = (await auth(api().get('/api/workspace/imports')).expect(200)).body;
    expect(lots).toHaveLength(2);
  });

  it('Relevé : lignes non revues écartées ; après revue, contrôles DGI appliqués et totaux par taux', async () => {
    let r = (await auth(api().get('/api/workspace/releve')).query({ month: MONTH }).expect(200)).body;
    expect(r.header).toEqual({ raisonSociale: 'STE EXEMPLE SARL', identifiantFiscal: '12345678', annee: 2026, periode: 7, regime: 1 });
    expect(r.lignes).toHaveLength(0);
    const rows = (await auth(api().get('/api/factures')).expect(200)).body;
    for (const f of rows) if (f.statut === 'validee') await auth(api().post(`/api/factures/${f.id}/valider`)).expect(201);
    r = (await auth(api().get('/api/workspace/releve')).query({ month: MONTH }).expect(200)).body;
    const nums = r.lignes.map((l: any) => l.factNum);
    expect(nums).toEqual(['8411', 'FA-GAS', 'CSV-1', 'CASH-1', 'JS-1']);
    expect(r.lignes.map((l: any) => l.ord)).toEqual([1, 2, 3, 4, 5]);
    const ecartee = (n: string) => r.ecartees.find((e: any) => e.ligne.factNum === n);
    expect(ecartee('SANS-ICE').controles.map((c: any) => c.code)).toContain('ice');
    expect(r.alertes.find((a: any) => a.code === 'especes_jour')).toBeTruthy();
    expect(r.totaux).toEqual(expect.objectContaining({ lignes: 5, mTtc: 11840, tva: 1840, mHt: 10000 }));
    expect(r.totaux.parTaux.map((t: any) => [t.taux, t.lignes, t.tva])).toEqual([[0.2, 3, 1600], [0.14, 1, 140], [0.1, 1, 100]]);
    // Déductions tardives : paiement de mai 2026 proposé ; paiement de mai 2025 hors délai d'un an.
    const old = r.reports.find((x: any) => x.factNum === 'OLD-1');
    expect(old.moisOrigine).toBe('2026-05');
    expect(r.reports.find((x: any) => x.factNum === 'PRESCRIT')).toBeUndefined();
    r = (await auth(api().post('/api/workspace/releve/attach')).send({ ids: [old.id], month: MONTH }).expect(201)).body;
    expect(r.lignes.map((l: any) => l.factNum)).toContain('OLD-1');
    expect(r.reports.find((x: any) => x.factNum === 'OLD-1')).toBeUndefined();
    const prescrit = rows.find((f: any) => f.factNum === 'PRESCRIT');
    r = (await auth(api().post('/api/workspace/releve/attach')).send({ ids: [prescrit.id], month: MONTH }).expect(201)).body;
    expect(r.ecartees.find((e: any) => e.ligne.factNum === 'PRESCRIT').controles.map((c: any) => c.code)).toContain('delai');
    await auth(api().post('/api/workspace/releve/detach/' + prescrit.id)).expect(201);
  });

  it('Fichiers : XML EDI SIMPL, Excel au modèle DGI (Tableau5 + mappage XML) et PDF', async () => {
    const x = await auth(api().get('/api/workspace/releve/export')).query({ month: MONTH, format: 'xml' }).buffer(true).parse(binary).expect(200);
    expect(x.headers['content-disposition']).toContain(`Releve-deduction-${MONTH}.xml`);
    const xml = x.body.toString('utf8');
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"/);
    expect(xml).toContain('<DeclarationReleveDeduction><identifiantFiscal>12345678</identifiantFiscal><annee>2026</annee><periode>7</periode><regime>1</regime><releveDeductions>');
    expect((xml.match(/<rd>/g) || []).length).toBe(6);
    expect(xml).toContain('<rd><ord>1</ord><num>OLD-1</num>');
    expect(xml).toContain('<rd><ord>2</ord><num>8411</num><des>RECEVEUR DOUANE</des><mht>1000.00</mht><tva>200.00</tva><ttc>1200.00</ttc><refF><if>1111</if><nom>DROIT DOUANE</nom><ice>1111</ice></refF><tx>0.2</tx><mp><id>4</id></mp><dpai>2026-07-03</dpai><dfac>2026-07-01</dfac></rd>');

    const b = await auth(api().get('/api/workspace/releve/export')).query({ month: MONTH, format: 'xlsx' }).buffer(true).parse(binary).expect(200);
    const parts = unzipSync(new Uint8Array(b.body));
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml']);
    expect(sheet).not.toMatch(/__[A-Z_]+__/);
    expect(strFromU8(parts['xl/tables/table1.xml'])).toContain('ref="A8:M15"');
    expect(parts['xl/xmlMaps.xml']).toBeTruthy();
    expect(parts['xl/vbaProject.bin']).toBeUndefined();
    const ws = XLSX.read(b.body, { type: 'buffer' }).Sheets.EDI;
    expect([ws.C2.v, ws.C3.v, ws.C4.v, ws.C5.v, ws.C6.v]).toEqual(['STE EXEMPLE SARL', 12345678, 2026, 7, 1]);
    expect([ws.A9.v, ws.B9.v, ws.B10.v, ws.F10.v, ws.J10.v, ws.I11.v]).toEqual([1, 'OLD-1', '8411', 1200, 0.2, '002245147000017']);
    expect(XLSX.SSF.format('yyyy-mm-dd', ws.L10.v)).toBe('2026-07-03');
    expect([ws.A15.v, ws.E15.v, ws.F15.v]).toEqual(['Total', 2040, 13040]);

    const pdf = await auth(api().get('/api/workspace/releve/export')).query({ month: MONTH, format: 'pdf' }).buffer(true).parse(binary).expect(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    await auth(api().get('/api/workspace/releve/export')).query({ month: '2026-01', format: 'xml' }).expect(400);
    await auth(api().get('/api/workspace/releve/export')).query({ month: MONTH, format: 'docx' }).expect(400);
  });

  it('Clôture : rattachements figés, modification refusée, réouverture tracée', async () => {
    const r = (await auth(api().post('/api/workspace/releve/close')).send({ month: MONTH }).expect(201)).body;
    expect(r.cloture).toEqual(expect.objectContaining({ month: MONTH, totaux: expect.objectContaining({ lignes: 6 }) }));
    const rows = (await auth(api().get('/api/factures')).expect(200)).body;
    expect(rows.filter((f: any) => f.fiscalMonth === MONTH)).toHaveLength(6);
    await auth(api().post('/api/workspace/releve/close')).send({ month: MONTH }).expect(409);
    await auth(api().post('/api/workspace/releve/attach')).send({ ids: [rows[0].id], month: MONTH }).expect(409);
    await auth(api().post('/api/workspace/releve/reopen')).send({ month: MONTH }).expect(201);
    const journal = JSON.stringify((await auth(api().get('/api/journal')).expect(200)).body);
    for (const action of ['lot_importe', 'releve_genere', 'ligne_rattachee_periode', 'releve_cloture', 'releve_rouvert']) expect(journal).toContain(action);
  });

  it('Discussion : une pièce déjà importée est réutilisée au lieu d’être refusée', async () => {
    const csv = Buffer.from(`${header}\nREUSE-1,ACHAT,Reprise,007777777000077,77777777,120,20%,4,01/07/2026,01/07/2026\n`);
    const first = await auth(api().post('/api/workspace/documents')).attach('file', csv, 'reprise.csv').expect(201);
    await auth(api().post('/api/workspace/documents')).attach('file', csv, 'reprise.csv').expect(409);
    const reused = await auth(api().post('/api/workspace/documents?reuse=true')).attach('file', csv, 'reprise.csv').expect(201);
    expect(reused.body.id).toBe(first.body.id);
  });
});
