const { spawn, spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
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
    "Première ouverture : installation des dépendances (Internet nécessaire).",
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

// ── backend/.env : création au premier démarrage, puis complément des nouvelles lignes ──
const envPath = path.join(backend, ".env");
const example = readFileSync(path.join(backend, ".env.example"), "utf8");
if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    example.replace("GENERATED_AT_FIRST_START", randomBytes(48).toString("hex")),
    { mode: 0o600, flag: "wx" },
  );
} else {
  // Mise à jour : ajoute uniquement les variables absentes, sans toucher aux valeurs existantes
  // (clé API, secret de session, identifiants Google restent tels quels).
  const current = readFileSync(envPath, "utf8");
  const has = (name) => new RegExp(`^${name}=`, "m").test(current);
  const missing = example
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l) && !has(l.split("=")[0]))
    .filter((l) => !l.startsWith("WARAQA_JWT_SECRET="));
  if (missing.length) {
    appendFileSync(
      envPath,
      (current.endsWith("\n") ? "" : "\n") +
        "\n# Ajouté automatiquement par la mise à jour Waraqa 4.5\n" +
        missing.join("\n") +
        "\n",
    );
    console.log(`Configuration complétée : ${missing.map((l) => l.split("=")[0]).join(", ")}.`);
  }
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

if (
  !existsSync(path.join(backend, "dist", "main.js")) ||
  !existsSync(path.join(backend, "public", "index.html"))
) {
  console.error(
    "Build absent. Exécutez npm run setup pour compiler les sources.",
  );
  process.exit(1);
}

const port = env.WARAQA_PORT || "3000";
const url = `http://localhost:${port}`;
const online = (env.WARAQA_PROFILE || "online").toLowerCase() !== "local";
const key = env.ANTHROPIC_API_KEY || "";

async function reachable(target) {
  try {
    await fetch(target, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

function openBrowser() {
  if (env.WARAQA_OPEN_BROWSER === "0") return;
  const cmd =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* pas de navigateur graphique : l'adresse reste affichée */
  }
}

async function waitAndOpen() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/workspace/status`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        openBrowser();
        return;
      }
    } catch {
      /* serveur pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

(async () => {
  const [anthropic, google] = await Promise.all([
    reachable("https://api.anthropic.com"),
    reachable("https://www.googleapis.com"),
  ]);
  const line = (label, value) => console.log(`  ${label.padEnd(16)} ${value}`);
  console.log(`\nWaraqa 4.5 — ${online ? "profil EN LIGNE (application locale, services en ligne)" : "profil local"}`);
  line("Adresse", url);
  line("Internet", anthropic && google ? "OK" : "indisponible — l’application fonctionne, IA et Drive reprendront au retour du réseau");
  line(
    "IA Claude",
    key
      ? `${online ? "connectée en permanence" : "clé présente"} (sk-ant-…${key.slice(-4)})`
      : "aucune clé — Réglages → Assistant IA → coller la clé (activation immédiate)",
  );
  line(
    "Google Drive",
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? `identifiants OAuth présents — compte ${env.GOOGLE_ALLOWED_EMAIL || "au choix"} (état dans Réglages → Intégrations)`
      : "à configurer — Réglages → Intégrations (voir docs/GOOGLE-DRIVE.md)",
  );
  if (online && !(key && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
    console.log("\n  MISE EN SERVICE À TERMINER — sans clé Anthropic, l’assistant ne répond pas (aucune réponse préenregistrée).");
    console.log("  Ouvrez Waraqa en administrateur : le bandeau « Mise en service » guide chaque étape.");
  }
  console.log("\nLaissez cette fenêtre ouverte. Ctrl+C pour arrêter.\n");

  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: backend,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code || 0));
  waitAndOpen();
})();
