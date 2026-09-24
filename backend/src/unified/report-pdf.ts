import PDFDocument from 'pdfkit';
import { join } from 'path';

/**
 * Rapport rédactionnel (plan directeur §9.7, famille « rapport ») : Markdown rédigé par l'agent à
 * partir des résultats d'outils, rendu en PDF portrait lisible. Le serveur ajoute les métadonnées
 * (société, période, auteur, date, statut brouillon, sources) : le fichier dit d'où il vient.
 */
export interface ReportSpec {
  title: string; markdown: string; createdAt: string; author?: string; month?: string;
  company?: { name?: string; ice?: string; iff?: string };
  statut?: 'brouillon' | 'final'; sources?: string[]; note?: string;
}
const C = { green: '#143B2D', teal: '#237A66', gold: '#D7AA48', ink: '#213D34', muted: '#66766F', pale: '#F0F5F2', line: '#DCE5DE', white: '#FFFFFF' };

type Block = { type: 'h'; level: number; text: string } | { type: 'p'; text: string } | { type: 'ul'; items: string[] } | { type: 'ol'; items: string[] } | { type: 'table'; rows: string[][] } | { type: 'hr' } | { type: 'quote'; text: string } | { type: 'code'; text: string };

/** Analyse Markdown minimale : titres, paragraphes, listes, tableaux, citations, code, séparateurs. */
export function parseMarkdown(md: string): Block[] {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) { const buf: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push({ type: 'code', text: buf.join('\n') }); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (isRow(l)) { const rows: string[][] = []; while (i < lines.length && isRow(lines[i])) { if (!isSep(lines[i])) rows.push(cells(lines[i])); i++; } blocks.push({ type: 'table', rows }); continue; }
    if (/^\s*[-*•]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, '')); blocks.push({ type: 'ul', items }); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); blocks.push({ type: 'ol', items }); continue; }
    if (/^\s*>\s?/.test(l)) { const buf: string[] = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, '')); blocks.push({ type: 'quote', text: buf.join(' ') }); continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !isRow(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s*>/.test(lines[i])) buf.push(lines[i++].trim());
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
}

