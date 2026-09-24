import { DataSource } from 'typeorm';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';

const BUSY = /within a transaction|SQL statements in progress|database is locked|SQLITE_BUSY/i;
const RETRY_MS = 100, MAX_ATTEMPTS = 600; // jusqu'à 60 s d'attente

/** Format 2 : SQLite + originaux (`files/`) + fichiers livrés par l'agent (`livrables/`) + boîte d'envoi Drive (`drive-outbox/`). */
export const BACKUP_FORMAT = 'waraqa-backup-2';
/** Dossiers dérivés, frères du stockage des originaux (même convention que les services). */
export function derivedDirs(storage: string) {
  return { livrables: resolve(storage, '..', 'livrables'), outbox: resolve(storage, '..', 'drive-outbox') };
}
async function collect(files: Record<string, string>, dir: string, prefix: string, accept: RegExp) {
  let names: string[] = [];
  try { names = (await readdir(dir)).sort(); } catch { return; } // dossier absent : rien à sauvegarder
  for (const name of names) if (accept.test(name)) files[prefix + name] = (await readFile(join(dir, name))).toString('base64');
}

export async function backupData(source: DataSource, storage: string, dirs = derivedDirs(storage)): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'waraqa-backup-'));
  try {
    // SQLite snapshot is atomic. Originals are immutable and never removed online.
    const db = join(dir, 'waraqa.sqlite');
    // Une seule connexion SQLite partagée : si une écriture (import, snapshot…) a une transaction
    // ouverte, VACUUM est refusé. On réessaie jusqu'à ce qu'elle se termine (copie cohérente).
    for (let attempt = 0; ; attempt++) {
      try { await source.query("VACUUM INTO '" + db.replace(/'/g, "''") + "'"); break; }
      catch (e: any) {
        if (!BUSY.test(String(e?.message)) || attempt >= MAX_ATTEMPTS) throw e;
        await rm(db, { force: true });
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    }
    const files: Record<string, string> = { 'waraqa.sqlite': (await readFile(db)).toString('base64') };
    await collect(files, storage, 'files/', /^[a-f0-9-]+\.[a-z0-9]+$/i);
    await collect(files, dirs.livrables, 'livrables/', /^livrable-[a-f0-9-]+$/i);
    await collect(files, dirs.outbox, 'drive-outbox/', /^[a-f0-9]+\.bin$/i);
    const hashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex')]));
    return gzipSync(JSON.stringify({ format: BACKUP_FORMAT, createdAt: new Date().toISOString(), hashes, files }));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
