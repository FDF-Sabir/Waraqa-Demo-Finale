import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';

/**
 * Compléments déterministes mis à disposition de l'agent (plan directeur §9.8) :
 * - calcul exact d'expressions arithmétiques (l'IA ne calcule jamais elle-même) ;
 * - classeur Excel libre à partir de tableaux fournis par l'agent (plans de travail, échéanciers,
 *   comparaisons), clairement marqué comme rédigé par l'agent et non calculé par le serveur.
 */

/** Évalue une expression arithmétique (+ - * / % parenthèses, décimales, fonctions round/abs/min/max/sum) sans eval. */
export function calculer(expression: string): { expression: string; resultat: number; arrondi2: number } {
  let src = String(expression || '').replace(/\s+/g, '');
  // Virgule décimale acceptée seulement hors fonctions (où la virgule sépare les arguments) ; « ; » sépare toujours.
  if (!/[a-z]/i.test(src)) src = src.replace(/(\d),(\d)/g, '$1.$2');
  if (!src || src.length > 500) throw new BadRequestException('Expression vide ou trop longue (500 caractères).');
  if (!/^[0-9+\-*/%().,;a-z_]+$/i.test(src)) throw new BadRequestException('Expression : chiffres, + - * / %, parenthèses et fonctions round, abs, min, max, sum uniquement.');
  let i = 0;
  const peek = () => src[i];
  const fail = (m: string) => { throw new BadRequestException('Expression invalide : ' + m); };
  function number(): number {
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) fail('nombre attendu à la position ' + i);
    i += m![0].length; return Number(m![0]);
  }
  function args(): number[] {
    const out: number[] = [];
    if (peek() !== '(') fail('( attendue'); i++;
    if (peek() === ')') { i++; return out; }
    for (;;) { out.push(expr()); if (peek() === ',' || peek() === ';') { i++; continue; } if (peek() === ')') { i++; return out; } fail('virgule ou ) attendue'); }
  }
  function atom(): number {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') fail(') attendue'); i++; return v; }
    if (peek() === '-') { i++; return -atom(); }
    if (peek() === '+') { i++; return atom(); }
    const fn = /^[a-z_]+/i.exec(src.slice(i));
    if (fn) {
      i += fn[0].length; const a = args(); const name = fn[0].toLowerCase();
      if (name === 'round') { const p = a[1] ?? 0; const k = 10 ** p; return Math.round((a[0] + Number.EPSILON) * k) / k; }
      if (name === 'abs') return Math.abs(a[0]);
      if (name === 'min') return Math.min(...a);
      if (name === 'max') return Math.max(...a);
      if (name === 'sum') return a.reduce((s, x) => s + x, 0);
      fail('fonction inconnue ' + name);
    }
    return number();
  }
  function term(): number {
    let v = atom();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i++]; const r = atom();
      if (op === '*') v *= r; else if (op === '/') { if (r === 0) fail('division par zéro'); v /= r; } else v %= r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  const resultat = expr();
  if (i !== src.length) fail('caractère inattendu à la position ' + i);
  if (!Number.isFinite(resultat)) fail('résultat non fini');
  return { expression, resultat, arrondi2: Math.round((resultat + Number.EPSILON) * 100) / 100 };
}

export interface FeuilleLibre { nom: string; lignes: unknown[][]; largeurs?: number[] }
export const MAX_FEUILLES = 20, MAX_CELLULES = 50_000;

/** Classeur Excel à partir de feuilles fournies par l'agent ; une feuille « À propos » précise l'origine des données. */
export function classeurLibre(spec: { titre?: string; feuilles: FeuilleLibre[]; auteur: string; societe?: string; mois?: string; note?: string }): Buffer {
  if (!Array.isArray(spec.feuilles) || !spec.feuilles.length) throw new BadRequestException('Au moins une feuille requise.');
  if (spec.feuilles.length > MAX_FEUILLES) throw new BadRequestException(`${MAX_FEUILLES} feuilles maximum.`);
  const wb = XLSX.utils.book_new();
  const names = new Set<string>();
  let cells = 0;
  for (const f of spec.feuilles) {
    let nom = String(f.nom || 'Feuille').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Feuille';
    let n = 2; const base = nom; while (names.has(nom)) nom = (base.slice(0, 28) + ' ' + n++);
    names.add(nom);
    if (!Array.isArray(f.lignes)) throw new BadRequestException(`Feuille « ${nom} » : lignes attendues (tableau de tableaux).`);
    const rows = f.lignes.map(r => (Array.isArray(r) ? r : [r]).map(v => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v)));
    cells += rows.reduce((s, r) => s + r.length, 0);
    if (cells > MAX_CELLULES) throw new BadRequestException(`${MAX_CELLULES} cellules maximum par classeur.`);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const cols = Math.max(0, ...rows.map(r => r.length));
    ws['!cols'] = Array.from({ length: cols }, (_, c) => ({ wch: f.largeurs?.[c] || Math.min(60, Math.max(10, ...rows.map(r => String(r[c] ?? '').length + 2))) }));
    if (rows.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: Math.max(0, cols - 1) } }) };
    XLSX.utils.book_append_sheet(wb, ws, nom);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Titre', spec.titre || 'Classeur de travail'], ['Société', spec.societe || ''], ['Période', spec.mois || ''], ['Auteur', spec.auteur],
    ['Généré le', new Date().toISOString()], ['Origine des données', spec.note || 'Contenu rédigé par l’agent IA à partir des résultats d’outils ; les totaux comptables officiels sont ceux des relevés et tableaux calculés par le serveur.'],
  ]), 'À propos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Rapport en HTML autonome (même Markdown que le PDF), pour lecture navigateur ou copie dans un traitement de texte. */
export function markdownHtml(spec: { title: string; markdown: string; meta: string; sources?: string[] }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const lines = spec.markdown.replace(/\r/g, '').split('\n');
  const out: string[] = []; let i = 0;
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l), isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (isRow(l)) { const rows: string[][] = []; while (i < lines.length && isRow(lines[i])) { if (!isSep(lines[i])) rows.push(cells(lines[i])); i++; } out.push('<table>' + rows.map((r, ri) => '<tr>' + r.map(c => (ri ? '<td>' : '<th>') + inline(c) + (ri ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table>'); continue; }
    if (/^\s*[-*•]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, '')); out.push('<ul>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>'); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); out.push('<ol>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ol>'); continue; }
    if (/^\s*>\s?/.test(l)) { const buf: string[] = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, '')); out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>'); continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !isRow(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) && !/^\s*>/.test(lines[i])) buf.push(lines[i++].trim());
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#213d34;line-height:1.5}h1{color:#143b2d;border-bottom:2px solid #d7aa48;padding-bottom:6px}h2,h3{color:#143b2d}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}th,td{border:1px solid #dce5de;padding:6px 8px;text-align:left}th{background:#143b2d;color:#fff}blockquote{border-left:3px solid #237a66;margin:0;padding:4px 12px;color:#66766f}.meta,.sources{color:#66766f;font-size:13px}</style></head><body><h1>${esc(spec.title)}</h1><p class="meta">${esc(spec.meta)}</p>${out.join('\n')}<hr><p class="sources"><strong>Sources et limites.</strong> ${spec.sources?.length ? 'Données consultées : ' + esc(spec.sources.join(' ; ')) + '. ' : ''}Montants et totaux calculés par le serveur Waraqa à la date de création ; ce rapport n’est pas une certification fiscale.</p></body></html>`;
}
