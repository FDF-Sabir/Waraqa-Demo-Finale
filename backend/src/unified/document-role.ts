import * as XLSX from 'xlsx';
import { normalizeHeader, toIsoDate } from './table-import';

/**
 * Rôle documentaire (plan directeur §9.1, invariant 3) : comprendre AVANT de comptabiliser.
 * Un modèle, un historique, un référentiel, un justificatif annexe ou un jeu d'évaluation est
 * conservé comme original et consultable, mais ne crée JAMAIS de ligne comptable par le seul
 * fait d'être déposé. Le rôle est suggéré par des signaux déterministes (chemin, structure,
 * périodes, identité) ; le nom du dossier est un indice, pas une autorité : en cas de doute, le
 * document reste « à classer » et le comptable décide (reclassement réversible, tracé).
 */
export type DocumentRole = 'piece_comptable' | 'paiement' | 'modele' | 'historique' | 'referentiel' | 'justificatif_annexe' | 'evaluation' | 'a_classifier';
export const DOCUMENT_ROLES: DocumentRole[] = ['piece_comptable', 'paiement', 'modele', 'historique', 'referentiel', 'justificatif_annexe', 'evaluation', 'a_classifier'];
export const ROLE_LABELS: Record<DocumentRole, string> = {
  piece_comptable: 'Pièce comptable (crée des lignes du relevé)',
  paiement: 'Paiement ou relevé bancaire (crée des lignes bancaires à rapprocher)',
  modele: 'Modèle ou maquette : structure et présentation seulement, aucune ligne',
  historique: 'Historique d’une autre période : consultation et comparaison, aucune ligne',
  referentiel: 'Référentiel (fournisseurs, plan de comptes, listes) : aucune ligne',
  justificatif_annexe: 'Justificatif annexe (BL, BC, devis, proforma) : conservé, aucune déduction',
  evaluation: 'Jeu d’évaluation ou vérité terrain : jamais dans les données métier',
  a_classifier: 'À classer par le comptable : conservé, aucune ligne tant que le rôle n’est pas choisi',
};
export const LINE_CREATING_ROLES: DocumentRole[] = ['piece_comptable', 'paiement'];
export const createsLines = (role: string | undefined) => LINE_CREATING_ROLES.includes(role as DocumentRole);
export function parseRole(value: unknown): DocumentRole | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DOCUMENT_ROLES.includes(value as DocumentRole)) throw new Error('Rôle documentaire inconnu : ' + DOCUMENT_ROLES.join(', ') + '.');
  return value as DocumentRole;
}

export interface IdentityCandidate { raisonSociale?: string; identifiantFiscal?: string; annee?: number; periode?: number; source: string }
export interface RoleSuggestion {
  role: DocumentRole;
  confiance: 'haute' | 'moyenne' | 'faible';
  indices: string[];
  identite?: IdentityCandidate;
  /** Société du document différente de la société configurée (jamais copiée automatiquement). */
  identiteContradictoire?: boolean;
  periodes?: string[];
  lignesTableau?: number;
  feuilles?: string[];
}

