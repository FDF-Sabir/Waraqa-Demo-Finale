import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { analyzeWorkbook, IdentityCandidate } from './document-role';
import { normalizeHeader } from './table-import';

/**
 * Lecture documentaire d'un classeur (plan directeur §9.2) : au lieu d'envoyer tout le classeur en
 * texte, l'assistant consulte un INDEX (feuilles, dimensions, en-têtes, formules, fusions, noms
 * définis, mappage XML, identité d'en-tête) puis lit des PLAGES par blocs, avec couverture
 * explicite (total / couvert / reste) et références de cellules pour localiser chaque preuve.
 * Distinctions conservées : cellule absente, formule sans valeur en cache, nombre, date, texte,
 * identifiant avec zéros initiaux (jamais converti).
 */
export interface SheetIndex {
  nom: string; plage: string | null; lignes: number; colonnes: number; ligneEntete: number | null; entetes: string[];
  formules: number; fusions: number; filtreAuto: boolean; tableau5: boolean;
}
export interface WorkbookIndex {
  feuilles: SheetIndex[]; nomsDefinis: { nom: string; reference: string }[]; mappageXml: boolean; identite?: IdentityCandidate; periodes: string[];
  conseil: string;
}
export interface RangeResult {
  feuille: string; debut: number; fin: number; total: number; couvert: number; reste: number; entetes: string[];
  lignes: { ligne: number; cellules: Record<string, unknown> }[]; notes: string[];
}

const TABLEAU5 = new Set(['OR', 'FACT_NUM', 'DESIGNATION', 'M_HT', 'TVA', 'M_TTC', 'IF', 'LIB_FRSS', 'ICE_FRS', 'TAUX', 'ID_PAIE', 'DATE_PAIE', 'DATE_FAC']);
export const MAX_RANGE_ROWS = 200;

function read(buffer: Buffer, ext: string) {
  return XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false, cellFormula: true, cellNF: true, cellStyles: false, ...(ext === '.csv' ? { FS: undefined } : {}) });
}

/** Ligne d'en-tête probable : première ligne (parmi 40) avec le plus de textes reconnus Tableau5, sinon ≥ 3 textes. */
function headerRow(sheet: XLSX.WorkSheet, range: XLSX.Range): { index: number; headers: string[]; tableau5: boolean } | null {
  let best = { index: -1, score: 0, texts: 0 };
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40); r++) {
    let t5 = 0, texts = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'string' && cell.v.trim()) { texts++; if (TABLEAU5.has(normalizeHeader(cell.v))) t5++; }
    }
    const score = t5 * 10 + texts;
    if (t5 >= 5) { best = { index: r, score, texts }; break; }
    if (score > best.score && texts >= 3) best = { index: r, score, texts };
  }
  if (best.index < 0) return null;
  const headers: string[] = [];
  let t5 = 0;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: best.index, c })];
    const v = cell && cell.v !== undefined ? String(cell.v).trim() : '';
    headers.push(v);
    if (TABLEAU5.has(normalizeHeader(v))) t5++;
  }
  return { index: best.index, headers, tableau5: t5 >= 5 };
}

export function workbookIndex(buffer: Buffer, ext: string): WorkbookIndex {
  const wb = read(buffer, ext);
  const feuilles: SheetIndex[] = wb.SheetNames.map(nom => {
    const sheet = wb.Sheets[nom];
    const ref = sheet['!ref'] || null;
    if (!ref) return { nom, plage: null, lignes: 0, colonnes: 0, ligneEntete: null, entetes: [], formules: 0, fusions: 0, filtreAuto: false, tableau5: false };
    const range = XLSX.utils.decode_range(ref);
    let formules = 0;
    for (const key of Object.keys(sheet)) if (key[0] !== '!' && (sheet[key] as XLSX.CellObject).f) formules++;
    const h = headerRow(sheet, range);
    return {
      nom, plage: ref, lignes: range.e.r - range.s.r + 1, colonnes: range.e.c - range.s.c + 1, ligneEntete: h ? h.index + 1 : null, entetes: h ? h.headers : [],
      formules, fusions: (sheet['!merges'] || []).length, filtreAuto: Boolean(sheet['!autofilter']), tableau5: Boolean(h?.tableau5),
    };
  });
  const nomsDefinis = ((wb.Workbook?.Names || []) as any[]).filter(n => n?.Name && !/^_xlnm\./.test(n.Name)).slice(0, 50).map(n => ({ nom: String(n.Name), reference: String(n.Ref || '') }));
  let mappageXml = false;
  if (ext === '.xlsx' || ext === '.xlsm') { try { mappageXml = Boolean(unzipSync(new Uint8Array(buffer), { filter: f => /^xl\/xmlMaps\.xml$/.test(f.name) })['xl/xmlMaps.xml']); } catch { /* classeur non zip */ } }
  const analysis = analyzeWorkbook(buffer, ext);
  const big = feuilles.reduce((n, f) => n + f.lignes, 0) > MAX_RANGE_ROWS;
  return {
    feuilles, nomsDefinis, mappageXml, identite: analysis?.identite, periodes: analysis?.periodes || [],
    conseil: big
      ? `Classeur volumineux : lire par plages de ${MAX_RANGE_ROWS} lignes maximum avec lire_plage (feuille, debut, nombre) en suivant total/couvert/reste ; ne jamais annoncer une lecture complète avant reste = 0.`
      : 'Classeur court : lire_plage sur chaque feuille suffit à tout couvrir.',
  };
}

