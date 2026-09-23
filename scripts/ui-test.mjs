import { chromium, firefox, webkit } from "playwright";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
    // Parcours navigateur du mode démo (sans clé) : profil local explicite.
    WARAQA_PROFILE: "local",
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
  browser = await ({chromium,firefox,webkit}[process.env.WARAQA_BROWSER || "chromium"]).launch({
    headless: true,
    ...(process.env.WARAQA_BROWSER_PATH
      ? { executablePath: process.env.WARAQA_BROWSER_PATH }
      : {}),
    args: (!process.env.WARAQA_BROWSER || process.env.WARAQA_BROWSER === 'chromium') ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
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
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', {name:'PDF des lignes revues',exact:true}).click();
  const pdf = await pdfDownload;
  assert(pdf.suggestedFilename().endsWith('.pdf'));
  assert.equal((await readFile(await pdf.path())).subarray(0,5).toString(), '%PDF-');
  results.push('Reviewed ledger PDF download');
  await page.locator('.sidebar').getByRole('button',{name:'Exports & snapshots',exact:true}).click();
  await page.getByRole('button',{name:'Créer un snapshot',exact:true}).click();
  const snapshotDownload = page.waitForEvent('download');
  await page.locator('.u-task').getByRole('button',{name:'Télécharger le PDF',exact:true}).first().click();
  const snapshotPdf = await snapshotDownload;
  assert(snapshotPdf.suggestedFilename().startsWith('Waraqa-snapshot-'));
  assert.equal((await readFile(await snapshotPdf.path())).subarray(0,5).toString(), '%PDF-');
  const archiveDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'Sauvegarder les archives en PDF',exact:true}).click();
  const archivePdf = await archiveDownload;
  assert.equal(archivePdf.suggestedFilename(),'Waraqa-archives.pdf');
  assert.equal((await readFile(await archivePdf.path())).subarray(0,5).toString(), '%PDF-');
  await page.screenshot({path:root+'/docs/apercu-exports.png',fullPage:true});
  results.push('Snapshot and archive PDF downloads');
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
    .getByText("ui-import.csv · apercu", { exact: false })
    .waitFor();
  await page.getByRole('button',{name:'Vérifier l’aperçu'}).click();
  await page.getByRole('button',{name:'Confirmer l’import des lignes acceptées'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  results.push("Browser file upload, preview and explicit import confirmation");
  // Dossier ZIP → lot suivi → relevé de déduction → XML SIMPL.
  const { zipSync, strToU8 } = createRequire(root + "/backend/package.json")("fflate");
  const zipCsv = "FACT_NUM,DESIGNATION,LIB_FRSS,ICE_FRS,IF,M_TTC,TAUX,ID_PAIE,DATE_PAIE,DATE_FAC\nZIP-1,ACHAT,Fournisseur Zip,001111111000011,11111111,1200,20%,4,15/09/2026,10/09/2026\nZIP-2,SERVICE,Prestataire Zip,002222222000022,22222222,1100,10%,2,18/09/2026,16/09/2026\n";
  await page.getByLabel("Choisir des fichiers", { exact: true }).setInputFiles({ name: "dossier-septembre.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync({ "Septembre/achats.csv": strToU8(zipCsv), "Septembre/note.txt": strToU8("ignoré") })) });
  await page.getByRole("button", { name: "Importer 1 fichier(s)", exact: true }).click();
  await page.getByText("dossier-septembre.zip · lot lancé · 1 pièce(s)", { exact: false }).waitFor();
  await page.locator(".u-lot summary", { hasText: "terminé" }).waitFor();
  await page.evaluate(async () => {
    await fetch("/api/workspace/settings", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionStorage.getItem("waraqa-token") }, body: JSON.stringify({ company: { iff: "18742558", regime: 1 } }) });
  });
  await page.locator(".sidebar").getByRole("button", { name: "Relevé de déduction", exact: true }).click();
  await page.getByRole("button", { name: /^Valider \d+ ligne\(s\) conforme\(s\)$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Valider \d+ ligne\(s\)$/ }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator(".u-table td b", { hasText: "ZIP-2" }).waitFor();
  const xmlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "XML EDI (SIMPL)", exact: true }).click();
  const xmlFile = await xmlDownload;
  assert.equal(xmlFile.suggestedFilename(), "Releve-deduction-2026-09.xml");
  const xmlText = await readFile(await xmlFile.path(), "utf8");
  assert(xmlText.includes("<identifiantFiscal>18742558</identifiantFiscal>") && xmlText.includes("<num>ZIP-2</num>"), "XML du relevé incomplet");
  await page.screenshot({ path: root + "/docs/apercu-releve-deduction.png", fullPage: true });
  results.push("ZIP folder import, deduction statement review and SIMPL XML download");
  // Pièce jointe dans la discussion : le fichier choisi est bien envoyé.
  await page.locator(".sidebar").getByRole("button", { name: "Discussion IA", exact: true }).click();
  await page.getByLabel("Joindre des pièces au chat").setInputFiles({ name: "piece-chat.csv", mimeType: "text/csv", buffer: Buffer.from("FACT_NUM,LIB_FRSS,M_TTC,TAUX,DATE_FAC\nCHAT-1,Chat Fournisseur,240,20%,12/09/2026\n") });
  await page.getByText("piece-chat.csv", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await page.getByText("1 pièce(s) jointe(s) conservée(s)", { exact: false }).waitFor();
  results.push("Chat attachment is uploaded and linked to the answer");
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
  const matrix=[];
  for(const width of [320,375,390,768,1024,1440,1920]) {
    for(const [orientation,height] of [['portrait',1000],['paysage',480]]) {
      await page.setViewportSize({width,height});
      for(const route of ['chat','dashboard','releve','declaration','import','banque','designations','templates','exports','journal','reglages']) {
        await page.evaluate(route=>{location.hash='#/'+route;},route);
        await page.waitForTimeout(80);
        const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert(d.scroll<=d.width+1,`${route} ${width} ${orientation}: ${JSON.stringify(d)}`);
      }
      matrix.push({width,height,orientation,pages:11,status:'passed',kind:'émulation viewport'});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{document.body.style.zoom='2';location.hash='#/chat';});
  await page.waitForTimeout(100);
  const zoom=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(zoom.scroll<=zoom.width+1,'zoom 200% CSS '+JSON.stringify(zoom));
  await page.evaluate(()=>{document.body.style.zoom='';});
  results.push('14 viewport/orientation combinations × 11 pages; CSS zoom 200%');
  await writeFile(root+'/docs/appareils-'+(process.env.WARAQA_BROWSER || 'chromium')+'.json',JSON.stringify({date:new Date().toISOString(),browser:process.env.WARAQA_BROWSER || 'chromium',version:browser.version(),matrix,zoom:'CSS 200%, pas un appareil réel'},null,2));
  assert.deepEqual(errors, []);
  results.push("No browser console errors");
  await writeFile(
    root + "/docs/tests-interface-"+(process.env.WARAQA_BROWSER || "chromium")+".json",
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
