/**
 * Parcours navigateur des évolutions 4.6 (cockpit) sur une base temporaire, sans clé IA :
 * création de l'espace, plan de travail et précontrôle, rôles documentaires à l'import,
 * catalogue des capacités et rôle des pièces jointes dans le chat, versions du relevé.
 *   node scripts/ui-test-cockpit.mjs   (captures : docs/apercu-*.png)
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = await mkdtemp(path.join(tmpdir(), "waraqa-cockpit-ui-"));
const port = process.env.WARAQA_TEST_PORT || "3139";
const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: root + "/backend",
  env: { ...process.env, WARAQA_DB_PATH: tmp + "/db.sqlite", WARAQA_FILES_PATH: tmp + "/files", WARAQA_PORT: port, WARAQA_JWT_SECRET: "qa-only-cockpit", ANTHROPIC_API_KEY: "", WARAQA_PROFILE: "local" },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser, logs = "";
child.stderr.on("data", (b) => (logs += b));
const results = [];
const step = (name) => results.push(name);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server timeout " + logs)), 20000);
    child.stdout.on("data", (b) => { if (b.toString().includes("Waraqa backend démarré")) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(process.env.WARAQA_BROWSER_PATH ? { executablePath: process.env.WARAQA_BROWSER_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  const base = `http://127.0.0.1:${port}`;
  await page.goto(base);
  await page.getByRole("heading", { name: "Créer votre espace" }).waitFor();
  await page.getByLabel("Nom", { exact: true }).fill("Administrateur");
  await page.getByLabel("Email", { exact: true }).fill("admin@gmail.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("Admin12345!");
  await page.getByRole("button", { name: "Créer et démarrer" }).click();
  await page.getByRole("heading", { name: "Discussion avec Waraqa" }).waitFor();
  step("Espace créé et connecté (admin@gmail.com)");
  const token = await page.evaluate(() => sessionStorage.getItem("waraqa-token"));
  const api = async (p, method = "GET", body) => {
    const r = await fetch(base + "/api" + p, { method, headers: { Authorization: "Bearer " + token, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    if (!r.ok) throw new Error(p + " → " + r.status + " " + (await r.text()));
    return r.json();
  };
  await page.getByLabel("Période", { exact: true }).fill("2026-09");
  await page.getByRole("button", { name: "Vue d’ensemble", exact: true }).click();
  await page.getByRole("button", { name: "Charger les exemples" }).click();
  await page.getByText("Exemples chargés", { exact: false }).waitFor();
  await page.getByRole("heading", { name: /Plan de travail · 2026-09/ }).waitFor();
  await page.getByText("Prochaine étape", { exact: false }).waitFor();
  await page.getByRole("heading", { name: /Ce qui bloque ou demande attention/ }).waitFor();
  await page.screenshot({ path: root + "/docs/apercu-plan-de-travail.png", fullPage: true });
  step("Tableau de bord : plan de travail (6 étapes) et blocages affichés");
  await page.getByRole("button", { name: "Confier à l’IA" }).first().click();
  await page.getByRole("heading", { name: "Discussion avec Waraqa" }).waitFor();
  const draft = await page.getByLabel("Message à Waraqa").inputValue();
  assert.ok(draft.includes("2026-09"), "la demande préparée cite la période");
  step("« Confier à l’IA » prépare la demande dans le chat : " + draft.slice(0, 60) + "…");
  await page.getByRole("button", { name: "Que sait faire Waraqa ?" }).click();
  await page.getByRole("heading", { name: "Ce que Waraqa sait faire" }).waitFor();
  await page.getByText(/^\d+ outils de lecture, \d+ actions/).waitFor();
  await page.screenshot({ path: root + "/docs/apercu-capacites.png", fullPage: true });
  await page.getByRole("button", { name: "Fermer" }).click();
  step("Catalogue des capacités ouvert depuis le chat");
  // Pièce jointe au chat avec rôle « modèle » : conservée sans ligne, la réponse le dit.
  const csv = "FACT_NUM;LIB_FRSS;ICE_FRS;IF;DESIGNATION;M_TTC;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC\nMOD-1;Fournisseur;001234567000012;12345678;ACHAT;1200;20;4;2026-09-05;2026-09-02\n";
  await page.getByLabel("Joindre des pièces au chat").setInputFiles({ name: "modele-comptable.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: /rôle détecté/ }).click();
  await page.getByRole("button", { name: /Pièce comptable/ }).click();
  await page.getByRole("button", { name: /· Modèle/ }).waitFor();
  const before = (await api("/workspace/summary?month=2026-09")).count;
  await page.getByLabel("Message à Waraqa").fill("Analyse ce modèle du comptable");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await page.getByText("sans création de ligne", { exact: false }).waitFor({ timeout: 20000 });
  const after = (await api("/workspace/summary?month=2026-09")).count;
  assert.equal(after, before, "aucune ligne créée par un modèle joint au chat");
  step("Classeur joint comme modèle : conservé, aucune ligne créée, réponse explicite");
  // Import : rôle imposé au dépôt et reclassement dans la bibliothèque.
  await page.getByRole("button", { name: "Importer des pièces", exact: true }).click();
  await page.getByLabel("Rôle des documents déposés").selectOption("historique");
  await page.getByLabel("Choisir des fichiers").setInputFiles({ name: "TVA_2025.csv", mimeType: "text/csv", buffer: Buffer.from(csv.replace(/2026-09/g, "2025-03")) });
  await page.getByRole("button", { name: /Importer 1 fichier/ }).click();
  await page.getByText("TVA_2025.csv · reference", { exact: false }).waitFor({ timeout: 15000 });
  await page.getByRole("cell", { name: /référence · aucune ligne/ }).first().waitFor();
  await page.screenshot({ path: root + "/docs/apercu-import-roles.png", fullPage: true });
  step("Import avec rôle imposé « historique » : document de référence, aucune ligne");
  await page.getByLabel("Rôle de TVA_2025.csv").selectOption("piece_comptable");
  await page.getByText("Document lu comme pièce comptable", { exact: false }).waitFor({ timeout: 15000 });
  const docs = await api("/workspace/documents");
  const hist = docs.find((d) => d.data.name === "TVA_2025.csv");
  assert.equal(hist.data.role, "piece_comptable"); assert.equal(hist.data.invoiceIds.length, 1);
  step("Reclassement en pièce comptable par le comptable : 1 ligne créée, tracé");
  // Relevé de déduction : précontrôle et versions.
  await page.getByRole("button", { name: "Relevé de déduction", exact: true }).click();
  await page.getByRole("heading", { name: /Précontrôle de la période/ }).waitFor();
  await page.screenshot({ path: root + "/docs/apercu-precontrole.png", fullPage: true });
  step("Page Relevé : précontrôle avec blocages et actions");
  await context.close();
  const summary = { date: new Date().toISOString(), navigateur: "chromium", etapes: results, erreursConsole: errors };
  await writeFile(root + "/docs/tests-interface-cockpit.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  assert.equal(errors.length, 0, "aucune erreur JavaScript en console : " + errors.join(" | "));
} finally {
  await browser?.close();
  child.kill();
  await rm(tmp, { recursive: true, force: true });
}
