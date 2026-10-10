import mammoth from "mammoth";
import { docxHtmlToText } from "@/lib/parsers/docxHtml";
import { ImportError, type ImportResult } from "@/lib/parsers/types";

export async function parseDocx(bytes: Uint8Array): Promise<ImportResult> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // The browser build of Mammoth reads `arrayBuffer`; the Node build (used in tests) reads `buffer`.
  const input = {
    arrayBuffer,
    ...(typeof Buffer !== "undefined" ? { buffer: Buffer.from(arrayBuffer) } : {}),
  } as { arrayBuffer: ArrayBuffer };

  let html: string;
  try {
    const result = await mammoth.convertToHtml(input, {
      // Don't inline image data; we only need to know images existed.
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    });
    html = result.value;
  } catch {
    throw new ImportError("corrupt", "This Word file could not be read. It may be damaged or not a real .docx file.");
  }

  const parsed = docxHtmlToText(html);
  if (parsed.text.trim() === "") {
    throw new ImportError("empty", "No text was found in this Word document.");
  }
  return parsed;
}
