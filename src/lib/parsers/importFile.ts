"use client";

import { ImportError, maxUploadBytes, type ImportResult } from "@/lib/parsers/types";

export type FileKind = "pdf" | "docx" | "txt";

const EXTENSIONS: Record<string, FileKind> = { pdf: "pdf", docx: "docx", txt: "txt", text: "txt", md: "txt" };

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

/** Decide the parser from content first; extension/MIME are only hints. */
export function detectKind(name: string, bytes: Uint8Array): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const hinted = EXTENSIONS[ext];
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (hinted === "docx") return "docx";
    throw new ImportError("unsupported", "This looks like a ZIP-based file that isn't a .docx. Save it as .docx, .pdf or .txt.");
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ImportError("unsupported", "Old .doc files are not supported. Open it in Word and save as .docx.");
  }
  if (hinted === "pdf") throw new ImportError("corrupt", "This file has a .pdf name but isn't a valid PDF.");
  if (hinted === "docx") throw new ImportError("corrupt", "This file has a .docx name but isn't a valid Word document.");
  if (hinted === "txt") return "txt";
  throw new ImportError("unsupported", `Unsupported file type ".${ext}". Use PDF, DOCX or TXT.`);
}

export async function importFile(file: File): Promise<ImportResult> {
  const limit = maxUploadBytes();
  if (file.size > limit) {
    throw new ImportError("too-large", `This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${Math.round(limit / 1048576)} MB.`);
  }
  if (file.size === 0) throw new ImportError("empty", "This file is empty.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectKind(file.name, bytes);

  if (kind === "txt") {
    const { parseTxt } = await import("@/lib/parsers/txt");
    return parseTxt(bytes);
  }
  if (kind === "docx") {
    const { parseDocx } = await import("@/lib/parsers/docx");
    return parseDocx(bytes);
  }
  const [{ parsePdf }, pdfjs] = await Promise.all([import("@/lib/parsers/pdf"), import("pdfjs-dist")]);
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return parsePdf(bytes, pdfjs as unknown as import("@/lib/parsers/pdf").PdfJsLike);
}
