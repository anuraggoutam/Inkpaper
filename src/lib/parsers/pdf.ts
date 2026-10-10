import { looksScanned, pdfPagesToText, type PdfPageText } from "@/lib/parsers/pdfText";
import { ImportError, type ImportResult } from "@/lib/parsers/types";

/** The subset of the pdfjs-dist API we use (browser or legacy Node build). */
export interface PdfJsLike {
  getDocument(params: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    stopAtErrors?: boolean;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: unknown[] }>;
        cleanup(): void;
      }>;
      destroy(): Promise<void>;
    }>;
    destroy(): Promise<void>;
  };
}

interface RawItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}

function toItem(raw: RawItem): PdfPageText["items"][number] | null {
  if (typeof raw.str !== "string" || !Array.isArray(raw.transform)) return null;
  const t = raw.transform as number[];
  const fontSize = Math.hypot(t[2] ?? 0, t[3] ?? 0) || (typeof raw.height === "number" ? raw.height : 10);
  return { str: raw.str, x: t[4] ?? 0, y: t[5] ?? 0, width: typeof raw.width === "number" ? raw.width : 0, fontSize };
}

export async function parsePdf(bytes: Uint8Array, pdfjs: PdfJsLike): Promise<ImportResult> {
  // pdf.js may transfer/detach the buffer, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  let doc: Awaited<typeof task.promise> | null = null;
  try {
    try {
      doc = await task.promise;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "PasswordException") {
        throw new ImportError("encrypted", "This PDF is password-protected. Remove the password and try again.");
      }
      throw new ImportError("corrupt", "This PDF could not be opened. It may be damaged or not a real PDF.");
    }

    const pages: PdfPageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ items: content.items.map((item) => toItem(item as RawItem)).filter((item) => item !== null) });
      page.cleanup();
    }

    if (looksScanned(pages)) {
      throw new ImportError(
        "scanned",
        "No selectable text was found in this PDF. It is probably a scanned or image-only document, which InkPaper v1 cannot read (no OCR). Copy the text manually or use a text-based PDF/DOCX.",
      );
    }
    const text = pdfPagesToText(pages);
    const warnings = ["PDF text was re-flowed from its layout. Check question numbers, line breaks and multi-column sections before exporting."];
    return { text, warnings };
  } finally {
    if (doc) await doc.destroy().catch(() => undefined);
    else await task.destroy().catch(() => undefined);
  }
}