const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Segments de chemin transformés en mots séparés par des espaces (« 10_BL_BC-Devis » → « 10 bl bc devis »). */
const words = (s: string) => ' ' + fold(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

const FOLDER_RULES: [RegExp, DocumentRole, string, RoleSuggestion['confiance']][] = [
  [/ verite terrain | ground truth | resultats? attendus? | attendus? | evaluation /, 'evaluation', 'dossier de vérité terrain / résultats attendus', 'haute'],
  [/ referentiels? | plan comptable | plan de comptes /, 'referentiel', 'dossier « référentiel »', 'haute'],
  [/ modeles? | templates? | maquettes? | vierges? /, 'modele', 'dossier « modèle »', 'moyenne'],
  [/ historiques? | archives? | exercices? precedents? | annees? precedentes? /, 'historique', 'dossier « historique »', 'moyenne'],
  [/ non comptabilisables? | bl | bc | bons? de livraison | bons? de commande | devis | pro ?formas? /, 'justificatif_annexe', 'dossier « non comptabilisable » (BL, BC, devis, proforma)', 'moyenne'],
  [/ banques? | releves? bancaires? | avis de debit | avis de virement /, 'paiement', 'dossier bancaire', 'moyenne'],
];
const FILE_RULES: [RegExp, DocumentRole, string][] = [
  [/ modele | template | maquette | vierge /, 'modele', 'nom de fichier « modèle »'],
  [/ devis | pro ?forma | bon de commande | bon de livraison /, 'justificatif_annexe', 'nom de fichier (devis, proforma, BL, BC)'],
  [/ verite terrain | ground truth | attendu /, 'evaluation', 'nom de fichier « vérité terrain »'],
];
const TABLEAU5 = new Set(['OR', 'FACT_NUM', 'DESIGNATION', 'M_HT', 'TVA', 'M_TTC', 'IF', 'LIB_FRSS', 'ICE_FRS', 'TAUX', 'ID_PAIE', 'DATE_PAIE', 'DATE_FAC']);
const TABULAR = ['.xlsx', '.xls', '.csv'];
const MAX_ANALYSIS = 15 * 1024 * 1024;

function pathSignal(name: string): { role: DocumentRole; indice: string; confiance: RoleSuggestion['confiance'] } | null {
  const parts = name.split(/[\\/]/).filter(Boolean);
  const folders = parts.slice(0, -1), file = parts[parts.length - 1] || name;
  for (const folder of folders) {
    const w = words(folder);
    for (const [re, role, indice, confiance] of FOLDER_RULES) if (re.test(w)) return { role, indice: `${indice} : « ${folder} »`, confiance };
  }
  const w = words(file.replace(/\.[^.]+$/, ''));
  for (const [re, role, indice] of FILE_RULES) if (re.test(w)) return { role, indice, confiance: 'moyenne' };
  return null;
}

/** Valeur associée à un libellé d'en-tête (à droite sur la même ligne, sinon première cellule de la ligne suivante). */
function labelValue(grid: any[][], re: RegExp, headerIndex: number, labels: RegExp): unknown {
  for (let r = 0; r < Math.min(headerIndex, grid.length); r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] !== 'string' || !re.test(fold(row[c]))) continue;
      const right = row.slice(c + 1).find(v => v !== '' && v !== null && v !== undefined && !(typeof v === 'string' && labels.test(fold(v))));
      if (right !== undefined) return right;
      const below = (grid[r + 1] || []).find(v => v !== '' && v !== null && v !== undefined && !(typeof v === 'string' && labels.test(fold(v))));
      if (below !== undefined) return below;
    }
  }
  return undefined;
}

export interface TableauAnalysis { feuilles: string[]; feuille?: string; headerIndex: number; lignes: number; periodes: string[]; identite?: IdentityCandidate }

