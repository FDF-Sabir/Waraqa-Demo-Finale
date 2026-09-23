import { unzipSync } from 'fflate';
import { extname } from 'path';

/**
 * Extraction d'un dossier compressé (ZIP) remis par le comptable : chaque fichier accepté devient
 * une pièce importée. Dossiers imbriqués conservés dans le nom (« Juillet/Banque/avis.pdf »),
 * ZIP inclus dépliés sur un niveau, fichiers système ignorés, volumes plafonnés.
 */
export const ACCEPTED = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.csv', '.json'];
export const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 500 * 1024 * 1024;
const MAX_FILES = 2000;

export interface ArchiveEntry { name: string; buffer: Buffer }
export interface ArchiveResult { entries: ArchiveEntry[]; skipped: { name: string; reason: string }[] }

function decodeName(name: string) {
  // Noms enregistrés en UTF-8 sans le drapeau adéquat (ZIP créés sous Windows) : on tente la correction.
  try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); return /�/.test(fixed) ? name : fixed; } catch { return name; }
}

export function extractZip(buffer: Buffer, prefix = '', depth = 0): ArchiveResult {
  const result: ArchiveResult = { entries: [], skipped: [] };
  let total = 0, count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (f) => {
        if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\._/.test(f.name)) return false;
        const ext = extname(f.name).toLowerCase();
        if (!ACCEPTED.includes(ext) && !(ext === '.zip' && depth === 0)) { result.skipped.push({ name: prefix + decodeName(f.name), reason: 'Format non pris en charge' }); return false; }
        if (f.originalSize > (ext === '.zip' ? MAX_TOTAL : MAX_FILE)) { result.skipped.push({ name: prefix + decodeName(f.name), reason: 'Fichier supérieur à 20 Mo' }); return false; }
        total += f.originalSize; count++;
        if (total > MAX_TOTAL) throw new Error('Archive trop volumineuse une fois décompressée (500 Mo maximum).');
        if (count > MAX_FILES) throw new Error(`Archive trop fournie (${MAX_FILES} fichiers maximum).`);
        return true;
      },
    });
  } catch (e: any) {
    throw new Error(/maximum/.test(e?.message || '') ? e.message : 'Archive ZIP illisible ou protégée par mot de passe.');
  }
  for (const [raw, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = prefix + decodeName(raw);
    if (extname(raw).toLowerCase() === '.zip') {
      try {
        const inner = extractZip(Buffer.from(data), name.replace(/\.zip$/i, '') + '/', depth + 1);
        result.entries.push(...inner.entries); result.skipped.push(...inner.skipped);
      } catch (e: any) { result.skipped.push({ name, reason: e.message }); }
      continue;
    }
    if (!data.length) { result.skipped.push({ name, reason: 'Fichier vide' }); continue; }
    result.entries.push({ name, buffer: Buffer.from(data) });
  }
  return result;
}
