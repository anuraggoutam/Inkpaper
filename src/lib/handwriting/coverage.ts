import { coveredRanges } from "@/lib/handwriting/fonts";

type Range = [number, number];

export function parseUnicodeRange(spec: string): Range[] {
  return spec.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
    const from = parseInt(start!, 16);
    return [from, end ? parseInt(end, 16) : from] as Range;
  });
}

const cache = new Map<string, Range[]>();

function rangesFor(fontId: string): Range[] {
  let ranges = cache.get(fontId);
  if (!ranges) {
    ranges = coveredRanges(fontId).flatMap(parseUnicodeRange);
    cache.set(fontId, ranges);
  }
  return ranges;
}

export interface CoverageReport {
  /** Distinct characters the handwriting fonts cannot draw (rendered with a system font instead). */
  unsupported: string[];
  /** True if Devanagari text is present (drawn with the Kalam Devanagari fallback). */
  hasDevanagari: boolean;
}

export function checkCoverage(text: string, fontId: string): CoverageReport {
  const ranges = rangesFor(fontId);
  const unsupported = new Set<string>();
  let hasDevanagari = false;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === 10 || code === 13) continue;
    if (code >= 0x0900 && code <= 0x097f) hasDevanagari = true;
    if (!ranges.some(([from, to]) => code >= from && code <= to)) unsupported.add(char);
  }
  return { unsupported: [...unsupported].slice(0, 40), hasDevanagari };
}
