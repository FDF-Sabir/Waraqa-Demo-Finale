import * as XLSX from 'xlsx';
import { calculer, classeurLibre, markdownHtml } from './agent-extras';

describe('Compléments déterministes de l’agent', () => {
  it('calcule exactement, sans eval, avec fonctions et arrondi', () => {
    expect(calculer('round(1200/1.2, 2)').resultat).toBe(1000);
    expect(calculer('(4500+320)*0.2').arrondi2).toBe(964);
    expect(calculer('sum(1,2,3)-abs(-4)+max(1,9)%4').resultat).toBe(3);
    expect(calculer('12,5*2').resultat).toBe(25);
    expect(() => calculer('1/0')).toThrow('division');
    expect(() => calculer('process.exit()')).toThrow('Expression');
    expect(() => calculer('2+')).toThrow('invalide');
  });
  it('produit un classeur libre borné avec une feuille « À propos »', () => {
    const buf = classeurLibre({ titre: 'Plan', feuilles: [{ nom: 'Échéancier', lignes: [['Mois', 'Action'], ['2026-10', 'Relevé']] }, { nom: 'Échéancier', lignes: [['x']] }], auteur: 'Agent', societe: 'S', mois: '2026-09' });
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Échéancier', 'Échéancier 2', 'À propos']);
    expect(XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Échéancier'], { header: 1 })[1]).toEqual(['2026-10', 'Relevé']);
    expect(() => classeurLibre({ feuilles: [], auteur: 'A' })).toThrow('feuille');
    expect(() => classeurLibre({ feuilles: Array.from({ length: 21 }, (_, i) => ({ nom: 'F' + i, lignes: [[1]] })), auteur: 'A' })).toThrow('20 feuilles');
  });
  it('rend le rapport en HTML sûr (échappement) avec ses métadonnées', () => {
    const html = markdownHtml({ title: 'T <b>', markdown: '## Constat\n\n**gras** et <script>x</script>\n\n| A | B |\n|---|---|\n| 1 | 2 |', meta: 'meta', sources: ['synthese_mois'] });
    expect(html).toContain('<h3>Constat</h3>'); expect(html).toContain('<strong>gras</strong>'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('<th>A</th>'); expect(html).toContain('synthese_mois'); expect(html).toContain('T &lt;b&gt;');
  });
});
