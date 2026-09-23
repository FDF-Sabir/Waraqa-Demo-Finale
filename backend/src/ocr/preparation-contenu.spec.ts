import { preparerContenu } from './preparation-contenu';

describe('preparerContenu — signaux déterministes (sans IA)', () => {
  it('signal 1 : JPG → toujours image brute', async () => {
    const resultat = await preparerContenu(Buffer.from('fake-jpg-bytes'), 'facture.jpg');
    expect(resultat.type).toBe('image');
    expect(resultat.mimeType).toBe('image/jpeg');
    expect(resultat.imageBase64).toBeDefined();
  });

  it('signal 1 : PNG → toujours image brute', async () => {
    const resultat = await preparerContenu(Buffer.from('fake-png-bytes'), 'ticket.PNG');
    expect(resultat.type).toBe('image');
    expect(resultat.mimeType).toBe('image/png');
  });

  it('signal 1 : CSV → toujours texte, jamais image', async () => {
    const csv = 'date,montant,libelle\n2026-07-01,1200,ACHAT FOURNISSEUR';
    const resultat = await preparerContenu(Buffer.from(csv, 'utf-8'), 'releve.csv');
    expect(resultat.type).toBe('texte');
    expect(resultat.texte).toContain('ACHAT FOURNISSEUR');
  });

  it('signal 1 : XLSX → texte (CSV converti depuis la feuille)', async () => {
    const XLSX = require('xlsx');
    const feuille = XLSX.utils.aoa_to_sheet([
      ['FACT_NUM', 'M_TTC'],
      ['F-001', 1200],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'EDI');
    const buffer = XLSX.write(classeur, { type: 'buffer', bookType: 'xlsx' });

    const resultat = await preparerContenu(buffer, 'TVA_07_2026.xlsx');
    expect(resultat.type).toBe('texte');
    expect(resultat.texte).toContain('F-001');
  });

  it('signal 2 : PDF sans couche texte (scanné) → bascule en image', async () => {
    // Buffer PDF invalide/minimal — pdf-parse échouera, donc bascule image.
    const resultat = await preparerContenu(Buffer.from('%PDF-1.4 not a real pdf'), 'scan.pdf');
    expect(resultat.type).toBe('image');
    expect(resultat.mimeType).toBe('application/pdf');
  });

  it('format inconnu → tentative texte brut en dernier recours', async () => {
    const resultat = await preparerContenu(Buffer.from('contenu texte brut'), 'fichier.txt');
    expect(resultat.type).toBe('texte');
    expect(resultat.texte).toContain('contenu texte brut');
  });
});
