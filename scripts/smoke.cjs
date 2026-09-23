/* End-to-end regression test. Uses an isolated temporary database and no API key. */
const { spawn } = require("node:child_process");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const XLSX = require("../backend/node_modules/xlsx");
(async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "waraqa-test-"));
  let child;
  let jwt = "";
  const results = [];
  const root = path.resolve(__dirname, "..");
  const port = 3137;
  const base = `http://127.0.0.1:${port}`;
  async function boot() {
    child = spawn(process.execPath, ["dist/main.js"], {
      cwd: path.join(root, "backend"),
      env: {
        ...process.env,
        NODE_ENV: "production",
        ANTHROPIC_API_KEY: "",
        WARAQA_JWT_SECRET: "ephemeral-integration-test-secret",
        WARAQA_DB_PATH: path.join(tmp, "test.sqlite"),
        WARAQA_FILES_PATH: path.join(tmp, "files"),
        WARAQA_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr.on("data", (b) => (logs += b));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Startup timeout " + logs)),
        20000,
      );
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Server exited " + code + " " + logs));
      });
      child.stdout.on("data", (b) => {
        logs += b;
        if (logs.includes("Waraqa backend démarré")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  async function stop() {
    if (child && !child.killed) {
      const done = new Promise((r) => child.once("exit", r));
      child.kill();
      await done;
    }
  }
  async function request(p, method = "GET", body, expected = 200, auth = jwt) {
    const r = await fetch(base + "/api" + p, {
      method,
      headers: {
        Authorization: "Bearer " + auth,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    const text = await r.text();
    assert.equal(r.status, expected, `${method} ${p}: ${r.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }
  function check(label) {
    results.push(label);
    console.log("PASS " + label);
  }
  try {
    await boot();
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + "/api/not-existing")).status, 404);
    check("SPA served; missing API routes return 404");
    await request("/factures", "GET", undefined, 401, "");
    const registered = await request(
      "/auth/inscription",
      "POST",
      {
        nom: "Compte de test",
        email: "admin@example.test",
        motDePasse: "TestPassword2026!",
      },
      201,
    );
    jwt = registered.accessToken;
    assert.equal(registered.utilisateur.role, "admin");
    await request(
      "/auth/inscription",
      "POST",
      {
        nom: "Intrus",
        email: "other@example.test",
        motDePasse: "TestPassword2026!",
      },
      403,
    );
    check("First-run setup, JWT authentication and closed registration");
    const settings = await request("/workspace/settings");
    assert.equal(settings.ai.keyConfigured, false);
    assert(!JSON.stringify(settings).includes("ANTHROPIC_API_KEY"));
    await request("/workspace/settings", "PUT", { ai: { mode: "live" } }, 400);
    check("No key exposure; live mode cannot activate without key");
    await request("/workspace/seed", "POST", { month: "2026-09" }, 201);
    const seeded = await request(
      "/workspace/seed",
      "POST",
      { month: "2026-09" },
      201,
    );
    assert.equal(seeded.created, 0);
    let rows = await request("/factures");
    assert.equal(rows.length, 6);
    assert(rows.every((r) => r.demonstration));
    check("Demo samples explicit and idempotent");
    const complete = rows.find((r) => r.factNum === "DEMO-ACH-001");
    const incomplete = rows.find((r) => r.factNum === "DEMO-INC-003");
    await request(`/factures/${incomplete.id}/valider`, "POST", {}, 400);
    await request(`/factures/${complete.id}/valider`, "POST", {}, 201);
    assert((await request(`/factures/${complete.id}`)).revueHumaine);
    await request(`/factures/${complete.id}`, "PUT", { mTtc: 12000.01 });
    assert.equal(
      (await request(`/factures/${complete.id}`)).revueHumaine,
      false,
    );
    await request(`/factures/${complete.id}`, "PUT", { mTtc: 12000 });
    check("Review rejects incomplete entries and is reset on edit");
    const manual = {
      factNum: "ACTUAL-001",
      libFrss: "Supplier Test",
      iceFrs: "000123456000001",
      iff: "00123456",
      designation: "SERVICE",
      mTtc: 99.99,
      taux: 0.14,
      dateFac: "2026-08-31",
      datePaie: "2026-09-02",
      sousType: "facture_fournisseur",
    };
    const f = await request("/factures", "POST", manual, 201);
    assert.equal(Math.round((f.mHt + f.tva) * 100), 9999);
    assert(
      (await request("/factures?mois=2026-09")).some((x) => x.id === f.id),
    );
    assert(
      !(await request("/factures?mois=2026-08")).some((x) => x.id === f.id),
    );
    check("Balanced rounding and payment-month filtering");
    await request("/factures", "POST", { ...manual, mHt: 15 }, 400);
    await request(
      "/factures",
      "POST",
      { ...manual, dateFac: "22/09/2026" },
      400,
    );
    const dup = await request("/factures", "POST", manual, 201);
    assert.equal(dup.doublonDe, f.id);
    await request(`/factures/${dup.id}/valider`, "POST", {}, 400);
    await request(`/workspace/invoices/${dup.id}/archive`, "POST", {}, 201);
    check(
      "Server-derived amounts, date validation and blocked duplicate review",
    );
    const csv =
      "FACT_NUM;DESIGNATION;M_TTC;IF;LIB_FRSS;ICE_FRS;TAUX;ID_PAIE;DATE_PAIE;DATE_FAC\nCSV-001;SERVICE;1200;00123456;CSV fournisseur;000000000000001;20;4;2026-09-10;2026-09-08\nCSV-BAD;SERVICE;not-a-number;00123456;Erreur;000000000000002;20;4;2026-09-10;2026-09-08";
    const data = new FormData();
    data.append("file", new Blob([csv]), "factures.csv");
    const doc = await request("/workspace/documents", "POST", data, 201);
    assert.equal(doc.data.invoiceIds.length, 1);
    assert.equal(doc.data.status, "partiel");
    const csvrow = await request("/factures/" + doc.data.invoiceIds[0]);
    assert.equal(csvrow.iceFrs, "000000000000001");
    assert.equal(csvrow.mHt, 1000);
    await request("/workspace/documents", "POST", data, 409);
    check(
      "Real CSV parsing, leading zeros, partial-lot errors and content duplicate blocking",
    );
    const pdfData = new FormData();
    pdfData.append(
      "file",
      new Blob(["%PDF-1.4\n test document"]),
      "scan-test.pdf",
    );
    const scan = await request("/workspace/documents", "POST", pdfData, 201);
    assert.equal(scan.data.status, "a_saisir");
    assert.equal(scan.data.invoiceIds.length, 0);
    const file = await fetch(
      base + `/api/workspace/documents/${scan.id}/file`,
      { headers: { Authorization: "Bearer " + jwt } },
    );
    assert.equal(await file.text(), "%PDF-1.4\n test document");
    await request(
      "/workspace/invoices/" + f.id + "/document",
      "POST",
      { documentId: scan.id },
      201,
    );
    assert(
      (await request("/workspace/documents"))
        .find((d) => d.id === scan.id)
        .data.invoiceIds.includes(f.id),
    );
    check(
      "Scans stored without fabricated extraction and linked to manual entries",
    );
    const candidates = await request("/workspace/reconciliation?month=2026-09");
    assert(candidates[0].candidates.some((c) => c.id === complete.id));
    await request(
      "/workspace/reconciliation",
      "POST",
      { paymentId: candidates[0].payment.id, invoiceId: complete.id },
      201,
    );
    assert.equal(
      (await request("/workspace/reconciliation?month=2026-09")).length,
      0,
    );
    const summary = await request("/workspace/summary?month=2026-09");
    assert.equal(summary.bank, 1);
    check(
      "Human-confirmed reconciliation and bank exclusion from purchase totals",
    );
    await request("/factures/" + f.id + "/valider", "POST", {}, 201);
    const xlsx = await fetch(
      base + "/api/workspace/export?month=2026-09&format=xlsx&scope=reviewed",
      { headers: { Authorization: "Bearer " + jwt } },
    );
    assert.equal(xlsx.status, 200);
    const wb = XLSX.read(Buffer.from(await xlsx.arrayBuffer()), {
      type: "buffer",
    });
    const exported = XLSX.utils.sheet_to_json(wb.Sheets.EDI);
    assert.equal(exported.length, 1);
    assert.equal(exported[0].ICE_FRS, "000123456000001");
    const sage = await fetch(
      base + "/api/workspace/export?month=2026-09&format=sage&scope=reviewed",
      { headers: { Authorization: "Bearer " + jwt } },
    );
    const swb = XLSX.read(await sage.text(), { type: "string" });
    const writes = XLSX.utils.sheet_to_json(swb.Sheets[swb.SheetNames[0]]);
    assert.equal(writes.length, 3);
    assert.equal(
      Math.round(
        writes.reduce((s, r) => s + Number(r.Debit) - Number(r.Credit), 0) *
          100,
      ),
      0,
    );
    check("Real Excel and balanced Sage CSV exports, reviewed-only selection");
    const snapshot = await request(
      "/workspace/snapshots",
      "POST",
      { month: "2026-09" },
      201,
    );
    const old = snapshot.data.summary.totalTtc;
    await request("/factures/" + f.id, "PUT", { mTtc: 101 });
    assert.equal(
      (await request("/workspace/snapshots")).find((s) => s.id === snapshot.id)
        .data.summary.totalTtc,
      old,
    );
    check("Immutable snapshot despite later edits");
    const tpl = await request(
      "/workspace/templates",
      "POST",
      { title: "Test template", category: "Test", prompt: "Analyse {{mois}}" },
      201,
    );
    await request("/workspace/templates/" + tpl.id, "PUT", {
      title: "Modified",
      category: "Test",
      prompt: "Audit {{mois}}",
    });
    assert(
      (await request("/workspace/templates")).some(
        (t) => t.data.title === "Modified",
      ),
    );
    await request("/workspace/templates/" + tpl.id, "DELETE");
    check("Prompt templates create/edit/delete");
    const conv = await request(
      "/workspace/conversations",
      "POST",
      { month: "2026-09" },
      201,
    );
    const reply = await request(
      "/workspace/conversations/" + conv.id + "/messages",
      "POST",
      { text: "Montre les anomalies", documentIds: [scan.id] },
      201,
    );
    assert.equal(reply.data.messages.length, 2);
    assert.equal(reply.data.messages[1].mode, "demo");
    assert.equal(reply.data.messages[1].result.type, "table");
    await request("/workspace/conversations/" + conv.id, "PATCH", {
      title: "My test conversation",
    });
    check(
      "Persistent contextual chat with structured local replies and attachments",
    );
    const member = await request(
      "/workspace/users",
      "POST",
      {
        nom: "Comptable Test",
        email: "member@example.test",
        motDePasse: "MemberPassword2026!",
        role: "comptable",
      },
      201,
    );
    const login = await request("/auth/connexion", "POST", {
      email: "member@example.test",
      motDePasse: "MemberPassword2026!",
    });
    await request(
      "/workspace/settings",
      "PUT",
      { company: { name: "Denied" } },
      403,
      login.accessToken,
    );
    await request(
      "/workspace/conversations/" + conv.id,
      "GET",
      undefined,
      404,
      login.accessToken,
    );
    await request("/workspace/users/" + member.id, "DELETE");
    await request("/factures", "GET", undefined, 401, login.accessToken);
    check("Admin permissions, chat privacy and revoked deleted-user access");
    await request("/workspace/settings", "PUT", {
      company: { name: "Persisted company" },
      preferences: { density: "compact" },
    });
    await stop();
    await boot();
    assert.equal(
      (await request("/workspace/settings")).company.name,
      "Persisted company",
    );
    assert.equal(
      (await request("/workspace/conversations/" + conv.id)).data.messages
        .length,
      2,
    );
    assert(
      (await request("/workspace/documents")).some((d) => d.id === scan.id),
    );
    check("Restart persistence for settings, invoices, documents and chat");
    await request(
      "/workspace/password",
      "POST",
      { current: "TestPassword2026!", next: "ChangedPassword2026!" },
      201,
    );
    await request("/factures", "GET", undefined, 401);
    check("Password change revokes existing sessions");
    console.log(
      JSON.stringify({ passed: results.length, checks: results }, null, 2),
    );
    if (process.env.WARAQA_TEST_REPORT)
      await writeFile(
        process.env.WARAQA_TEST_REPORT,
        JSON.stringify({ passed: results.length, checks: results }, null, 2),
      );
  } finally {
    await stop();
    await rm(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