/** Valeur lisible d'une cellule : type conservé, date ISO, formule sans cache signalée, texte tel quel (zéros initiaux préservés). */
export function cellValue(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return undefined;
  if (cell.f && (cell.v === undefined || cell.v === null)) return { formule: '=' + cell.f, valeur: null, note: 'formule sans valeur en cache' };
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(String(cell.z))) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : cell.v;
  }
  if (cell.t === 'e') return { erreur: cell.w || String(cell.v) };
  if (cell.f) return { formule: '=' + cell.f, valeur: cell.v };
  return cell.v;
}

export function readRange(buffer: Buffer, ext: string, spec: { feuille?: string; debut?: number; nombre?: number; colonnes?: string[] }): RangeResult {
  const wb = read(buffer, ext);
  const nom = spec.feuille && wb.SheetNames.includes(spec.feuille) ? spec.feuille : wb.SheetNames.includes('EDI') ? 'EDI' : wb.SheetNames[0];
  if (!nom) throw new Error('Classeur sans feuille.');
  const sheet = wb.Sheets[nom];
  const notes: string[] = [];
  if (spec.feuille && spec.feuille !== nom) notes.push(`Feuille « ${spec.feuille} » inconnue : lecture de « ${nom} ». Feuilles disponibles : ${wb.SheetNames.join(', ')}.`);
  const ref = sheet['!ref'];
  if (!ref) return { feuille: nom, debut: 1, fin: 0, total: 0, couvert: 0, reste: 0, entetes: [], lignes: [], notes: [...notes, 'Feuille vide.'] };
  const range = XLSX.utils.decode_range(ref);
  const total = range.e.r + 1;
  const debut = Math.max(1, Math.min(Number(spec.debut) || 1, total));
  const nombre = Math.max(1, Math.min(MAX_RANGE_ROWS, Number(spec.nombre) || 50));
  const fin = Math.min(total, debut + nombre - 1);
  const h = headerRow(sheet, range);
  const entetes = h ? h.headers : [];
  const wanted = spec.colonnes?.length ? new Set(spec.colonnes.map(c => c.toUpperCase())) : null;
  const lignes: RangeResult['lignes'] = [];
  for (let r = debut - 1; r <= fin - 1; r++) {
    const cellules: Record<string, unknown> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const col = XLSX.utils.encode_col(c);
      if (wanted && !wanted.has(col)) continue;
      const v = cellValue(sheet[XLSX.utils.encode_cell({ r, c })]);
      if (v !== undefined && v !== '') cellules[col] = v;
    }
    if (Object.keys(cellules).length) lignes.push({ ligne: r + 1, cellules });
  }
  if (h && h.index + 1 >= debut && h.index + 1 <= fin) notes.push(`La ligne ${h.index + 1} est la ligne d'en-têtes.`);
  return { feuille: nom, debut, fin, total, couvert: fin, reste: Math.max(0, total - fin), entetes, lignes, notes };
}

/** Résumé textuel court d'un index, pour le contexte d'une pièce jointe au chat. */
export function describeIndex(index: WorkbookIndex): string {
  const sheets = index.feuilles.map(f => `« ${f.nom} » ${f.plage || 'vide'} (${f.lignes} lignes × ${f.colonnes} colonnes${f.ligneEntete ? `, en-têtes ligne ${f.ligneEntete} : ${f.entetes.filter(Boolean).slice(0, 13).join(' | ')}` : ''}${f.formules ? `, ${f.formules} formules` : ''}${f.fusions ? `, ${f.fusions} fusions` : ''}${f.tableau5 ? ', Tableau5 reconnu' : ''})`);
  const id = index.identite ? ` Identité d'en-tête : ${index.identite.raisonSociale || '?'}${index.identite.identifiantFiscal ? ', IF ' + index.identite.identifiantFiscal : ''}${index.identite.annee ? ', ' + index.identite.annee : ''}${index.identite.periode ? '/' + String(index.identite.periode).padStart(2, '0') : ''}.` : '';
  return `Index du classeur — ${index.feuilles.length} feuille(s) : ${sheets.join(' ; ')}.${index.mappageXml ? ' Mappage XML présent.' : ''}${index.nomsDefinis.length ? ` Noms définis : ${index.nomsDefinis.map(n => n.nom).slice(0, 10).join(', ')}.` : ''}${index.periodes.length ? ` Périodes détectées : ${index.periodes.join(', ')}.` : ''}${id} ${index.conseil}`;
}
