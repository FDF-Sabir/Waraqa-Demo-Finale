import * as XLSX from 'xlsx';
import { analyzeWorkbook, classifyDocument, createsLines, parseRole } from './document-role';

const T5 = ['OR', 'FACT_NUM', 'DESIGNATION', 'M_HT', 'TVA', 'M_TTC', 'IF', 'LIB_FRSS', 'ICE_FRS', 'TAUX', 'ID_PAIE', 'DATE_PAIE', 'DATE_FAC'];
function workbook(rows: any[][], header: { raison?: string; iff?: string } = {}, sheet = 'EDI') {
  const aoa: any[][] = [
    ['Modèle n° ADC082F-15I', '', '', '', '', '', '', '', '', '', '', '', 'RAISON SOCIAL'],
    ['', header.raison ?? '', '', 'ID_FISCAL'],
    ['', header.iff ?? '', '', 'ANNEE'],
    ['', 2026, '', 'PERIODE(Mois)'],
    ['', 7, '', 'Relevé de déduction'],
    ['', 1, '', '(Article 112 du Code Général des Impôts)'],
    [],
    T5,
    ...rows,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const line = (i: number, paie: string, fac = paie) => [i, 'F-' + i, 'ACHAT', 100, 20, 120, '123', 'Fournisseur', '001234567000012', 0.2, 4, paie, fac];

describe('Rôle documentaire', () => {
  it('pièce comptable par défaut, sans signal', () => {
    const r = classifyDocument('Factures/scan-001.pdf', '.pdf');
    expect(r.role).toBe('piece_comptable');
    expect(createsLines(r.role)).toBe(true);
  });
  it('le chemin d’un lot classe vérité terrain, référentiel, historique, modèle et annexes sans créer de ligne', () => {
    expect(classifyDocument('Jeu/99_Verite_terrain/attendu.csv', '.csv').role).toBe('evaluation');
    expect(classifyDocument('Jeu/14_Referentiels/fournisseurs.xlsx', '.xlsx').role).toBe('referentiel');
    expect(classifyDocument('Jeu/07_Classeurs_EDI_TVA_historiques/TVA_2025.xlsx', '.xlsx').role).toBe('historique');
    expect(classifyDocument('Jeu/10_Documents_non_comptabilisables_BL_BC_Devis_Proforma/bl-12.pdf', '.pdf').role).toBe('justificatif_annexe');
    expect(classifyDocument('Jeu/03_Modeles/releve-vierge.xlsx', '.xlsx').role).toBe('modele');
    expect(classifyDocument('Jeu/05_Banque/releve-juillet.pdf', '.pdf').role).toBe('paiement');
    for (const role of ['evaluation', 'referentiel', 'historique', 'justificatif_annexe', 'modele', 'a_classifier']) expect(createsLines(role)).toBe(false);
  });
  it('le nom de fichier seul ne classe que les cas évidents', () => {
    expect(classifyDocument('devis-2026-07.pdf', '.pdf').role).toBe('justificatif_annexe');
    expect(classifyDocument('Facture blocs devissables.pdf', '.pdf').role).toBe('piece_comptable');
  });
  it('un classeur Tableau5 vide est un modèle ; plusieurs périodes font un historique', () => {
    const vide = classifyDocument('releve.xlsx', '.xlsx', workbook([], { raison: 'Société X' }));
    expect(vide.role).toBe('modele'); expect(vide.confiance).toBe('haute'); expect(vide.lignesTableau).toBe(0);
    const rows = Array.from({ length: 30 }, (_, i) => line(i + 1, `2025-${String((i % 4) + 1).padStart(2, '0')}-10`));
    const hist = classifyDocument('TVA 2025.xlsx', '.xlsx', workbook(rows));
    expect(hist.role).toBe('historique'); expect(hist.periodes).toEqual(['2025-01', '2025-02', '2025-03', '2025-04']);
  });
  it('un classeur du mois avec la bonne société reste une pièce ; une autre société reste à classer', () => {
    const rows = Array.from({ length: 12 }, (_, i) => line(i + 1, '2026-07-10', '2026-07-0' + ((i % 9) + 1)));
    const ok = classifyDocument('TVA 07 2026.xlsx', '.xlsx', workbook(rows, { raison: 'Finder Electronic Morocco', iff: '12345678' }), { company: { name: 'Finder Electronic Morocco' } });
    expect(ok.role).toBe('piece_comptable'); expect(ok.identiteContradictoire).toBeFalsy();
    expect(ok.identite).toEqual(expect.objectContaining({ raisonSociale: 'Finder Electronic Morocco', identifiantFiscal: '12345678', annee: 2026, periode: 7 }));
    const autre = classifyDocument('TVA 07 2026.xlsx', '.xlsx', workbook(rows, { raison: 'STE TRANS RIYAD SELLAM', iff: '999' }), { company: { name: 'Finder Electronic Morocco' } });
    expect(autre.role).toBe('a_classifier'); expect(autre.identiteContradictoire).toBe(true);
    expect(autre.indices.join(' ')).toContain('STE TRANS RIYAD SELLAM');
  });
  it('analyse : feuille, ligne d’en-tête et périodes ; classeur sans Tableau5 toléré', () => {
    const a = analyzeWorkbook(workbook([line(1, '2026-07-10')]), '.xlsx')!;
    expect(a.feuille).toBe('EDI'); expect(a.headerIndex).toBe(7); expect(a.lignes).toBe(1);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'Autre');
    expect(analyzeWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), '.xlsx')).toEqual(expect.objectContaining({ headerIndex: -1, feuilles: ['Autre'] }));
    expect(analyzeWorkbook(Buffer.from('%PDF'), '.pdf')).toBeNull();
  });
  it('valide les rôles fournis par l’utilisateur', () => {
    expect(parseRole(undefined)).toBeUndefined();
    expect(parseRole('modele')).toBe('modele');
    expect(() => parseRole('secret')).toThrow('Rôle documentaire inconnu');
  });
});
