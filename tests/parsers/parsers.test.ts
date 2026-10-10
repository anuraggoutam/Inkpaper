import { describe, expect, it } from "vitest";
import { Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseTxt } from "@/lib/parsers/txt";
import { parseDocx } from "@/lib/parsers/docx";
import { docxHtmlToText } from "@/lib/parsers/docxHtml";
import { parsePdf, type PdfJsLike } from "@/lib/parsers/pdf";
import { groupLines, pdfPagesToText } from "@/lib/parsers/pdfText";
import { detectKind, importFile } from "@/lib/parsers/importFile";
import { ImportError } from "@/lib/parsers/types";
import { parseTextToBlocks } from "@/lib/document/parseText";

const pdfLib = pdfjs as unknown as PdfJsLike;

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 16, size: 12, font }));
  }
  return pdf.save();
}

describe("TXT", () => {
  it("preserves paragraphs, blank lines and Unicode", () => {
    const bytes = new TextEncoder().encode("﻿Q1. Café?\r\nAnswer — naïve résumé ✓\r\n\r\nनमस्ते");
    const { text } = parseTxt(bytes);
    expect(text).toBe("Q1. Café?\nAnswer — naïve résumé ✓\n\nनमस्ते");
  });

  it("falls back to Windows-1252 for invalid UTF-8", () => {
    const { text, warnings } = parseTxt(new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    expect(text).toBe("café");
    expect(warnings.length).toBe(1);
  });

  it("rejects empty files", () => {
    expect(() => parseTxt(new TextEncoder().encode("   \n "))).toThrow(ImportError);
  });
});

describe("DOCX", () => {
  it("keeps headings, paragraphs and lists", async () => {
    const document = new Document({
      numbering: {
        config: [{ reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1." }] }],
      },
      sections: [
        {
          children: [
            new Paragraph({ text: "Chemistry Assignment", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun("Q1. What is an atom?")] }),
            new Paragraph({ children: [new TextRun({ text: "An atom is the ", bold: true }), new TextRun("smallest unit & more.")] }),
            new Paragraph({ text: "protons", bullet: { level: 0 } }),
            new Paragraph({ text: "neutrons", bullet: { level: 0 } }),
            new Paragraph({ text: "first step", numbering: { reference: "num", level: 0 } }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(document);
    const { text } = await parseDocx(new Uint8Array(buffer));
    expect(text).toBe(
      ["# Chemistry Assignment", "Q1. What is an atom?", "An atom is the smallest unit & more.", "- protons", "- neutrons", "1. first step"].join("\n"),
    );
    const types = parseTextToBlocks(text, { numberedLinesAreQuestions: true }).map((b) => b.type);
    expect(types.slice(0, 4)).toEqual(["heading", "question", "paragraph", "list"]);
  });

  it("flattens tables and warns about images", () => {
    const { text, warnings } = docxHtmlToText(
      '<p>Intro</p><table><tr><td><p>A</p></td><td><p>B</p></td></tr></table><p><img src="" /></p><ol><li>one<ol><li>sub</li></ol></li></ol>',
    );
    expect(text).toBe("Intro\nA  |  B\n1. one\n  a) sub");
    expect(warnings).toHaveLength(2);
  });

  it("does not execute or keep markup", () => {
    const { text } = docxHtmlToText("<p>&lt;script&gt;alert(1)&lt;/script&gt; x &amp; y</p>");
    expect(text).toBe("<script>alert(1)</script> x & y");
  });

  it("fails gracefully for corrupt files", async () => {
    await expect(parseDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toMatchObject({ code: "corrupt" });
  });
});

describe("PDF", () => {
  it("extracts text in reading order and re-joins wrapped lines", async () => {
    const bytes = await makePdf([
      ["Q1. What is gravity?", "Gravity is a force that attracts", "objects with mass toward each other."],
      ["Q2. Define mass.", "Mass is the amount of matter."],
    ]);
    const { text } = await parsePdf(bytes, pdfLib);
    expect(text).toBe(
      ["Q1. What is gravity?", "Gravity is a force that attracts objects with mass toward each other.", "Q2. Define mass.", "Mass is the amount of matter."].join("\n"),
    );
  });

  it("reports image-only PDFs as scanned", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
    await expect(parsePdf(await pdf.save(), pdfLib)).rejects.toMatchObject({ code: "scanned" });
  });

  it("fails gracefully for corrupt PDFs", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf");
    await expect(parsePdf(bytes, pdfLib)).rejects.toBeInstanceOf(ImportError);
  });

  it("groups items on the same baseline into one line", () => {
    const lines = groupLines([
      { str: "world", x: 60, y: 100, width: 30, fontSize: 10 },
      { str: "Hello", x: 20, y: 100.5, width: 30, fontSize: 10 },
      { str: "Next", x: 20, y: 85, width: 20, fontSize: 10 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Next"]);
  });

  it("keeps large gaps as blank lines", () => {
    const item = (str: string, y: number) => ({ str, x: 20, y, width: 300, fontSize: 10 });
    const text = pdfPagesToText([{ items: [item("First paragraph line", 700), item("continues here.", 688), item("Second paragraph", 640)] }]);
    expect(text).toBe("First paragraph line continues here.\n\nSecond paragraph");
  });
});

describe("file detection", () => {
  it("uses content signatures, not just extensions", () => {
    expect(detectKind("notes.txt", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("pdf");
    expect(() => detectKind("fake.pdf", new TextEncoder().encode("hello"))).toThrow(ImportError);
    expect(() => detectKind("image.png", new Uint8Array([0x89, 0x50]))).toThrow(/Unsupported/);
    expect(() => detectKind("old.doc", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/\.doc/);
  });

  it("rejects oversized files before reading them", async () => {
    const big = new File([new Uint8Array(21 * 1024 * 1024)], "big.txt");
    await expect(importFile(big)).rejects.toMatchObject({ code: "too-large" });
  });
});