/** Analyse structurelle d'un classeur : feuille Tableau5, nombre de lignes, périodes couvertes, identité d'en-tête. */
export function analyzeWorkbook(buffer: Buffer, ext: string): TableauAnalysis | null {
  if (!TABULAR.includes(ext) || buffer.length > MAX_ANALYSIS) return null;
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false, sheetRows: 12000 }); } catch { return null; }
  const feuilles = wb.SheetNames;
  let best: TableauAnalysis | null = null;
  for (const name of feuilles) {
    // blankrows conservées : headerIndex correspond au numéro de ligne réel du classeur (preuve localisable).
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: true });
    let headerIndex = -1, hits = 0;
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      const h = grid[i].filter(c => typeof c === 'string' && TABLEAU5.has(normalizeHeader(c))).length;
      if (h > hits) { hits = h; headerIndex = i; }
      if (h >= 8) break;
    }
    if (hits < 5) continue;
    const headers = grid[headerIndex].map((h: unknown) => normalizeHeader(String(h ?? '')));
    const dateCols = headers.map((h: string, i: number) => (['DATE_PAIE', 'DATE_FAC'].includes(h) ? i : -1)).filter((i: number) => i >= 0);
    const months = new Set<string>();
    let lignes = 0;
    for (const line of grid.slice(headerIndex + 1)) {
      const first = String(line.find((c: unknown) => String(c ?? '').trim() !== '') ?? '').trim();
      if (!first || /^(total|totaux|sous[- ]total)/i.test(first)) continue;
      lignes++;
      for (const c of dateCols) { const iso = toIsoDate(line[c]); if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) months.add(iso.slice(0, 7)); }
    }
    const labels = /raison social|id[ _]?fiscal|identifiant fiscal|annee|periode|regime|modele n|relev/;
    const raison = labelValue(grid, /raison social/, headerIndex, labels);
    const iff = labelValue(grid, /id[ _]?fiscal|identifiant fiscal/, headerIndex, labels);
    const annee = labelValue(grid, /^annee/, headerIndex, labels), periode = labelValue(grid, /^periode/, headerIndex, labels);
    const identite: IdentityCandidate | undefined = raison || iff ? {
      raisonSociale: raison ? String(raison).trim() : undefined, identifiantFiscal: iff !== undefined && /^\d{1,10}$/.test(String(iff).trim()) ? String(iff).trim() : undefined,
      annee: Number(annee) >= 2000 && Number(annee) <= 2100 ? Number(annee) : undefined, periode: Number(periode) >= 1 && Number(periode) <= 12 ? Number(periode) : undefined,
      source: `feuille « ${name} », en-tête au-dessus de la ligne ${headerIndex + 1}`,
    } : undefined;
    const a: TableauAnalysis = { feuilles, feuille: name, headerIndex, lignes, periodes: [...months].sort(), identite };
    if (!best || a.lignes > best.lignes) best = a;
  }
  return best || { feuilles, headerIndex: -1, lignes: 0, periodes: [] };
}

export interface ClassifyOptions { company?: { name?: string; iff?: string }; intent?: 'import' | 'auto' }

/** Suggestion déterministe de rôle. `piece_comptable` par défaut ; jamais de ligne créée sur un doute fort. */
export function classifyDocument(name: string, ext: string, buffer?: Buffer, opts: ClassifyOptions = {}): RoleSuggestion {
  const indices: string[] = [];
  const path = pathSignal(name);
  let role: DocumentRole = 'piece_comptable', confiance: RoleSuggestion['confiance'] = 'faible';
  if (path) { role = path.role; confiance = path.confiance; indices.push(path.indice); }
  const out: RoleSuggestion = { role, confiance, indices };
  const analysis = buffer ? analyzeWorkbook(buffer, ext) : null;
  if (analysis) {
    out.feuilles = analysis.feuilles;
    if (analysis.headerIndex >= 0) {
      out.lignesTableau = analysis.lignes; out.periodes = analysis.periodes; out.identite = analysis.identite;
      indices.push(`classeur Tableau5 (${analysis.lignes} ligne(s), ${analysis.periodes.length} période(s)${analysis.periodes.length ? ' : ' + analysis.periodes.slice(0, 6).join(', ') + (analysis.periodes.length > 6 ? '…' : '') : ''})`);
      const company = fold(opts.company?.name).replace(/[^a-z0-9]+/g, ' ').trim();
      const found = fold(analysis.identite?.raisonSociale).replace(/[^a-z0-9]+/g, ' ').trim();
      if (company && found && company !== found && !company.includes(found) && !found.includes(company)) {
        out.identiteContradictoire = true;
        indices.push(`raison sociale du classeur « ${analysis.identite!.raisonSociale} » différente de la société configurée « ${opts.company!.name} »`);
      }
      if (!path) {
        if (analysis.lignes === 0) { out.role = 'modele'; out.confiance = 'haute'; indices.push('tableau vide : structure sans données'); }
        else if (analysis.periodes.length >= 3 && analysis.lignes >= 20) { out.role = 'historique'; out.confiance = 'moyenne'; indices.push('plusieurs périodes de déclaration dans un même classeur'); }
        else if (out.identiteContradictoire) { out.role = 'a_classifier'; out.confiance = 'moyenne'; indices.push('identité de société contradictoire : classement à confirmer avant toute ligne'); }
      }
    }
  }
  if (!indices.length) indices.push('aucun signal particulier : pièce comptable par défaut');
  return out;
}
