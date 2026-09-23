import * as XLSX from 'xlsx';
import { strToU8, zipSync } from 'fflate';
import { construireReleve, controlerEspeces, controlerLigne, excelDate, monthGap, releveXlsx, releveXml } from './releve';
import { aliasFor, readSheetRows, toIsoDate } from './table-import';
import { extractZip } from './archive-import';
import { FactureEntity } from '../factures/facture.entity';
import { SousType, StatutFacture } from '../common/types';

const FIELDS = ['or', 'factNum', 'designation', 'mHt', 'tva', 'mTtc', 'iff', 'libFrss', 'iceFrs', 'taux', 'idPaie', 'datePaie', 'dateFac'];
let seq = 0;
function row(p: Partial<FactureEntity>): FactureEntity {
  const mTtc = p.mTtc ?? 1200, taux = p.taux ?? 0.2;
  const mHt = Math.round((mTtc / (1 + taux)) * 100) / 100;
  return {
    id: ++seq, factNum: 'F-' + seq, designation: 'ACHAT', libFrss: 'Fournisseur', iff: '12345678', iceFrs: '001234567000012',
    mTtc, taux, mHt, tva: Math.round((mTtc - mHt) * 100) / 100, idPaie: 4, datePaie: '2026-07-10', dateFac: '2026-07-05',
    sousType: SousType.FACTURE_FOURNISSEUR, statut: StatutFacture.VALIDEE, revueHumaine: true, archivee: false, demonstration: false, vigilanceRenforcee: false,
    ...p,
  } as FactureEntity;
}
const codes = (f: FactureEntity, month = '2026-07') => controlerLigne(f, month, 1).map(c => c.code);

describe('Relevé de déduction : contrôles DGI', () => {
  it('ligne conforme : aucun contrôle', () => expect(codes(row({}))).toEqual([]));
  it('ICE sur 15 chiffres, IF numérique, convention douane 1111', () => {
    expect(codes(row({ iceFrs: '1234567' }))).toContain('ice');
    expect(codes(row({ iceFrs: '' }))).toContain('ice');
    expect(codes(row({ iff: 'A12' }))).toContain('if');
    expect(codes(row({ iff: '1111', iceFrs: '1111' }))).toEqual([]);
  });
  it('taux, mode de paiement, dates, délai d’un an, avance, doublon', () => {
    expect(codes(row({ taux: 0, mTtc: 100 }))).toContain('taux');
    expect(codes(row({ idPaie: undefined }))).toContain('mode_paiement');
    expect(codes(row({ datePaie: '' }))).toContain('date_paiement');
    expect(controlerLigne(row({ datePaie: '' }), '2026-07', 2).map(c => c.code)).not.toContain('date_paiement');
    expect(codes(row({ datePaie: '2026-08-01' }))).toContain('paiement_futur');
    expect(codes(row({ datePaie: '2025-07-15', dateFac: '2025-07-01' }))).toEqual([]);
    expect(codes(row({ datePaie: '2025-06-30', dateFac: '2025-06-01' }))).toContain('delai');
    expect(codes(row({ dateFac: '2026-07-20' }))).toContain('avance');
    expect(codes(row({ doublonDe: 3 }))).toContain('doublon');
  });
  it('espèces : plafond 5 000 DH par jour et par fournisseur', () => {
    const a = row({ idPaie: 1, mTtc: 3000, datePaie: '2026-07-02' }), b = row({ idPaie: 1, mTtc: 2500, datePaie: '2026-07-02' }), c = row({ idPaie: 1, mTtc: 4000, datePaie: '2026-07-03' });
    const alerts = controlerEspeces([a, b, c]);
    expect(alerts.filter(x => x.code === 'especes_jour').map(x => x.id).sort()).toEqual([a.id, b.id].sort());
  });
  it('écart en mois', () => {
    expect(monthGap('2025-07', '2026-07')).toBe(12);
    expect(monthGap('2026-06', '2026-07')).toBe(1);
  });
});

describe('Relevé de déduction : sélection et totaux', () => {
  const july = [row({ factNum: 'A' }), row({ factNum: 'B', taux: 0.1, mTtc: 1100, datePaie: '2026-07-02' })];
  const others = [
    row({ factNum: 'NON-REVUE', revueHumaine: false }),
    row({ factNum: 'MAI', datePaie: '2026-05-20' }),
    row({ factNum: 'RATTACHEE', datePaie: '2026-04-02', fiscalMonth: '2026-07' }),
    row({ factNum: 'BANQUE', sousType: SousType.AVIS_DEBIT_VIREMENT, designation: 'VIREMENT' }),
    row({ factNum: 'DEMO', demonstration: true }),
  ];
  const r = construireReleve([...july, ...others], '2026-07', 1);
  it('lignes retenues triées par date de paiement, rattachement fiscal pris en compte', () => {
    expect(r.lignes.map(l => l.factNum)).toEqual(['RATTACHEE', 'B', 'A']);
    expect(r.lignes.map(l => l.ord)).toEqual([1, 2, 3]);
  });
  it('non revue écartée, report proposé, banque et démo exclues', () => {
    expect(r.ecartees.map(e => e.ligne.factNum)).toEqual(['NON-REVUE']);
    expect(r.reports.map(x => x.factNum)).toEqual(['MAI']);
    expect(construireReleve([...july, ...others], '2026-07', 1, 'all').lignes.map(l => l.factNum)).toContain('NON-REVUE');
  });
  it('totaux au centime et par taux', () => {
    expect(r.totaux).toEqual(expect.objectContaining({ lignes: 3, mTtc: 3500, tva: 500 }));
    expect(r.totaux.parTaux.map(t => [t.taux, t.lignes, t.tva])).toEqual([[0.2, 2, 400], [0.1, 1, 100]]);
  });
  it('régime des débits : rattachement au mois de facture', () => {
    const d = construireReleve([row({ factNum: 'D', dateFac: '2026-06-28', datePaie: '2026-07-03' })], '2026-06', 2);
    expect(d.lignes.map(l => l.factNum)).toEqual(['D']);
  });
});

