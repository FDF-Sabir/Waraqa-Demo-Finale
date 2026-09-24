// Restore into a NEW directory only. The original data and running server are untouched.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const sqlite = require('../backend/node_modules/sqlite3');
async function restore(archive, destination) {
  const data = JSON.parse(gunzipSync(await fs.readFile(archive), { maxOutputLength: 512 * 1024 * 1024 }));
  if (!['waraqa-backup-1', 'waraqa-backup-2'].includes(data.format) || !data.files?.['waraqa.sqlite']) throw Error('Format de sauvegarde invalide.');
  const entries = Object.entries(data.files);
  for (const [name, content] of entries) {
    if (!/^(waraqa\.sqlite|files\/[a-f0-9-]+\.[a-z0-9]+|livrables\/livrable-[a-f0-9-]+|drive-outbox\/[a-f0-9]+\.bin)$/i.test(name)) throw Error('Chemin de sauvegarde invalide.');
    if (createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex') !== data.hashes[name]) throw Error('Empreinte invalide : ' + name);
  }
  // mkdir without recursive deliberately rejects existing destinations.
  await fs.mkdir(destination, { mode: 0o700 });
  try {
    for (const sub of ['files', 'livrables', 'drive-outbox']) await fs.mkdir(path.join(destination, sub));
    for (const [name, content] of entries) await fs.writeFile(path.join(destination, name), Buffer.from(content, 'base64'), { mode: 0o600, flag: 'wx' });
    const db = new sqlite.Database(path.join(destination, 'waraqa.sqlite'));
    const query = sql => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
    try {
      const check = await query('PRAGMA integrity_check');
      if (check[0].integrity_check !== 'ok') throw Error('SQLite integrity_check a échoué.');
      const docs = await query("SELECT id, data FROM workspace_records WHERE kind='document'");
      for (const doc of docs) {
        const d = JSON.parse(doc.data), name = 'files/' + doc.id + d.ext;
        if (!data.files[name] || createHash('sha256').update(Buffer.from(data.files[name], 'base64')).digest('hex') !== d.hash) throw Error('Original absent ou altéré : ' + doc.id);
      }
      // Fichiers livrés par l'agent : chacun doit être présent (format 2) ; une sauvegarde
      // ancienne (format 1) ne les contenait pas — ils sont alors listés comme manquants.
      const livrables = await query("SELECT id FROM workspace_records WHERE kind='livrable'");
      var livrablesManquants = livrables.map(r => r.id).filter(id => !data.files['livrables/' + id]);
      if (data.format === 'waraqa-backup-2' && livrablesManquants.length) throw Error('Fichier livré absent de la sauvegarde : ' + livrablesManquants[0]);
      // Existing JWTs cannot be used against the restored copy, even with the same server secret.
      await query('UPDATE utilisateurs SET sessionVersion = sessionVersion + 1');
    } finally { await new Promise(resolve => db.close(resolve)); }
  } catch (e) { await fs.rm(destination, { recursive: true, force: true }); throw e; }
  const count = prefix => entries.filter(([n]) => n.startsWith(prefix)).length;
  return { integrity: 'ok', format: data.format, files: entries.length, originaux: count('files/'), livrables: count('livrables/'), boiteEnvoi: count('drive-outbox/'), livrablesManquants, destination };
}
module.exports = { restore };
if (require.main === module) {
  const [archive, destination] = process.argv.slice(2);
  if (!archive || !destination) { console.error('Usage : node scripts/restore.cjs sauvegarde.waraqa.gz NOUVEAU_DOSSIER'); process.exit(1); }
  restore(archive, path.resolve(destination)).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
