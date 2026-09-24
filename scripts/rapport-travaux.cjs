/* Génère docs/RAPPORT-TRAVAUX-WARAQA-4.7.pdf à partir du Markdown du même nom, avec le générateur de rapports de l'application. */
const path = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const root = path.resolve(__dirname, "..");
const { markdownPdf } = require(path.join(root, "backend/dist/unified/report-pdf.js"));
const md = readFileSync(path.join(root, "docs/RAPPORT-TRAVAUX-WARAQA-4.7.md"), "utf8");
markdownPdf({
  title: "Waraqa 4.7 — rapport des travaux",
  markdown: md,
  createdAt: new Date().toISOString(),
  author: "Claude Code (session de développement)",
  month: "2026-09",
  company: { name: "Finder Electronic Morocco" },
  statut: "final",
  sources: ["01_CHECKPOINTS_DEVELOPPEMENT.md", "docs/ANALYSE-DES-MANQUES-4.7.md", "docs/checkpoints/CP*.log", "git log claude/charming-knuth-gum8u3"],
  note: "Chaque affirmation de ce rapport renvoie à un test, un log ou un commit de la branche ; les points non réalisés sont listés comme tels.",
}).then((buffer) => {
  const out = path.join(root, "docs/RAPPORT-TRAVAUX-WARAQA-4.7.pdf");
  writeFileSync(out, buffer);
  console.log(out, buffer.length, "octets");
});
