/*
 * Construit le modèle vierge du « Relevé de déduction » (DGI, modèle ADC082F-15I, art. 112 CGI)
 * à partir d'un relevé Excel rempli : mise en page, logos, tableau Tableau5 et mappage XML
 * DeclarationReleveDeduction conservés ; données du dossier source, macros, liens, mises en forme
 * conditionnelles et paramètres d'imprimante retirés.
 *
 *   node scripts/build-releve-template.cjs "TVA 07 2026.xlsx"
 *
 * Sortie : backend/src/assets/releve-deduction-modele.xlsx (jetons __…__ remplis à l'export).
 */
const path = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const { unzipSync, zipSync, strFromU8, strToU8 } = require(path.join(__dirname, "..", "backend", "node_modules", "fflate"));

const source = process.argv[2];
if (!source) {
  console.error("Usage : node scripts/build-releve-template.cjs <relevé.xlsx>");
  process.exit(1);
}
const files = unzipSync(readFileSync(source));
const text = (name) => strFromU8(files[name]);
const put = (name, value) => (files[name] = strToU8(value));
const drop = (name) => delete files[name];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Chaînes partagées → cellules en ligne (le modèle n'embarque aucune chaîne du dossier source).
const strings = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
);
const inline = (row) =>
  row.replace(/<c r="([A-Z]+\d+)"([^>]*?) t="s"([^>]*)><v>(\d+)<\/v><\/c>/g, (_m, ref, a, b, i) =>
    `<c r="${ref}"${a}${b} t="inlineStr"><is><t>${strings[Number(i)]}</t></is></c>`,
  );

let sheet = text("xl/worksheets/sheet1.xml");
const rows = [...sheet.matchAll(/<row [^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => m[0]);
const head = rows.filter((r) => Number(/ r="(\d+)"/.exec(r)[1]) <= 8).map(inline);
// Zone d'en-tête : valeurs remplacées à l'export.
const cell = (ref, style, token) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${token}</t></is></c>`;
head[1] = head[1].replace(/<c r="C2"[\s\S]*?<\/c>/, cell("C2", 12, "__RAISON__"));
head[2] = head[2].replace(/<c r="C3"[\s\S]*?<\/c>/, '<c r="C3" s="12"><v>__IF__</v></c>');
head[3] = head[3].replace(/<c r="C4"[\s\S]*?<\/c>/, '<c r="C4" s="12"><v>__ANNEE__</v></c>');
head[4] = head[4].replace(/<c r="C5"[\s\S]*?<\/c>/, '<c r="C5" s="12"><v>__PERIODE__</v></c>');
head[5] = head[5].replace(/<c r="C6"[\s\S]*?<\/c>/, '<c r="C6" s="12"><v>__REGIME__</v></c>');
const start = sheet.indexOf("<sheetData>"), end = sheet.indexOf("</sheetData>") + "</sheetData>".length;
sheet = sheet.slice(0, start) + "<sheetData>" + head.join("") + "__LIGNES__</sheetData>" + sheet.slice(end);
sheet = sheet
  .replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="__DIMENSION__"/>')
  .replace(/<selection [^>]*\/>/, '<selection pane="bottomLeft" activeCell="A9" sqref="A9"/>')
  .replace(/<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/g, "")
  .replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, "")
  .replace(/(<pageSetup [^>]*?) r:id="[^"]*"/, "$1");
put("xl/worksheets/sheet1.xml", sheet);
put(
  "xl/worksheets/_rels/sheet1.xml.rels",
  text("xl/worksheets/_rels/sheet1.xml.rels").replace(/<Relationship [^>]*(hyperlink|printerSettings)[^>]*\/>/g, ""),
);
drop("xl/printerSettings/printerSettings1.bin");

// Tableau5 : plage et filtre recalculés à l'export ; ancien tri retiré.
put(
  "xl/tables/table1.xml",
  text("xl/tables/table1.xml")
    .replace(/ ref="A8:M\d+"/, ' ref="A8:M__FIN_TABLE__"')
    .replace(/<autoFilter ref="[^"]*"/, '<autoFilter ref="A8:M__FIN_DONNEES__"')
    .replace(/<sortState[\s\S]*?<\/sortState>/, ""),
);

// Classeur sans macros ni chaîne de calcul : recalcul complet à l'ouverture.
drop("xl/vbaProject.bin");
drop("xl/calcChain.xml");
put("xl/sharedStrings.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');
put(
  "xl/_rels/workbook.xml.rels",
  text("xl/_rels/workbook.xml.rels").replace(/<Relationship [^>]*(vbaProject|calcChain)[^>]*\/>/g, ""),
);
put(
  "[Content_Types].xml",
  text("[Content_Types].xml")
    .replace("application/vnd.ms-excel.sheet.macroEnabled.main+xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")
    .replace(/<Override PartName="\/xl\/(calcChain\.xml|vbaProject\.bin)"[^>]*\/>/g, ""),
);
put(
  "xl/workbook.xml",
  text("xl/workbook.xml")
    .replace(/ codeName="[^"]*"/g, "")
    .replace(/<xr:revisionPtr[^>]*\/>/, "")
    .replace(/\$A\$1:\$M\$\d+/, "$A$1:$M$__FIN_TABLE__")
    .replace(/<calcPr [^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>'),
);
put(
  "docProps/core.xml",
  text("docProps/core.xml")
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, "<dc:creator>Waraqa</dc:creator>")
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy>Waraqa</cp:lastModifiedBy>")
    .replace(/<dc:title>[\s\S]*?<\/dc:title>/, "<dc:title>Relevé de déduction</dc:title>"),
);
put("docProps/app.xml", text("docProps/app.xml").replace(/<Company>[\s\S]*?<\/Company>/, "<Company></Company>").replace(/<Manager>[\s\S]*?<\/Manager>/, ""));

const out = path.join(__dirname, "..", "backend", "src", "assets", "releve-deduction-modele.xlsx");
writeFileSync(out, zipSync(files, { level: 9 }));
const leftovers = strings.filter((s) => s.length > 3 && Object.values(files).some((f) => strFromU8(f).includes(esc(s)) && !["RAISON SOCIAL", "ID_FISCAL", "ANNEE", "PERIODE(Mois)", "REGIME(Encais-1)", "Relevé de déduction", "(Article 112 du Code Général des Impôts)", "Modèle n° ADC082F-15I", "FACT_NUM", "DESIGNATION", "M_HT", "M_TTC", "LIB_FRSS", "ICE_FRS", "TAUX", "ID_PAIE", "DATE_PAIE", "DATE_FAC", "Total"].includes(s)));
console.log(`Modèle écrit : ${path.relative(process.cwd(), out)} (${Object.keys(files).length} parties).`);
if (leftovers.length) console.log("Chaînes du dossier source encore présentes :", leftovers.slice(0, 10));
