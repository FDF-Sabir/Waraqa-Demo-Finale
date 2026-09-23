import { Injectable } from '@nestjs/common';
import { SousType } from '../common/types';
import { ResultatExtraction } from './resultat-extraction.interface';
import { ContenuPrepare } from './preparation-contenu';

/**
 * Implémentation mock — utilisable tant qu'aucune clé API Anthropic
 * réelle n'est fournie (le comptable active la sienne après validation
 * de la démo, voir decisions-finales-avant-cdc.md §1), et utile en
 * permanence pour les tests automatisés sans consommer de budget IA.
 *
 * Ne fait AUCUN appel réseau. Produit une extraction plausible basée sur
 * le nom de fichier (heuristique simple, pas une vraie classification)
 * pour permettre de tester le pipeline complet bout-en-bout.
 */
@Injectable()
export class ExtractionIaMockService {
  async extraire(_contenu: ContenuPrepare, nomFichier: string): Promise<ResultatExtraction> {
    const nom = nomFichier.toLowerCase();

    if (nom.includes('douane') || nom.includes('dum')) {
      return {
        sousType: SousType.DECLARATION_DOUANIERE,
        confiance: 0.9,
        lignes: [
          {
            factNum: 'DUM-MOCK-0001',
            designation: 'RECEVEUR DOUANE',
            mTtc: 650000,
            taux: 0.2,
            iff: '1111',
            iceFrs: '1111',
            libFrss: 'DROIT DOUANE',
            idPaie: 7,
            dateFac: new Date().toISOString().slice(0, 10),
          },
        ],
      };
    }

    if (nom.includes('releve') || nom.includes('relevé') || nom.includes('bancaire')) {
      return {
        sousType: SousType.RELEVE_BANCAIRE,
        confiance: 0.85,
        lignes: [
          {
            designation: 'COMMISSION',
            mTtc: 45.5,
            taux: 0.2,
            idPaie: 3,
            datePaie: new Date().toISOString().slice(0, 10),
          },
        ],
      };
    }

    if (nom.includes('frais') || nom.includes('ticket')) {
      return {
        sousType: SousType.NOTE_DE_FRAIS,
        confiance: 0.75,
        lignes: [{ mTtc: 65, taux: 0.2, designation: 'GASOIL' }],
      };
    }

    // Cas par défaut : facture fournisseur plausible.
    return {
      sousType: SousType.FACTURE_FOURNISSEUR,
      confiance: 0.88,
      lignes: [
        {
          factNum: 'F-MOCK-0001',
          designation: 'ACHAT',
          mTtc: 1200,
          taux: 0.2,
          iff: '001234567',
          iceFrs: '001234567000012',
          libFrss: 'FOURNISSEUR MOCK SARL',
          idPaie: 4,
          dateFac: new Date().toISOString().slice(0, 10),
        },
      ],
    };
  }
}
