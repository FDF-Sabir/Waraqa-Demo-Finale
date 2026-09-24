import * as XLSX from 'xlsx';
import { cellValue, describeIndex, readRange, workbookIndex } from './workbook-reader';

import { releveXlsx } from './releve';

/** Classeur réaliste au modèle DGI (formules M_HT/TVA avec valeurs en cache, dates, en-têtes ligne 8, ligne Total). */
function big(rows = 3021) {
  const lignes = Array.from({ length: rows }, (_, i) => ({ id: i + 1, ord: i + 1, factNum: 'F' + (i + 1), designation: 'ACHAT', mHt: 100, tva: 20, mTtc: 120, iff: '12345', libFrss: 'Frs ' + (i + 1), iceFrs: '001234567000012', taux: 0.2, idPaie: 4, datePaie: '2026-07-10', dateFac: '2026-07-01', revueHumaine: true }));
  return releveXlsx({ raisonSociale: 'STE TRANS RIYAD SELLAM', identifiantFiscal: '4567890', annee: 2026, periode: 7, regime: 1 }, lignes);
}

describe('Lecteur de classeur', () => {
  const buffer = big();
  it('index : feuilles, dimensions, en-têtes, formules, fusions, noms, identité et conseil de lecture par plages', () => {
    const idx = workbookIndex(buffer, '.xlsx');
    expect(idx.feuilles.map(f => f.nom)).toEqual(['EDI']);
    const edi = idx.feuilles[0];
    expect(edi).toEqual(expect.objectContaining({ plage: 'A1:M3030', lignes: 3030, colonnes: 13, ligneEntete: 8, tableau5: true }));
    expect(edi.fusions).toBeGreaterThan(0);
    expect(edi.formules).toBe(3021 * 2 + 3);
    expect(edi.entetes.slice(0, 3)).toEqual(['OR', 'FACT_NUM', 'DESIGNATION']);
    expect(idx.mappageXml).toBe(true);
    expect(idx.identite).toEqual(expect.objectContaining({ raisonSociale: 'STE TRANS RIYAD SELLAM', identifiantFiscal: '4567890', annee: 2026, periode: 7 }));
    expect(idx.periodes).toEqual(['2026-07']);
    expect(idx.conseil).toContain('lire_plage');
    const text = describeIndex(idx);
    expect(text).toContain('Tableau5 reconnu'); expect(text).toContain('STE TRANS RIYAD SELLAM'); expect(text.length).toBeLessThan(2000);
  });
  it('plage : blocs bornés à 200 lignes, couverture explicite, références de cellules, formules et dates lisibles', () => {
    const r = readRange(buffer, '.xlsx', { feuille: 'EDI', debut: 8, nombre: 500 });
    expect(r).toEqual(expect.objectContaining({ feuille: 'EDI', debut: 8, fin: 207, total: 3030, couvert: 207, reste: 2823 }));
    expect(r.notes).toContain('La ligne 8 est la ligne d\'en-têtes.');
    const first = r.lignes.find(l => l.ligne === 9)!.cellules;
    // IF numérique dans le modèle DGI (cellule nombre) ; ICE texte : zéros initiaux conservés.
    expect(first.B).toBe('F1'); expect(first.G).toBe(12345); expect(first.I).toBe('001234567000012');
    expect(first.D).toEqual({ formule: '=ROUND(Tableau5[[#This Row],[M_TTC]]/(1+Tableau5[[#This Row],[TAUX]]),2)', valeur: 100 });
    expect(first.L).toBe('2026-07-10'); expect(first.M).toBe('2026-07-01');
    const last = readRange(buffer, '.xlsx', { feuille: 'EDI', debut: 3000, nombre: 200 });
    expect(last).toEqual(expect.objectContaining({ fin: 3030, reste: 0 })); expect(last.lignes).toHaveLength(31);
    expect(last.lignes[last.lignes.length - 1].cellules.A).toBe('Total');
    const cols = readRange(buffer, '.xlsx', { debut: 9, nombre: 2, colonnes: ['b', 'F'] });
    expect(Object.keys(cols.lignes[0].cellules)).toEqual(['B', 'F']);
    const unknown = readRange(buffer, '.xlsx', { feuille: 'Absente', debut: 1, nombre: 2 });
    expect(unknown.feuille).toBe('EDI'); expect(unknown.notes[0]).toContain('inconnue');
  });
  it('CSV : lisible par les mêmes outils', () => {
    const csv = Buffer.from('FACT_NUM;LIB_FRSS;M_TTC\nA;Frs;120\nB;Frs;240\n');
    const idx = workbookIndex(csv, '.csv');
    expect(idx.feuilles[0]).toEqual(expect.objectContaining({ lignes: 3, ligneEntete: 1 }));
    expect(readRange(csv, '.csv', { debut: 2, nombre: 5 }).lignes.map(l => l.cellules.A)).toEqual(['A', 'B']);
  });
  it('cellules : types conservés', () => {
    expect(cellValue(undefined)).toBeUndefined();
    expect(cellValue({ t: 's', v: '000123' })).toBe('000123');
    expect(cellValue({ t: 'n', v: 45000, z: 'dd/mm/yyyy' })).toBe('2023-03-15');
    expect(cellValue({ t: 'n', v: 12.5 })).toBe(12.5);
    expect(cellValue({ t: 'e', v: 15, w: '#VALUE!' })).toEqual({ erreur: '#VALUE!' });
    expect(cellValue({ t: 'n', f: 'A1*2' } as any)).toEqual({ formule: '=A1*2', valeur: null, note: 'formule sans valeur en cache' });
  });
});
