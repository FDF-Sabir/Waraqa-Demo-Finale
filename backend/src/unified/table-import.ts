import * as XLSX from 'xlsx';

/**
 * Lecture des fichiers structurés (XLSX, XLS, CSV) : la ligne d'en-têtes est cherchée dans les
 * 30 premières lignes (le modèle DGI place Tableau5 en ligne 8 sous un bloc d'identification),
 * la ligne « Total » et les lignes vides sont ignorées, les dates Excel sont converties sans
 * décalage de fuseau horaire.
 */

/** Nom de colonne normalisé : majuscules, sans accents, séparateurs → « _ ». */
export function normalizeHeader(name: string) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const HEADER_ALIASES: Record<string, string> = {
  OR: 'or', ORD: 'or', N_ORDRE: 'or',
  FACT_NUM: 'factNum', NUMERO_FACTURE: 'factNum', N_FACTURE: 'factNum', NUM_FACTURE: 'factNum', FACTURE: 'factNum', NUMERO: 'factNum', REFERENCE: 'factNum',
  DESIGNATION: 'designation', LIBELLE: 'designation', NATURE: 'designation',
  M_TTC: 'mTtc', TOTAL_TTC: 'mTtc', TTC: 'mTtc', MONTANT_TTC: 'mTtc', MT_TTC: 'mTtc',
  IF: 'iff', IF_FOURNISSEUR: 'iff', IDENTIFIANT_FISCAL: 'iff',
  LIB_FRSS: 'libFrss', NOM_FOURNISSEUR: 'libFrss', FOURNISSEUR: 'libFrss', RAISON_SOCIALE: 'libFrss',
  ICE_FRS: 'iceFrs', ICE_FOURNISSEUR: 'iceFrs', ICE: 'iceFrs',
  TAUX: 'taux', TAUX_TVA: 'taux', TX: 'taux',
  ID_PAIE: 'idPaie', MODE_PAIEMENT: 'idPaie', MODE_DE_PAIEMENT: 'idPaie', MP: 'idPaie',
  DATE_PAIE: 'datePaie', DATE_PAIEMENT: 'datePaie', DATE_DE_PAIEMENT: 'datePaie', DPAI: 'datePaie',
  DATE_FAC: 'dateFac', DATE_FACTURE: 'dateFac', DATE_DE_FACTURE: 'dateFac', DFAC: 'dateFac',
  SOUS_TYPE: 'sousType', SOUSTYPE: 'sousType',
};
const DERIVED = new Set(['M_HT', 'HT', 'MONTANT_HT', 'TVA', 'MONTANT_TVA']);

export function aliasFor(header: string, fields: string[]): string {
  const n = normalizeHeader(header);
  if (DERIVED.has(n)) return '';
  return HEADER_ALIASES[n] || (fields.includes(header) ? header : header === 'sousType' ? 'sousType' : '');
}

/** Date ISO AAAA-MM-JJ depuis un numéro de série Excel, une date JJ/MM/AAAA ou ISO ; sinon texte inchangé. */
export function toIsoDate(value: unknown): string {
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = XLSX.SSF.parse_date_code(value);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const s = String(value ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

function pickSheet(wb: XLSX.WorkBook, known: (h: string) => boolean) {
  if (wb.SheetNames.includes('EDI')) return wb.Sheets.EDI;
  let best = wb.Sheets[wb.SheetNames[0]], score = -1;
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false }).slice(0, 30);
    const s = Math.max(0, ...grid.map(r => r.filter(c => typeof c === 'string' && known(c)).length));
    if (s > score) { score = s; best = wb.Sheets[name]; }
  }
  return best;
}

/**
 * Lignes du tableau sous forme d'objets { en-tête source: valeur }.
 * `known` indique si un en-tête est reconnu (alias ou mapping enregistré).
 */
export function readSheetRows(buffer: Buffer, known: (header: string) => boolean): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false });
  const sheet = pickSheet(wb, known);
  const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  let headerIndex = 0, best = 0;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const hits = grid[i].filter(c => typeof c === 'string' && c.trim() && known(c.trim())).length;
    if (hits > best) { best = hits; headerIndex = i; }
    if (hits >= 5) break;
  }
  const headers = (grid[headerIndex] || []).map((h: unknown) => String(h ?? '').trim());
  const rows: Record<string, unknown>[] = [];
  for (const line of grid.slice(headerIndex + 1)) {
    if (/^(total|totaux|sous[- ]total)/i.test(String(line.find((c: unknown) => String(c ?? '').trim() !== '') ?? '').trim())) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h && line[i] !== '' && line[i] !== undefined && line[i] !== null) row[h] = line[i]; });
    if (Object.keys(row).length) rows.push(row);
  }
  return { headers: headers.filter(Boolean), rows };
}