describe('Relevé de déduction : fichiers', () => {
  const header = { raisonSociale: 'STE <A&B>', identifiantFiscal: '18742558', annee: 2026, periode: 7, regime: 1 as const };
  const lignes = construireReleve([row({ factNum: 'X&1', libFrss: 'Dupont & Fils', iceFrs: '002245147000017' }), row({ factNum: 'Y', taux: 0.14, mTtc: 1140 })], '2026-07', 1).lignes;
  it('XML DeclarationReleveDeduction échappé et ordonné', () => {
    const xml = releveXml(header, lignes);
    expect(xml).toContain('<identifiantFiscal>18742558</identifiantFiscal><annee>2026</annee><periode>7</periode><regime>1</regime>');
    expect(xml).toContain('<num>X&amp;1</num>');
    expect(xml).toContain('<nom>Dupont &amp; Fils</nom><ice>002245147000017</ice>');
    expect(xml).toContain('<tx>0.14</tx>');
    expect(xml.match(/<rd>/g)).toHaveLength(2);
  });
  it('Excel au modèle DGI relu à l’identique par l’import', () => {
    const buffer = releveXlsx(header, lignes);
    const ws = XLSX.read(buffer, { type: 'buffer' }).Sheets.EDI;
    expect(ws.C2.v).toBe('STE <A&B>');
    expect(ws.L1.v).toBe('Modèle n° ADC082F-15I');
    expect(ws.F5.v).toBe('Relevé de déduction');
    const back = readSheetRows(buffer, h => Boolean(aliasFor(h, FIELDS)));
    expect(back.rows).toHaveLength(2);
    expect(back.rows[0]).toEqual(expect.objectContaining({ FACT_NUM: 'X&1', ICE_FRS: '002245147000017', M_TTC: 1200, TAUX: 0.2 }));
    expect(toIsoDate(back.rows[0].DATE_PAIE)).toBe('2026-07-10');
  });
  it('dates Excel sans décalage de fuseau', () => {
    expect(excelDate('2026-06-19')).toBe(46192);
    expect(toIsoDate(46192)).toBe('2026-06-19');
    expect(toIsoDate('19/06/2026')).toBe('2026-06-19');
    expect(toIsoDate('2026-6-9')).toBe('2026-06-09');
  });
});

describe('Import de tableaux et d’archives', () => {
  it('en-têtes cherchés sous un bloc d’identification, ligne Total ignorée', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Société'], ['Période', '07/2026'], [], ['N° facture', 'Fournisseur', 'ICE', 'Montant TTC', 'Taux TVA', 'Date paiement'], ['A1', 'Alpha', '001', 120, '20%', '10/07/2026'], ['Total', '', '', 120]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Achats');
    const r = readSheetRows(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), h => Boolean(aliasFor(h, FIELDS)));
    expect(r.headers).toEqual(['N° facture', 'Fournisseur', 'ICE', 'Montant TTC', 'Taux TVA', 'Date paiement']);
    expect(r.rows).toEqual([{ 'N° facture': 'A1', Fournisseur: 'Alpha', ICE: '001', 'Montant TTC': 120, 'Taux TVA': '20%', 'Date paiement': '10/07/2026' }]);
    expect(['N° facture', 'Fournisseur', 'ICE', 'Montant TTC', 'Taux TVA', 'Date paiement'].map(h => aliasFor(h, FIELDS))).toEqual(['factNum', 'libFrss', 'iceFrs', 'mTtc', 'taux', 'datePaie']);
    expect(aliasFor('M_HT', FIELDS)).toBe('');
  });
  it('ZIP : dossiers conservés, ZIP inclus déplié, fichiers système et formats inconnus ignorés', () => {
    const zip = zipSync({ 'a/f.pdf': strToU8('%PDF'), 'a/b.zip': zipSync({ 'c.csv': strToU8('x') }), 'a/n.docx': strToU8('d'), '__MACOSX/a/._f.pdf': strToU8('m'), 'a/vide.json': new Uint8Array() });
    const r = extractZip(Buffer.from(zip));
    expect(r.entries.map(e => e.name)).toEqual(['a/b/c.csv', 'a/f.pdf']);
    expect(r.skipped).toEqual([{ name: 'a/n.docx', reason: 'Format non pris en charge' }, { name: 'a/vide.json', reason: 'Fichier vide' }]);
    expect(() => extractZip(Buffer.from('pas un zip'))).toThrow('Archive ZIP illisible');
  });
});
