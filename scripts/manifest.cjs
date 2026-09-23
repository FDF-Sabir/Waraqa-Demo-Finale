/*
 * Manifeste d'intégrité de la livraison : empreinte SHA-256 de chaque fichier versionné, plus le
 * backend compilé (backend/dist, non versionné mais livré dans le ZIP).
 * Exclus : le manifeste lui-même, node_modules, données, secrets.
 *
 *   npm run manifest      (à lancer après le dernier `npm run build`)
 */
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync, statSync, writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const OUT = "manifest-sha256.json";
const excluded = (f) => f === OUT || /(^|\/)(node_modules|data)\//.test(f) || /(^|\/)\.env$/.test(f) || /\.(sqlite|tsbuildinfo)$/.test(f);

function walk(dir) {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = dir + "/" + name;
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
if (!existsSync(path.join(root, "backend/dist/main.js"))) {
  console.error("backend/dist absent : lancez npm run build avant le manifeste.");
  process.exit(1);
}
const files = [...new Set([...tracked, ...walk("backend/dist")])].filter((f) => existsSync(path.join(root, f)) && !excluded(f)).sort();
const manifest = Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(path.join(root, f))).digest("hex")]));
writeFileSync(path.join(root, OUT), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${OUT} : ${files.length} fichiers.`);