/** Segments gras / normal pour pdfkit (les autres marques Markdown sont retirées). */
function segments(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  const clean = (s: string) => s.replace(/`([^`]*)`/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  while ((m = re.exec(text))) { if (m.index > last) out.push({ text: clean(text.slice(last, m.index)), bold: false }); out.push({ text: clean(m[1]), bold: true }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ text: clean(text.slice(last)), bold: false });
  return out.filter(s => s.text);
}

export function markdownPdf(spec: ReportSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true, info: { Title: spec.title, Author: 'Waraqa', Subject: 'Rapport comptable' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('Regular', join(__dirname, '../assets/fonts/DejaVuSans.ttf'));
    doc.registerFont('Bold', join(__dirname, '../assets/fonts/DejaVuSans-Bold.ttf'));
    const width = doc.page.width - 112;
    const rich = (text: string, size: number, color = C.ink, opts: any = {}) => {
      const parts = segments(text);
      if (!parts.length) { doc.moveDown(0.4); return; }
      parts.forEach((s, i) => doc.font(s.bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(s.text, { continued: i < parts.length - 1, lineGap: 3, ...opts }));
    };
    // Bandeau
    doc.rect(0, 0, doc.page.width, 84).fill(C.green);
    doc.roundedRect(56, 24, 34, 34, 8).fill(C.gold);
    doc.font('Bold').fontSize(18).fillColor(C.green).text('W', 61, 30, { width: 26 });
    doc.font('Bold').fontSize(20).fillColor(C.white).text('Waraqa', 102, 26, { width: 300 });
    doc.font('Regular').fontSize(7).fillColor('#D2E4D9').text('RAPPORT COMPTABLE · ' + (spec.statut === 'final' ? 'VERSION FINALE' : 'BROUILLON DE TRAVAIL'), 103, 54, { width: 300 });
    doc.font('Regular').fontSize(9).fillColor(C.white).text(spec.month || '', 400, 34, { width: 139, align: 'right' });
    doc.y = 104;
    doc.font('Bold').fontSize(19).fillColor(C.green).text(spec.title, 56, doc.y, { width });
    const meta = [spec.company?.name, spec.company?.iff ? 'IF ' + spec.company.iff : '', spec.company?.ice ? 'ICE ' + spec.company.ice : '', spec.author ? 'Par ' + spec.author : '', 'Créé le ' + spec.createdAt.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ');
    doc.moveDown(0.3); doc.font('Regular').fontSize(8.5).fillColor(C.muted).text(meta, { width });
    doc.moveDown(0.3); doc.moveTo(56, doc.y).lineTo(56 + width, doc.y).lineWidth(0.8).stroke(C.gold); doc.moveDown(0.8);
    const ensure = (h: number) => { if (doc.y + h > doc.page.height - 70) doc.addPage(); };
    for (const b of parseMarkdown(spec.markdown)) {
      if (b.type === 'h') { ensure(40); doc.moveDown(b.level === 1 ? 0.6 : 0.4); rich(b.text, b.level === 1 ? 15 : b.level === 2 ? 12.5 : 11, C.green); doc.moveDown(0.25); }
      else if (b.type === 'p') { ensure(30); rich(b.text, 10); doc.moveDown(0.5); }
      else if (b.type === 'quote') { ensure(30); const y0 = doc.y; rich(b.text, 9.5, C.muted, { indent: 14, width: width - 14 }); doc.rect(56, y0, 3, doc.y - y0).fill(C.teal); doc.moveDown(0.5); }
      else if (b.type === 'code') { ensure(30); doc.font('Regular').fontSize(8.5).fillColor(C.ink).text(b.text, { width, lineGap: 2 }); doc.moveDown(0.5); }
      else if (b.type === 'hr') { ensure(12); doc.moveTo(56, doc.y).lineTo(56 + width, doc.y).lineWidth(0.5).stroke(C.line); doc.moveDown(0.6); }
      else if (b.type === 'ul' || b.type === 'ol') {
        b.items.forEach((item, n) => { ensure(20); const x = doc.x, y = doc.y; doc.font('Regular').fontSize(10).fillColor(C.teal).text(b.type === 'ul' ? '•' : `${n + 1}.`, 62, y, { width: 22 }); doc.x = 84; doc.y = y; rich(item, 10, C.ink, { width: width - 28 }); doc.x = x; });
        doc.moveDown(0.5);
      } else if (b.type === 'table' && b.rows.length) {
        const cols = Math.max(...b.rows.map(r => r.length));
        const w = width / cols, pad = 4, lh = 11;
        b.rows.forEach((row, ri) => {
          doc.font(ri === 0 ? 'Bold' : 'Regular').fontSize(8.5);
          const heights = row.map(c => doc.heightOfString(c || ' ', { width: w - 2 * pad, lineGap: 1 }));
          const h = Math.max(lh, ...heights) + 2 * pad;
          ensure(h);
          const y = doc.y;
          doc.rect(56, y, width, h).fill(ri === 0 ? C.green : ri % 2 ? C.white : C.pale);
          for (let c = 0; c < cols; c++) doc.font(ri === 0 ? 'Bold' : 'Regular').fontSize(8.5).fillColor(ri === 0 ? C.white : C.ink).text(row[c] || '', 56 + c * w + pad, y + pad, { width: w - 2 * pad, lineGap: 1 });
          doc.y = y + h;
        });
        doc.moveDown(0.6);
      }
    }
    // Sources et limites
    ensure(80);
    doc.moveDown(0.6); doc.moveTo(56, doc.y).lineTo(56 + width, doc.y).lineWidth(0.5).stroke(C.line); doc.moveDown(0.5);
    doc.font('Bold').fontSize(9).fillColor(C.green).text('Sources et limites', { width });
    doc.font('Regular').fontSize(8).fillColor(C.muted).text((spec.sources?.length ? 'Données consultées : ' + spec.sources.join(' ; ') + '. ' : '') + (spec.note || 'Montants et totaux calculés par le serveur Waraqa à la date de création ; le rapport n’est pas une certification fiscale et les points « à vérifier » restent au comptable.'), { width, lineGap: 2 });
    const pages = doc.bufferedPageRange();
    for (let p = pages.start; p < pages.start + pages.count; p++) {
      doc.switchToPage(p);
      const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      doc.font('Regular').fontSize(7).fillColor(C.muted).text('WARAQA · ' + spec.title.slice(0, 80) + ' · ' + (spec.statut === 'final' ? 'final' : 'brouillon'), 56, doc.page.height - 40, { width: width - 60 });
      doc.font('Bold').fontSize(8.5).fillColor(C.green).text(`${p + 1} / ${pages.count}`, 56 + width - 60, doc.page.height - 41, { width: 60, align: 'right' });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
