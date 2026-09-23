/**
 * Préparation du contenu avant l'appel IA — signaux déterministes,
 * gratuits, fiables à 100%, AVANT tout recours à un modèle (voir
 * `inputs-et-regles-controle.md`, section "Classification — signaux
 * utilisés").
 *
 * Depuis la décision de détection universelle
 * (`decisions-finales-avant-cdc.md` §3), ce tri ne détermine plus "IA ou
 * pas IA" — l'IA traite tout — mais seulement COMMENT le contenu est
 * présenté au modèle :
 *   - image brute (vision) pour JPG/PNG/PDF scanné (image 1)
 *   - texte/CSV extrait pour XLSX/CSV/PDF natif structuré (texte 2/3)
 * Un seul appel IA en sortie, quelle que soit la branche.
 */

import * as XLSX from 'xlsx';
// pdf-parse n'exporte pas de types ESM propres pour cette version — require direct.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export type TypeContenuPrepare = 'image' | 'texte';

export interface ContenuPrepare {
  type: TypeContenuPrepare;
  /** Pour type='image' : base64 brut, prêt pour l'API vision. */
  imageBase64?: string;
  /** Type MIME de l'image (image/jpeg, image/png). */
  mimeType?: string;
  /** Pour type='texte' : texte/CSV extrait, prêt à injecter dans le prompt. */
  texte?: string;
}

const EXTENSIONS_IMAGE = new Set(['jpg', 'jpeg', 'png']);
const EXTENSIONS_TABULAIRE = new Set(['xlsx', 'xls', 'csv']);

function extensionDe(nomFichier: string): string {
  const morceaux = nomFichier.toLowerCase().split('.');
  return morceaux.length > 1 ? morceaux[morceaux.length - 1] : '';
}

function mimeTypeImage(extension: string): string {
  if (extension === 'png') return 'image/png';
  return 'image/jpeg';
}

/**
 * Signal 1 (extension) + signal 2 (texte extractible d'un PDF) combinés.
 * Ne lève jamais d'exception sur un PDF illisible : bascule en image par
 * défaut (l'IA vision peut toujours tenter sa chance sur un PDF scanné).
 */
export async function preparerContenu(
  fichier: Buffer,
  nomFichier: string,
): Promise<ContenuPrepare> {
  if (fichier.length > 20 * 1024 * 1024) throw new Error("Fichier supérieur à 20 Mo.");
  const extension = extensionDe(nomFichier);

  // Signal 1 : XLSX/CSV → toujours texte, jamais d'IA vision nécessaire.
  if (EXTENSIONS_TABULAIRE.has(extension)) {
    return { type: 'texte', texte: extraireTexteTabulaire(fichier, extension) };
  }

  // Signal 1 : JPG/PNG → toujours image brute.
  if (EXTENSIONS_IMAGE.has(extension)) {
    return {
      type: 'image',
      imageBase64: fichier.toString('base64'),
      mimeType: mimeTypeImage(extension),
    };
  }

  // Signal 2 : PDF — texte extractible (natif) ou non (scanné) ?
  if (extension === 'pdf') {
    const texteExtrait = await extraireTextePdfSiPossible(fichier);
    if (texteExtrait && texteExtrait.trim().length > 20) {
      // Seuil bas : un PDF scanné avec OCR embarqué minimal ne doit pas
      // être pris pour un PDF natif structuré sur quelques caractères de bruit.
      return { type: 'texte', texte: texteExtrait };
    }
    // Pas de texte extractible → PDF scanné → traité comme image en
    // convertissant la première page (fallback : on envoie le PDF tel
    // quel en base64, Claude Sonnet 5 accepte les PDF directement dans
    // le contenu vision, pas besoin de rasterisation manuelle).
    return {
      type: 'image',
      imageBase64: fichier.toString('base64'),
      mimeType: 'application/pdf',
    };
  }

  // Format inconnu : tentative texte brut en dernier recours.
  return { type: 'texte', texte: fichier.toString('utf-8') };
}

function extraireTexteTabulaire(fichier: Buffer, extension: string): string {
  if (extension === 'csv') {
    return fichier.toString('utf-8');
  }
  const classeur = XLSX.read(fichier, { type: 'buffer' });
  const feuilles = classeur.SheetNames.map((nom) => {
    const feuille = classeur.Sheets[nom];
    const csv = XLSX.utils.sheet_to_csv(feuille);
    return `--- Feuille: ${nom} ---\n${csv}`;
  });
  return feuilles.join('\n\n');
}

async function extraireTextePdfSiPossible(fichier: Buffer): Promise<string | null> {
  try {
    const resultat = await pdfParse(fichier);
    return resultat.text ?? null;
  } catch {
    return null; // PDF corrompu/scanné sans couche texte — bascule image.
  }
}
