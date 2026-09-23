import PDFDocument from 'pdfkit';
import { join } from 'path';
import { FactureEntity } from '../factures/facture.entity';

export type ArchiveReport = {
  title: string; createdAt: string; author?: string; reference?: string; month?: string;
  company?: { name?: string; ice?: string; iff?: string; address?: string };
  selection?: string; rows: FactureEntity[];
  totals?: { totalHt: number; totalTva: number; totalTtc: number };
};
const C = { green: '#143B2D', teal: '#237A66', gold: '#D7AA48', ink: '#213D34', muted: '#66766F', pale: '#F0F5F2', cream: '#FAF7EF', line: '#DCE5DE', red: '#A34236', white: '#FFFFFF' };
const value = (input: unknown) => input == null || input === '' ? '—' : String(input);
const amount = (input?: number | null) => input == null ? '—' : input.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ');
const money = (input?: number | null) => input == null ? '—' : amount(input) + ' MAD';
const bank = (row: FactureEntity) => ['releve_bancaire', 'avis_debit_virement'].includes(row.sousType) && row.designation !== 'COMMISSION';
const sum = (rows: FactureEntity[], key: 'mHt' | 'tva' | 'mTtc') => rows.reduce((n, row) => n + Math.round((row[key] || 0) * 100), 0) / 100;

/** Charts use only selected rows; credits retain their sign and banking movements are excluded. */
export function reportMetrics(rows: FactureEntity[]) {
  const fiscal = rows.filter(row => !bank(row));
  const suppliers = new Map<string, number>();
  for (const row of fiscal) {
    const key = row.libFrss || 'Fournisseur non renseigné';
    suppliers.set(key, (suppliers.get(key) || 0) + Math.round((row.mTtc || 0) * 100));
  }
  const sorted = [...suppliers].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = sorted.slice(0, 4);
  if (sorted.length > 4) top.push(['Autres fournisseurs', sorted.slice(4).reduce((n, item) => n + item[1], 0)]);
  return {
    totalHt: sum(fiscal, 'mHt'), totalTva: sum(fiscal, 'tva'), totalTtc: sum(fiscal, 'mTtc'),
    bankCount: rows.length - fiscal.length,
    suppliers: top.map(([label, cents]) => ({ label, amount: cents / 100 })),
    reviewed: rows.filter(row => row.revueHumaine && row.statut === 'validee' && !row.doublonDe).length,
    examples: rows.filter(row => row.demonstration).length,
  };
}

