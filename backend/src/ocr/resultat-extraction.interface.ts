import { ChampsBrutsTableau5, SousType } from '../common/types';

/**
 * Sortie normalisée du pipeline d'extraction IA — un seul appel IA
 * produit ceci, quel que soit le format de fichier d'origine (image, PDF,
 * XLSX, CSV).
 *
 * `lignes` supporte le cas multi-opérations (relevé bancaire = plusieurs
 * mouvements dans un seul fichier) ; pour un document à opération unique
 * (facture, DUM, quittance, note de frais, avis de débit/virement),
 * `lignes` contient exactement un élément — c'est le cas normal.
 *
 * Principe non négociable qui doit survivre à toute évolution : l'IA
 * extrait, elle ne calcule JAMAIS — mHt et tva ne font PAS partie de
 * `ChampsBrutsTableau5` et ne doivent jamais y être ajoutés.
 */
export interface ResultatExtraction {
  sousType: SousType;
  confiance: number;
  lignes: ChampsBrutsTableau5[];
}
