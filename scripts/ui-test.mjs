import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = await mkdtemp(path.join(tmpdir(), "waraqa-ui-"));
const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: root + "/backend",
  env: {
    ...process.env,
    WARAQA_DB_PATH: tmp + "/db.sqlite",
    WARAQA_FILES_PATH: tmp + "/files",
    WARAQA_PORT: "3138",
    WARAQA_JWT_SECRET: "qa-only",
    ANTHROPIC_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
let logs = "";
child.stderr.on("data", (b) => (logs += b));
const results = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server timeout " + logs)),
      15000,
    );
    child.stdout.on("data", (b) => {
      if (b.toString().includes("Waraqa backend démarré")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.WARAQA_BROWSER_PATH
      ? { executablePath: process.env.WARAQA_BROWSER_PATH }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("http://127.0.0.1:3138");
  await page.getByRole("heading", { name: "Créer votre espace" }).waitFor();
  await page.getByLabel("Nom", { exact: true }).fill("Équipe Démonstration");
  await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("DemoPassword2026!");
  await page.getByRole("button", { name: "Créer et démarrer" }).click();
  await page.getByRole("heading", { name: "Discussion avec Waraqa" }).waitFor();
  await page.screenshot({
    path: root + "/docs/apercu-accueil-chat.png",
    fullPage: true,
  });
  await page.getByLabel("Période", { exact: true }).fill("2026-09");
  await page
    .getByRole("button", { name: "Vue d’ensemble", exact: true })
    .click();
  await page.getByRole("button", { name: "Charger les exemples" }).click();
  await page.getByText("Exemples chargés", { exact: false }).waitFor();
  await page.screenshot({
    path: root + "/docs/apercu-tableau-de-bord.png",
    fullPage: true,
  });
  results.push("Account setup, monthly demo seed and dashboard");
  await page
    .getByRole("button", { name: "Discussion IA", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Contrôle mensuel Audit", exact: false })
    .click();
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await page
    .getByText("Contrôle local du mois 2026-09", { exact: false })
    .waitFor();
  await page.screenshot({
    path: root + "/docs/apercu-chat.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByText("Contrôle local du mois 2026-09", { exact: false })
    .waitFor();
  results.push(
    "Prompt selection, real local chat response and reload persistence",
  );
  await page
    .getByRole("button", { name: "Pièces & relevé TVA", exact: true })
    .click();
  await page.getByRole("button", { name: "Saisie manuelle" }).click();
  await page.getByLabel("N° de facture").fill("UI-TEST-001");
  await page.getByLabel("Fournisseur", { exact: true }).fill("Fournisseur UI");
  await page.getByLabel("ICE fournisseur").fill("000123456000012");
  await page.getByLabel("IF fournisseur").fill("12345678");
  await page.getByLabel("Désignation", { exact: true }).fill("SERVICE");
  await page.getByLabel("Montant TTC (MAD)").fill("120");
  await page.getByRole("button", { name: "Enregistrer la ligne" }).click();
  await page.getByText("UI-TEST-001", { exact: false }).waitFor();
  await page.getByLabel("Sélectionner UI-TEST-001").check();
  await page
    .getByRole("button", { name: "Valider la sélection (1)", exact: true })
    .click();
  await page
    .getByText("Lignes revues et journalisées", { exact: false })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel des lignes revues" }).click();
  const dl = await downloadPromise;
  assert(dl.suggestedFilename().endsWith(".xlsx"));
  results.push("Manual invoice, human review and Excel download");
  await page
    .getByRole("button", { name: "Importer des pièces", exact: true })
    .click();
  await page
    .getByLabel("Choisir des fichiers", { exact: true })
    .setInputFiles({
      name: "ui-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "FACT_NUM;M_TTC;TAUX;LIB_FRSS;ICE_FRS;DATE_FAC\nUI-CSV;240;20;CSV Fournisseur;000123456000001;2026-09-12",
      ),
    });
  await page
    .getByRole("button", { name: "Importer 1 fichier(s)", exact: true })
    .click();
  await page
    .getByText("ui-import.csv · a_verifier", { exact: false })
    .waitFor();
  results.push("Browser file upload to persistent backend");
  for (const name of [
    "Rapprochement",
    "Désignations",
    "Modèles de prompts",
    "Exports & snapshots",
    "Journal d’activité",
    "Réglages",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await page.waitForTimeout(200);
    assert(!(await page.getByRole("alert").count()), name + " displays error");
  }
  results.push("All ten navigation pages render");
  for (const name of [
    "Assistant IA",
    "Préférences",
    "Exports & snapshots",
    "Utilisateurs",
    "Sécurité",
    "Intégrations",
    "Entreprise",
  ]) {
    await page
      .locator(".settings-nav")
      .getByRole("button", { name, exact: true })
      .click();
    await page.waitForTimeout(80);
  }
  await page
    .getByLabel("Raison sociale", { exact: true })
    .fill("Entreprise de démonstration");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Réglages enregistrés", { exact: false }).waitFor();
  await page.reload();
  await page.getByLabel("Raison sociale", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Raison sociale", { exact: true }).inputValue(),
    "Entreprise de démonstration",
  );
  results.push("Settings tabs and persistence");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Discussion IA", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  assert((await page.locator(".sidebar").boundingBox()).x < 0);
  await page.screenshot({
    path: root + "/docs/apercu-mobile.png",
    fullPage: true,
  });
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Pièces & relevé TVA", exact: true })
    .click();
  assert(
    await page
      .getByRole("heading", { name: "Pièces & relevé TVA" })
      .isVisible(),
  );
  results.push(
    "Mobile layout without horizontal overflow and working navigation",
  );
  assert.deepEqual(errors, []);
  results.push("No browser console errors");
  await writeFile(
    root + "/docs/tests-interface.json",
    JSON.stringify({ passed: results.length, checks: results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.error(e);
  if (browser) {
    const pages = browser.contexts()[0]?.pages();
    if (pages?.[0])
      await pages[0].screenshot({ path: "qa-failure.png", fullPage: true });
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  child.kill();
  await new Promise((r) => child.once("exit", r));
  await rm(tmp, { recursive: true, force: true });
}
