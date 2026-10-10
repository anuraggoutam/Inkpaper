import { normalizeText } from "@/lib/document/parseText";

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface PdfPageText {
  items: PdfTextItem[];
}

interface Line {
  y: number;
  x: number;
  right: number;
  fontSize: number;
  text: string;
}

const STARTS_NEW_ITEM = /^\s*(?:q(?:ues(?:tion)?)?\s*[.:)\-]?\s*\d|\d{1,3}\s*[.)]\s|[-*•●▪◦]\s|\([a-z0-9]{1,4}\)\s|[a-z]\)\s|ans(?:wer)?\s*[:.\-])/i;
const ENDS_SENTENCE = /[.?!:;)\]"”]$/;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** Group positioned text items into visual lines (top to bottom, left to right). */
export function groupLines(items: PdfTextItem[]): Line[] {
  const usable = items.filter((item) => item.str.length > 0);
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; fontSize: number; items: PdfTextItem[] }[] = [];

  for (const item of sorted) {
    const size = item.fontSize || 10;
    const line = lines.find((l) => Math.abs(l.y - item.y) < Math.max(2, Math.min(size, l.fontSize) * 0.5));
    if (line) {
      line.items.push(item);
      line.fontSize = Math.max(line.fontSize, size);
    } else {
      lines.push({ y: item.y, fontSize: size, items: [item] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const parts = [...line.items].sort((a, b) => a.x - b.x);
      let text = "";
      let right = parts[0]!.x;
      for (const part of parts) {
        const gap = part.x - right;
        const needsSpace = text !== "" && !text.endsWith(" ") && !part.str.startsWith(" ") && gap > line.fontSize * 0.12;
        text += (needsSpace ? " " : "") + part.str;
        right = Math.max(right, part.x + part.width);
      }
      return { y: line.y, x: parts[0]!.x, right, fontSize: line.fontSize, text: text.replace(/\s+/g, " ").trim() };
    })
    .filter((line) => line.text !== "");
}

/**
 * Turn extracted PDF text into InkPaper text: wrapped lines are re-joined into paragraphs,
 * question/list starts and large vertical gaps begin new lines.
 */
export function pdfPagesToText(pages: PdfPageText[]): string {
  const out: string[] = [];
  let paragraph = "";
  let previous: Line | null = null;

  const endParagraph = (blank: boolean) => {
    if (paragraph) out.push(paragraph);
    paragraph = "";
    if (blank && out.length > 0 && out[out.length - 1] !== "") out.push("");
  };

  pages.forEach((page) => {
    const lines = groupLines(page.items);
    if (lines.length === 0) return;
    const gaps = lines.slice(1).map((line, i) => lines[i]!.y - line.y).filter((gap) => gap > 0);
    const typicalGap = median(gaps) || lines[0]!.fontSize * 1.2;
    const leftEdge = Math.min(...lines.map((line) => line.x));
    const rightEdge = Math.max(...lines.map((line) => line.right));
    const fullWidth = rightEdge - leftEdge;

    lines.forEach((line, i) => {
      if (!previous) {
        paragraph = line.text;
        previous = line;
        return;
      }
      const samePage = i > 0;
      const gap = samePage ? previous.y - line.y : typicalGap;
      const bigGap = samePage && gap > typicalGap * 1.45;
      const startsItem = STARTS_NEW_ITEM.test(line.text);
      const previousShort = previous.right - leftEdge < fullWidth * 0.75;
      const indented = samePage && line.x - leftEdge > line.fontSize * 1.5 && previous.x - leftEdge < line.fontSize * 0.5;
      const previousEnds = ENDS_SENTENCE.test(previous.text);
      const continuesAcrossPage = !samePage && !previousEnds && /^[a-z(]/.test(line.text);

      if (!samePage && !continuesAcrossPage) {
        endParagraph(false);
        paragraph = line.text;
      } else if (bigGap) {
        endParagraph(true);
        paragraph = line.text;
      } else if (startsItem || indented || (previousShort && previousEnds) || line.fontSize > previous.fontSize * 1.25) {
        endParagraph(false);
        paragraph = line.text;
      } else if (paragraph.endsWith("-") && /^[a-z]/.test(line.text)) {
        paragraph += line.text;
      } else {
        paragraph += (paragraph ? " " : "") + line.text;
      }
      previous = line;
    });
  });
  endParagraph(false);

  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return normalizeText(out.join("\n"));
}

/** True when a PDF has (almost) no extractable text — usually a scanned/image-only file. */
export function looksScanned(pages: PdfPageText[]): boolean {
  const chars = pages.reduce((sum, page) => sum + page.items.reduce((s, item) => s + item.str.replace(/\s/g, "").length, 0), 0);
  return chars < Math.max(10, pages.length * 5);
}
