import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { backupData } from './backup';

describe('Sauvegarde', () => {
  it('attend la fin d’une transaction en cours au lieu d’échouer (VACUUM refusé)', async () => {
    const storage = await mkdtemp(join(tmpdir(), 'waraqa-bk-'));
    await writeFile(join(storage, '0a1b2c3d-0000-4000-8000-000000000001.pdf'), '%PDF-1.4');
    let calls = 0;
    const source = {
      query: jest.fn(async (sql: string) => {
        calls++;
        if (calls <= 3) throw new Error('SQLITE_ERROR: cannot VACUUM from within a transaction');
        await writeFile(/VACUUM INTO '(.*)'/.exec(sql)![1], 'SQLite format 3');
      }),
    };
    const archive = JSON.parse(gunzipSync(await backupData(source as any, storage)).toString());
    expect(calls).toBe(4);
    expect(Object.keys(archive.files).sort()).toEqual(['files/0a1b2c3d-0000-4000-8000-000000000001.pdf', 'waraqa.sqlite']);
    await rm(storage, { recursive: true, force: true });
  });

  it('une autre erreur SQLite n’est pas masquée', async () => {
    const storage = await mkdtemp(join(tmpdir(), 'waraqa-bk-'));
    const source = { query: jest.fn(async () => { throw new Error('SQLITE_CORRUPT: database disk image is malformed'); }) };
    await expect(backupData(source as any, storage)).rejects.toThrow('malformed');
    expect(source.query).toHaveBeenCalledTimes(1);
    await rm(storage, { recursive: true, force: true });
  });
});
