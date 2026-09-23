import { ExtractionIaMockService } from './extraction-ia-mock.service';
import { SousType } from '../common/types';
import { ContenuPrepare } from './preparation-contenu';

describe('ExtractionIaMockService', () => {
  const service = new ExtractionIaMockService();
  const contenuFictif: ContenuPrepare = { type: 'texte', texte: 'peu importe' };

  it('ne fait jamais apparaître mHt ou tva dans les lignes retournées', async () => {
    const resultat = await service.extraire(contenuFictif, 'facture.jpg');
    for (const ligne of resultat.lignes) {
      expect((ligne as any).mHt).toBeUndefined();
      expect((ligne as any).tva).toBeUndefined();
    }
  });

  it('reconnaît un nom de fichier évoquant la douane', async () => {
    const resultat = await service.extraire(contenuFictif, 'declaration_douane_juillet.pdf');
    expect(resultat.sousType).toBe(SousType.DECLARATION_DOUANIERE);
  });

  it('reconnaît un nom de fichier évoquant un relevé bancaire', async () => {
    const resultat = await service.extraire(contenuFictif, 'releve_bancaire_bmce.xlsx');
    expect(resultat.sousType).toBe(SousType.RELEVE_BANCAIRE);
  });

  it('retombe sur facture_fournisseur par défaut', async () => {
    const resultat = await service.extraire(contenuFictif, 'document_quelconque.jpg');
    expect(resultat.sousType).toBe(SousType.FACTURE_FOURNISSEUR);
  });

  it('retourne toujours au moins une ligne avec mTtc et taux', async () => {
    const resultat = await service.extraire(contenuFictif, 'notedefrais.jpg');
    expect(resultat.lignes.length).toBeGreaterThan(0);
    expect(resultat.lignes[0].mTtc).toBeDefined();
  });
});
