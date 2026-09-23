const { spawn, spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Waraqa nécessite Node.js 22 ou 24.");
  process.exit(1);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (!existsSync(path.join(backend, "node_modules", "@nestjs", "core"))) {
  console.log(
    "Première ouverture : installation des dépendances (Internet nécessaire, aucune clé IA).",
  );
  const install = spawnSync(
    npm,
    ["ci", "--omit=dev", "--no-audit", "--no-fund"],
    { cwd: backend, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (install.status !== 0) {
    console.error(
      "Installation interrompue. Vérifiez votre connexion et consultez LISEZ-MOI.md.",
    );
    process.exit(install.status || 1);
  }
}
mkdirSync(path.join(backend, "data", "files"), { recursive: true });
const envPath = path.join(backend, ".env");
if (!existsSync(envPath)) {
  let env = readFileSync(path.join(backend, ".env.example"), "utf8");
  env = env.replace(
    "GENERATED_AT_FIRST_START",
    randomBytes(48).toString("hex"),
  );
  writeFileSync(envPath, env, { mode: 0o600, flag: "wx" });
}
if (
  !existsSync(path.join(backend, "dist", "main.js")) ||
  !existsSync(path.join(backend, "public", "index.html"))
) {
  console.error(
    "Build absent. Exécutez npm run setup pour compiler les sources.",
  );
  process.exit(1);
}
console.log(
  "\nWaraqa — Démo finale unifiée\nOuvrez http://localhost:3000 dans votre navigateur.\nLaissez cette fenêtre ouverte. Ctrl+C pour arrêter.\n",
);
const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: backend,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code || 0));
