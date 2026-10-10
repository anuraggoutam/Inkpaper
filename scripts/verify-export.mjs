// End-to-end export check against a running InkPaper server (npm run dev / npm start).
// Usage: npm run verify:export  [-- http://127.0.0.1:3000]
// Writes PDFs to test-output/ and verifies signature, A4 page size, page count,
// selectable text and embedded handwriting fonts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const outDir = join(process.cwd(), "test-output");
mkdirSync(outDir, { recursive: true });

const settings = {
  fontId: "caveat",
  fontSizePt: 17,
  lineHeight: 1.75,
  inkColor: "blue",
  questionInk: "black",
  paperType: "ruled",
  marginMm: 22,
  variation: 0.65,
  seed: 1234,
  showPageNumbers: true,
  showStudentHeader: true,
  showMarginLine: true,
  numberedLinesAreQuestions: true,
  gapBeforeQuestions: true,
  questionNumberInMargin: true,
  answerLabelInMargin: true,
  practicalLines: 30,
};
const metadata = { studentName: "Test Student", rollNumber: "42", course: "B.Sc.", subject: "Biology", date: "10/10/2026" };
const para =
  "Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose and oxygen inside their chloroplasts.";

const cases = [
  { name: "one-page", text: "Q1. What is photosynthesis?\n" + para, minPages: 1, maxPages: 1 },
  {
    name: "long",
    text: Array.from({ length: 45 }, (_, i) => `Q${i + 1}. Explain topic ${i + 1} in detail?\n${para} ${para}\n- point one\n- point two`).join("\n\n"),
    minPages: 10,
    maxPages: 60,
  },
  { name: "practical", text: "Q1 a). Design an algorithm.\n" + para, minPages: 1, maxPages: 1, settings: { paperType: "practical", marginMm: 27 } },
  { name: "plain-kalam", text: "# Heading\n" + para + "\nनमस्ते दुनिया", minPages: 1, maxPages: 1, settings: { fontId: "kalam", paperType: "plain", inkColor: "black", variation: 0 } },
];

let failed = false;
const check = (ok, message) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${message}`);
  if (!ok) failed = true;
};

for (const c of cases) {
  console.log(`\n[${c.name}]`);
  const started = Date.now();
  const response = await fetch(`${base}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document: { title: "Biology Assignment", sourceFileName: "", text: c.text, metadata },
      settings: { ...settings, ...(c.settings ?? {}) },
    }),
  });
  if (!response.ok) {
    check(false, `HTTP ${response.status}: ${await response.text()}`);
    continue;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(join(outDir, `${c.name}.pdf`), bytes);
  console.log(`  exported ${bytes.length} bytes in ${Date.now() - started} ms`);
  check(new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-", "valid %PDF- signature");

  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  check(pages.length >= c.minPages && pages.length <= c.maxPages, `page count ${pages.length} within ${c.minPages}-${c.maxPages}`);
  const allA4 = pages.every((p) => {
    const { width, height } = p.getSize();
    return Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1;
  });
  check(allA4, "every page is A4 portrait (595.28 × 841.89 pt)");

  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const first = await (await doc.getPage(1)).getTextContent();
  const text = first.items.map((i) => i.str).join("");
  check(/Photosynthesis/.test(text.replace(/\s+/g, "")) || /Heading/.test(text), "text is selectable/searchable");
  const last = await (await doc.getPage(doc.numPages)).getTextContent();
  check(last.items.length > 0, "last page is not blank");
  await doc.destroy();

  const raw = Buffer.from(bytes).toString("latin1");
  const embedded = (raw.match(/\/FontFile[23]?/g) ?? []).length;
  check(embedded > 0, `fonts embedded (${embedded} font files)`);
  check(/InkPaper|Caveat|Kalam/i.test(raw), "handwriting font present in PDF");
}

console.log(failed ? "\nExport verification FAILED" : "\nExport verification passed");
process.exit(failed ? 1 : 0);
