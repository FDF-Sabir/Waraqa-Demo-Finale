import { DataSource } from 'typeorm';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';

export async function backupData(source: DataSource, storage: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'waraqa-backup-'));
  try {
    // SQLite snapshot is atomic. Originals are immutable and never removed online.
    const db = join(dir, 'waraqa.sqlite');
    await source.query("VACUUM INTO '" + db.replace(/'/g, "''") + "'");
    const files: Record<string, string> = { 'waraqa.sqlite': (await readFile(db)).toString('base64') };
    for (const name of (await readdir(storage)).sort()) {
      if (/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) files['files/' + name] = (await readFile(join(storage, name))).toString('base64');
    }
    const hashes = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex')]));
    return gzipSync(JSON.stringify({ format: 'waraqa-backup-1', createdAt: new Date().toISOString(), hashes, files }));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
