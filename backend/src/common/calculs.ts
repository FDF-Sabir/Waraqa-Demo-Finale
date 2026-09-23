/**
 * Calculs déterministes serveur-only.
 *
 * Principe non négociable de tout le projet : l'IA extrait, elle ne
 * calcule JAMAIS. M_HT et TVA sont TOUJOURS dérivés ici à partir de
 * M_TTC et TAUX, jamais acceptés en entrée brute depuis un client ou une
 * extraction IA.
 *
 * Formules confirmées par le fichier réel (Tableau5) :
 *   M_HT = M_TTC / (1 + TAUX)
 *   TVA  = M_HT * TAUX
 */

import { tauxEstLegal } from './types';

export interface ResultatCalculTva {
  mHt: number;
  tva: number;
  mTtc: number;
}

export class TauxInvalideError extends Error {
  constructor(public readonly taux: number) {
    super(
      `Taux de TVA invalide : ${taux}. Les taux configurés dans cette démo sont 0%, 7%, 10%, 14%, 20%.`,
    );
    this.name = 'TauxInvalideError';
  }
}

/** Arrondi au centime à 2 décimales (évite les dérives flottantes cumulées). */
function arrondir2(valeur: number): number {
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

export function validerTaux(taux: number): void {
  if (!tauxEstLegal(taux)) {
    throw new TauxInvalideError(taux);
  }
}

/**
 * Calcule M_HT et TVA à partir de M_TTC et TAUX. Lance `TauxInvalideError`
 * si le taux n'est pas un taux légal marocain — jamais de calcul silencieux
 * sur un taux erroné.
 */
export function calculerHtEtTva(mTtc: number, taux: number): ResultatCalculTva {
  validerTaux(taux);
  if (typeof mTtc !== 'number' || !Number.isFinite(mTtc) || mTtc < 0) {
    throw new Error(`Montant TTC invalide : ${mTtc}`);
  }

  const mHt = arrondir2(mTtc / (1 + taux));
  const tva = arrondir2(arrondir2(mTtc) - mHt);

  return { mHt, tva, mTtc: arrondir2(mTtc) };
}

/**
 * Détection de doublon multi-taux : deux lignes sont considérées comme
 * doublon potentiel si même fournisseur (ICE ou IF), même n° de facture,
 * et même montant TTC — indépendamment du taux appliqué (une même facture
 * ne devrait jamais être saisie deux fois, quel que soit le taux retenu
 * par erreur la seconde fois).
 */
export interface LigneComparable {
  id?: number;
  factNum?: string;
  iceFrs?: string;
  iff?: string;
  mTtc?: number;
  designation?: string;
  dateFac?: string;
}

export function detecterDoublon(
  candidate: LigneComparable,
  existantes: LigneComparable[],
): LigneComparable | null {
  if (!candidate.factNum) return null;
  // Commissions bancaires : référence générique (« AVUE ») et montants récurrents, parfois plusieurs
  // le même jour — ce sont des déductions distinctes, jamais une facture saisie deux fois.
  if (candidate.designation?.trim().toUpperCase() === 'COMMISSION') return null;

  const identifiantFournisseur = candidate.iceFrs || candidate.iff;
  if (!identifiantFournisseur) return null;

  const trouve = existantes.find((ligne) => {
    if (ligne.id !== undefined && candidate.id !== undefined && ligne.id === candidate.id) {
      return false; // ne jamais se comparer à soi-même (cas mise à jour)
    }
    const memeFactNum =
      ligne.factNum?.trim().toUpperCase() === candidate.factNum?.trim().toUpperCase();
    const memeFournisseur =
      (ligne.iceFrs && ligne.iceFrs === candidate.iceFrs) ||
      (ligne.iff && ligne.iff === candidate.iff);
    const memeMontant =
      ligne.mTtc !== undefined &&
      candidate.mTtc !== undefined &&
      Math.abs(ligne.mTtc - candidate.mTtc) < 0.01;
    // Deux dates de facture connues et différentes : deux pièces distinctes.
    const memeDate = !ligne.dateFac || !candidate.dateFac || ligne.dateFac === candidate.dateFac;

    return memeFactNum && memeFournisseur && memeMontant && memeDate;
  });

  return trouve ?? null;
}
