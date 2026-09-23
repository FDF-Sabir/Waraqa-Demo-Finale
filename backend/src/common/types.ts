/**
 * Types et référentiels métier — Waraqa V2.
 *
 * Source de vérité : documents d'architecture du projet
 * (`decouvertes-fichier-reel-tva.md`, `inputs-et-regles-controle.md`).
 * Ne pas modifier sans relire ces documents.
 */

/**
 * Codes de mode de paiement DGI (élément XML `mp/id`, type xs:byte).
 * Légende officielle confirmée par la notice EDI relevé de déduction
 * (art. 112 CGI) et croisée avec le fichier réel TVA_07_2026.xlsm.
 */
export enum IdPaie {
  ESPECES = 1,
  CHEQUE = 2,
  PRELEVEMENT = 3,
  VIREMENT = 4,
  EFFETS = 5,
  COMPENSATION = 6,
  AUTRES = 7,
}

export const ID_PAIE_VALIDES = [1, 2, 3, 4, 5, 6, 7] as const;

export function idPaieEstValide(valeur: number): boolean {
  return ID_PAIE_VALIDES.includes(valeur as (typeof ID_PAIE_VALIDES)[number]);
}

/**
 * Les 6 sous-types de documents sources, liste figée
 * (`inputs-et-regles-controle.md`).
 */
export enum SousType {
  FACTURE_FOURNISSEUR = 'facture_fournisseur',
  DECLARATION_DOUANIERE = 'declaration_douaniere',
  QUITTANCE_DOUANE = 'quittance_douane',
  NOTE_DE_FRAIS = 'note_de_frais',
  RELEVE_BANCAIRE = 'releve_bancaire',
  AVIS_DEBIT_VIREMENT = 'avis_debit_virement',
}

export const SOUS_TYPES_VIGILANCE_RENFORCEE: SousType[] = [
  SousType.DECLARATION_DOUANIERE,
  SousType.QUITTANCE_DOUANE,
];

/** Convention DGI : paiement douane, IF=ICE="1111" n'est pas une anomalie. */
export const IF_ICE_CONVENTION_DOUANE = '1111';

export const SEUIL_CONFIANCE_OCR_STANDARD = 0.85;

/**
 * Taux de TVA légaux marocains (les 6 taux existent ; seuls 0.10 et 0.20
 * étaient utilisés sur le mois observé, les autres restent valides).
 */
export const TAUX_LEGAUX = [0.0, 0.07, 0.1, 0.14, 0.2, 0.0] as const;
export const TAUX_LEGAUX_UNIQUES = [0.0, 0.07, 0.1, 0.14, 0.2];

export function tauxEstLegal(taux: number): boolean {
  return TAUX_LEGAUX_UNIQUES.some((t) => Math.abs(t - taux) < 1e-9);
}

/**
 * Les 13 champs de la table nommée `Tableau5` (feuille EDI), structure
 * confirmée par inspection du fichier réel TVA_07_2026.xlsm.
 * Colonnes A-M : OR, FACT_NUM, DESIGNATION, M_HT, TVA, M_TTC, IF, LIB_FRSS,
 * ICE_FRS, TAUX, ID_PAIE, DATE_PAIE, DATE_FAC.
 * M_HT et TVA sont calculés serveur-only, jamais fournis en entrée brute.
 */
export interface ChampsBrutsTableau5 {
  or?: string;
  factNum?: string;
  designation?: string;
  mTtc?: number;
  iff?: string; // "IF" — mot réservé JS, on garde `iff`
  libFrss?: string;
  iceFrs?: string;
  taux?: number;
  idPaie?: number;
  datePaie?: string; // ISO yyyy-mm-dd
  dateFac?: string; // ISO yyyy-mm-dd
}

export type NomChamp = keyof ChampsBrutsTableau5;

/**
 * Règles de validation par sous-type — remplace l'ancienne liste unique
 * `CHAMPS_ENTETE_OBLIGATOIRES`. Chaque sous-type définit ses propres champs
 * obligatoires (`inputs-et-regles-controle.md`, tableau de synthèse).
 */
export interface RegleSousType {
  sousType: SousType;
  /** Champs dont l'absence doit être signalée (statut `incomplete`). */
  champsObligatoires: NomChamp[];
  /** ICE/IF non exigés si LIB_FRSS correspond à la convention douane. */
  exemptionIceDouane: boolean;
  /** DUM et quittance douane : toujours signalées, indépendamment du montant. */
  vigilanceRenforcee: boolean;
  /** Désignations typiquement associées (indicatif, pas une contrainte dure). */
  designationsTypiques: string[];
}

