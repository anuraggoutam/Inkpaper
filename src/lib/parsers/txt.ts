import { normalizeText } from "@/lib/document/parseText";
import { ImportError, type ImportResult } from "@/lib/parsers/types";

/** Decode a TXT file as UTF-8 (falling back to Windows-1252 for legacy files). */
export function parseTxt(bytes: Uint8Array): ImportResult {
  const warnings: string[] = [];
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
    warnings.push("The file is not valid UTF-8, so it was read as Windows-1252. Check special characters.");
  }
  text = normalizeText(text);
  if (text.trim() === "") throw new ImportError("empty", "This text file is empty.");
  return { text, warnings };
}