/** Shared visual system for archives, immutable snapshots and Excel-equivalent reports. */
export function archivePdf(report: ArchiveReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 44, bufferPages: true,
      info: { Title: report.title, Author: 'Waraqa', Subject: 'Relevé de travail et synthèse' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('Regular', join(__dirname, '../assets/fonts/DejaVuSans.ttf'));
    doc.registerFont('Bold', join(__dirname, '../assets/fonts/DejaVuSans-Bold.ttf'));
    const width = doc.page.width - 88;
    const metrics = reportMetrics(report.rows), totals = report.totals || metrics;
    const stamp = [report.month, report.selection || 'Archive de travail', metrics.examples ? 'EXEMPLES FICTIFS' : ''].filter(Boolean).join(' · ');
    const text = (content: string, x: number, y: number, w: number, size = 10, color = C.ink, bold = false) => {
      doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(content, x, y, { width: w, lineGap: 2 });
    };
    const fit = (content: string, w: number, size: number, min = 7) => {
      doc.font('Bold').fontSize(size);
      while (doc.widthOfString(content) > w && size > min) doc.fontSize(--size);
      return size;
    };
    const pageHeader = (section: string) => {
      doc.rect(0, 0, doc.page.width, 68).fill(C.green);
      doc.roundedRect(44, 18, 31, 31, 8).fill(C.gold);
      text('W', 48, 23, 25, 17, C.green, true);
      text('Waraqa', 88, 19, 190, 22, C.white, true);
      text('COMPTABILITÉ, EN CLAIR.', 89, 47, 240, 7, '#D2E4D9');
      text(report.month || 'Toutes périodes', 596, 24, 200, 11, C.white, true);
      text(section, 44, 86, width, 18, C.green, true);
      text(stamp, 44, 116, width, 8, C.muted);
    };
    pageHeader(report.title);
    const company = report.company?.name || 'Espace comptable Waraqa';
    text(company, 44, 139, 490, fit(company, 490, 11), C.ink, true);
    text(`Créé le ${report.createdAt}`, 540, 140, 258, 8, C.muted);
    const subtitle = [report.company?.ice ? 'ICE ' + report.company.ice : '', report.company?.iff ? 'IF ' + report.company.iff : '', report.author ? 'Par ' + report.author : ''].filter(Boolean).join(' · ');
    text(subtitle, 44, 158, width, 8, C.muted);
    const cards = [['Total HT', money(totals.totalHt)], ['TVA', money(totals.totalTva)], ['Total TTC', money(totals.totalTtc)], ['Lignes conservées', String(report.rows.length)]];
    const cardWidth = (width - 36) / 4;
    cards.forEach(([label, number], i) => {
      const x = 44 + i * (cardWidth + 12), dark = i === 2;
      doc.roundedRect(x, 183, cardWidth, 72, 9).fill(dark ? C.green : C.pale);
      text(label.toUpperCase(), x + 13, 195, cardWidth - 26, 8, dark ? '#D2E4D9' : C.muted, true);
      text(number, x + 13, 216, cardWidth - 26, fit(number, cardWidth - 26, 17, 9), dark ? C.white : C.green, true);
    });
    if (!report.rows.length) {
      doc.roundedRect(44, 282, width, 154, 10).fill(C.cream);
      text('Aucune ligne dans cette archive.', 66, 320, width - 44, 18, C.green, true);
      text('Les graphiques apparaîtront lorsque cette sélection contiendra des données.', 66, 359, width - 44, 11, C.muted);
    } else {
      doc.roundedRect(44, 272, 442, 202, 10).fill(C.pale);
      text('Fournisseurs · TTC net', 60, 286, 405, 12, C.green, true);
      text('4 premiers par montant absolu + autres · MAD', 60, 307, 405, 8, C.muted);
      const chart = metrics.suppliers, max = Math.max(1, ...chart.map(item => Math.abs(item.amount)));
      const negative = chart.some(item => item.amount < 0), zero = negative ? 299 : 228, range = negative ? 66 : 137;
      doc.moveTo(zero, 330).lineTo(zero, 457).lineWidth(0.6).stroke(C.line);
      chart.forEach((item, i) => {
        const y = 333 + i * 25;
        // Only chart labels are abbreviated; complete labels are retained in the tables.
        doc.font('Regular').fontSize(8);
        let label = item.label;
        while (doc.widthOfString(label) > 156) label = label.slice(0, -2) + '…';
        text(label, 60, y, 160, 8);
        const len = Math.abs(item.amount) / max * range;
        if (len > 0) doc.rect(item.amount < 0 ? zero - len : zero, y + 1, len, 10).fill(item.amount < 0 ? C.red : C.teal);
        text(amount(item.amount), 373, y, 98, fit(amount(item.amount), 98, 8), item.amount < 0 ? C.red : C.ink);
      });
      if (!chart.length) text('Aucun achat dans cette sélection.', 60, 345, 405, 10, C.muted);
      doc.roundedRect(500, 272, width - 456, 202, 10).fill(C.cream);
      text('État de la revue', 518, 287, 260, 12, C.green, true);
      const fraction = metrics.reviewed / report.rows.length, cx = 557, cy = 363, r = 28;
      doc.circle(cx, cy, r).lineWidth(10).stroke(C.line);
      if (fraction > 0) {
        const steps = Math.max(2, Math.ceil(90 * fraction));
        doc.moveTo(cx, cy - r);
        for (let i = 1; i <= steps; i++) { const a = -Math.PI / 2 + Math.PI * 2 * fraction * i / steps; doc.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        doc.lineWidth(10).stroke(C.teal);
      }
      text(Math.round(fraction * 100) + '%', cx - 22, cy - 8, 49, 12, C.green, true);
      text(`${metrics.reviewed} revue(s)`, 611, 340, 166, 10, C.green, true);
      text(`${report.rows.length - metrics.reviewed} à contrôler`, 611, 362, 166, 9, C.muted);
      text(`${metrics.examples} exemple(s) fictif(s)`, 518, 415, 260, 9, C.muted);
      text(`${metrics.bankCount} mouvement(s) bancaire(s)`, 518, 436, 260, 9, C.muted);
    }
    text('PÉRIMÈTRE DU DOCUMENT', 44, 492, width, 8, C.green, true);
    text('Montants et graphiques hors paiements bancaires. Les avoirs sont conservés avec leur signe. Les tableaux reprennent toutes les lignes sélectionnées, y compris les statuts et valeurs absentes (—).', 44, 507, width, 8, C.muted);

    // Split oversized cells over pages without losing text. Repeat column headers and row IDs.
    const table = (section: string, columns: string[], widths: number[], records: string[][]) => {
      const lineHeight = 12, pad = 7, bottom = 536;
      let y = 0;
      const start = () => {
        doc.addPage(); pageHeader(section); y = 143;
        doc.rect(44, y, width, 30).fill(C.green);
        let x = 44;
        columns.forEach((label, i) => { text(label, x + pad, y + 7, widths[i] - 2 * pad, 8, C.white, true); x += widths[i]; });
        y += 30;
      };
      const wrap = (content: string, w: number) => {
        doc.font('Regular').fontSize(8);
        const lines: string[] = [];
        for (const paragraph of content.replace(/\r\n?/g, '\n').split('\n')) {
          let line = '';
          for (const word of paragraph.split(/\s+/)) {
            if (line && doc.widthOfString(line + ' ' + word) > w) { lines.push(line); line = ''; }
            if (doc.widthOfString(word) > w) {
              for (const char of word) { if (line && doc.widthOfString(line + char) > w) { lines.push(line); line = ''; } line += char; }
            } else line += (line ? ' ' : '') + word;
          }
          lines.push(line);
        }
        return lines;
      };
      start();
      records.forEach((record, index) => {
        const cells = record.map((cell, i) => wrap(cell, widths[i] - 2 * pad));
        const count = Math.max(...cells.map(cell => cell.length));
        if (count * lineHeight + 2 * pad <= bottom - 173 && y + count * lineHeight + 2 * pad > bottom) start();
        let offset = 0;
        while (offset < count) {
          const capacity = Math.floor((bottom - y - 2 * pad) / lineHeight);
          if (capacity < 1) { start(); continue; }
          const take = Math.min(count - offset, capacity), height = take * lineHeight + 2 * pad;
          doc.rect(44, y, width, height).fill(index % 2 ? C.white : C.pale);
          let x = 44;
          cells.forEach((lines, i) => {
            const part = i === 0 && offset > 0 ? [record[0]] : lines.slice(offset, offset + take);
            part.forEach((line, n) => text(line, x + pad, y + pad + n * lineHeight, widths[i] - 2 * pad, 8));
            x += widths[i];
          });
          doc.moveTo(44, y + height).lineTo(44 + width, y + height).lineWidth(0.4).stroke(C.line);
          y += height; offset += take;
          if (offset < count) start();
        }
      });
    };
    if (report.rows.length) {
      table('01 / Relevé financier', ['ID', 'Référence', 'Fournisseur', 'Désignation', 'HT · MAD', 'TVA · MAD', 'TTC · MAD', 'Taux'], [32, 100, 140, 165, 87, 78, 87, 65], report.rows.map(row => [String(row.id), value(row.factNum), value(row.libFrss), value(row.designation), amount(row.mHt), amount(row.tva), amount(row.mTtc), row.taux == null ? '—' : Number((row.taux * 100).toFixed(4)) + ' %']));
      table('02 / Identifiants, paiement et contrôle', ['ID', 'Référence', 'OR', 'ICE fournisseur', 'IF', 'Date facture', 'Date paiement', 'Mode (ID)', 'Contrôle / traçabilité'], [32, 90, 40, 122, 85, 80, 80, 70, 155], report.rows.map(row => [String(row.id), value(row.factNum), value(row.or), value(row.iceFrs), value(row.iff), value(row.dateFac), value(row.datePaie), value(row.idPaie), [
        row.demonstration ? 'EXEMPLE FICTIF' : '', `Type : ${value(row.sousType)}`, `Statut : ${value(row.statut)}`, `Revue humaine : ${row.revueHumaine ? 'Oui' : 'Non'}`, row.archivee ? 'Archivée : Oui' : '', row.champsManquants?.length ? 'Champs manquants : ' + row.champsManquants.join(', ') : '', row.doublonDe ? 'Doublon de #' + row.doublonDe : '', row.creditOf ? 'Avoir de #' + row.creditOf : '', row.documentId ? 'Pièce : ' + row.documentId : '',
      ].filter(Boolean).join('\n')]));
    }
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      doc.moveTo(44, 553).lineTo(44 + width, 553).lineWidth(0.6).stroke(C.line);
      text('WARAQA · Document de travail · ' + (report.reference || 'Copie de consultation'), 44, 565, 615, 7, C.muted);
      text(`${page + 1} / ${pages.count}`, 735, 563, 62, 9, C.green, true);
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