export const REGLES_SOUS_TYPE: Record<SousType, RegleSousType> = {
  [SousType.FACTURE_FOURNISSEUR]: {
    sousType: SousType.FACTURE_FOURNISSEUR,
    champsObligatoires: ['factNum', 'iceFrs', 'dateFac', 'mTtc', 'libFrss'],
    exemptionIceDouane: false,
    vigilanceRenforcee: false,
    designationsTypiques: ['ACHAT', 'SERVICE', 'GASOIL'],
  },
  [SousType.DECLARATION_DOUANIERE]: {
    sousType: SousType.DECLARATION_DOUANIERE,
    // Pas d'ICE exigé (convention IF=ICE="1111") ; n° DUM = factNum.
    champsObligatoires: ['factNum', 'dateFac', 'mTtc'],
    exemptionIceDouane: true,
    vigilanceRenforcee: true,
    designationsTypiques: ['RECEVEUR DOUANE'],
  },
  [SousType.QUITTANCE_DOUANE]: {
    sousType: SousType.QUITTANCE_DOUANE,
    // factNum/dateFac "possibles" mais pas garantis selon le document —
    // seul mTtc est structurellement indispensable.
    champsObligatoires: ['mTtc'],
    exemptionIceDouane: true,
    vigilanceRenforcee: true,
    designationsTypiques: ['RECEVEUR DOUANE'],
  },
  [SousType.NOTE_DE_FRAIS]: {
    sousType: SousType.NOTE_DE_FRAIS,
    // Contrôle allégé par nature : souvent sans FACT_NUM ni ICE (ticket
    // thermique). Seule la date, si lisible, et le montant sont attendus.
    champsObligatoires: ['mTtc'],
    exemptionIceDouane: false,
    vigilanceRenforcee: false,
    designationsTypiques: [],
  },
  [SousType.RELEVE_BANCAIRE]: {
    sousType: SousType.RELEVE_BANCAIRE,
    // N'est pas une ligne Tableau5 en soi (source de rapprochement) ;
    // règles allégées si une ligne COMMISSION en est directement issue.
    champsObligatoires: ['mTtc', 'datePaie'],
    exemptionIceDouane: true,
    vigilanceRenforcee: false,
    designationsTypiques: ['COMMISSION'],
  },
  [SousType.AVIS_DEBIT_VIREMENT]: {
    sousType: SousType.AVIS_DEBIT_VIREMENT,
    // Champs dépendent du rapprochement facture ; a minima montant + date.
    champsObligatoires: ['mTtc', 'datePaie'],
    exemptionIceDouane: true,
    vigilanceRenforcee: false,
    designationsTypiques: [],
  },
};

/**
 * Détermine si LIB_FRSS correspond à la convention douane (exemption
 * IF/ICE, découverte #3 de `decouvertes-fichier-reel-tva.md`).
 */
export function estFournisseurDouane(libFrss?: string): boolean {
  if (!libFrss) return false;
  return libFrss.toUpperCase().includes('DOUANE');
}

/**
 * Calcule les champs manquants pour un sous-type donné, en tenant compte
 * de l'exemption douane (IF=ICE="1111" valide, pas un champ manquant).
 */
export function champsManquants(
  sousType: SousType,
  champs: ChampsBrutsTableau5,
): NomChamp[] {
  const regle = REGLES_SOUS_TYPE[sousType];
  const estDouane =
    regle.exemptionIceDouane &&
    (estFournisseurDouane(champs.libFrss) ||
      (champs.iff === IF_ICE_CONVENTION_DOUANE &&
        champs.iceFrs === IF_ICE_CONVENTION_DOUANE));

  return regle.champsObligatoires.filter((nomChamp) => {
    if (estDouane && (nomChamp === 'iceFrs' || nomChamp === 'iff')) {
      return false; // exempté par convention, jamais un manque
    }
    const valeur = champs[nomChamp];
    return valeur === undefined || valeur === null || valeur === '';
  });
}

/** Statuts possibles d'une ligne Tableau5. */
export enum StatutFacture {
  VALIDEE = 'validee',
  INCOMPLETE = 'incomplete',
  /** Ligne bancaire orpheline — voir `inputs-et-regles-controle.md`. */
  EN_ATTENTE_CONFIRMATION_PAIEMENT = 'en_attente_confirmation_paiement',
}

/**
 * Détecte le pattern de ligne bancaire orpheline (découverte clé du
 * fichier réel) : FACT_NUM/DESIGNATION/DATE_FAC absents mais DATE_PAIE et
 * ID_PAIE=4 (virement) présents. Détection DÉCOUPLÉE de
 * `champsNonDetectes.length` (bug corrigé — voir etat-avancement-backend.md
 * point 2) car pour `avis_paiement_bancaire`, `REGLES_SOUS_TYPE` ne rend pas
 * ces champs obligatoires, donc `champsManquants` peut être vide alors que
 * le pattern orphelin est bien présent.
 */
export function estLigneBancaireOrpheline(champs: ChampsBrutsTableau5): boolean {
  const factNumAbsent = !champs.factNum;
  const designationAbsente = !champs.designation;
  const dateFacAbsente = !champs.dateFac;
  const datePaiePresente = !!champs.datePaie;
  const estVirement = champs.idPaie === IdPaie.VIREMENT;

  return (
    factNumAbsent &&
    designationAbsente &&
    dateFacAbsente &&
    datePaiePresente &&
    estVirement
  );
}
