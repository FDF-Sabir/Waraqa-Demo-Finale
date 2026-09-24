import { markdownPdf, parseMarkdown } from './report-pdf';

describe('Rapport rédactionnel (Markdown → PDF)', () => {
  it('analyse les blocs Markdown usuels', () => {
    const blocks = parseMarkdown('# Titre\n\nParagraphe **gras** et `code`.\n\n- a\n- b\n\n1. un\n2. deux\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> citation\n\n---\n\n```\ncode\n```\n');
    expect(blocks.map(b => b.type)).toEqual(['h', 'p', 'ul', 'ol', 'table', 'quote', 'hr', 'code']);
    expect((blocks[4] as any).rows).toEqual([['A', 'B'], ['1', '2']]);
    expect((blocks[2] as any).items).toEqual(['a', 'b']);
  });
  it('produit un PDF paginé avec métadonnées et pied « Sources et limites »', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `## Section ${i + 1}\n\nTexte de la section ${i + 1} avec un **point clé** et une ligne #${i + 1}.\n\n- élément un\n- élément deux\n`).join('\n');
    const pdf = await markdownPdf({ title: 'Analyse du dossier', markdown: long + '\n| Poste | Montant |\n|---|---|\n| TVA | 1 200,00 |\n', createdAt: '2026-09-24T10:00:00.000Z', author: 'Agent', month: '2026-08', company: { name: 'Société Test', iff: '12345678' }, statut: 'brouillon', sources: ['synthese_mois', 'releve_deduction'] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBeGreaterThan(3);
    expect(pdf.length).toBeGreaterThan(20000);
  });
});
