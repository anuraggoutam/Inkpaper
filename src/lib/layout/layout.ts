import type { AssignmentDocument, DocumentBlock } from "@/types/document";
import { findAnswerStarts, parseTextToBlocks, splitAnswerLabel, splitQuestionLabel } from "@/lib/document/parseText";
import { answerInk, inkShade, questionInk, type InkName } from "@/lib/handwriting/ink";
import { createRng, hashString, signed } from "@/lib/handwriting/random";
import type { RenderSettings } from "@/lib/validation/schema";
import { computeGeometry, PX_PER_MM, type PageGeometry } from "@/lib/layout/geometry";

/** Returns the advance width (px) of `text` rendered in the handwriting font at `fontPx`. */
export type Measurer = (text: string, fontPx: number) => number;

export interface PlacedWord {
  text: string;
  x: number;
  y: number;
  /** Width the layout reserved for this word (px). */
  width: number;
  size: number;
  rotate: number;
  opacity: number;
  color: string;
}

export interface Underline {
  x1: number;
  x2: number;
  y: number;
  color: string;
  wobble: number;
}

export interface PageLayout {
  index: number;
  words: PlacedWord[];
  underlines: Underline[];
  /** Source text line for each used ruled line (for editor ↔ preview sync). */
  lines: { y: number; sourceLine: number }[];
  pageNumber?: PlacedWord;
  /** Handwriting inside the practical-file header box (topic and date; first page only). */
  headerWords: PlacedWord[];
}

export interface DocumentLayout {
  geometry: PageGeometry;
  pages: PageLayout[];
  blocks: DocumentBlock[];
}

interface RowWord {
  text: string;
  x: number;
  width: number;
  dy: number;
  size: number;
  rotate: number;
  opacity: number;
  color: string;
}

interface Row {
  words: RowWord[];
  underline?: { color: string; wobble: number };
  sourceLine: number;
  /** Blank spacer rows that are dropped when they would start a page. */
  collapsible: boolean;
  /** Keep this row on the same page as the next row (headings/questions). */
  keepWithNext: boolean;
}

interface WrapContext {
  settings: RenderSettings;
  geometry: PageGeometry;
  measure: Measurer;
  spaceWidth: number;
}

interface WrapOptions {
  firstX: number;
  contX: number;
  ink: InkName;
  key: string;
  sourceLine: number;
  /** Optional marker word (e.g. a bullet) placed at firstX before the text. */
  marker?: string;
  align?: "left" | "center";
}

function splitLongWord(word: string, maxWidth: number, fontPx: number, measure: Measurer): string[] {
  const chars = Array.from(word);
  const parts: string[] = [];
  let current = "";
  for (const char of chars) {
    if (current && measure(current + char, fontPx) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(text: string, ctx: WrapContext, opts: WrapOptions): Row[] {
  const { settings, geometry, measure } = ctx;
  const v = settings.variation;
  const maxX = geometry.textRight - geometry.maxLineJitter;
  const rawWords = text.split(/\s+/).filter(Boolean);
  const tokens = opts.marker ? [opts.marker, ...rawWords] : rawWords;

  const rows: Row[] = [];
  let current: RowWord[] = [];
  let x = opts.firstX;
  let wordIndex = 0;

  const pushRow = () => {
    rows.push({ words: current, sourceLine: opts.sourceLine, collapsible: false, keepWithNext: false });
    current = [];
    x = opts.contX;
  };

  for (const token of tokens) {
    const rng = createRng(hashString(`${opts.key}:${wordIndex++}`, settings.seed));
    // All variation is scaled by v, so variation 0 gives perfectly regular writing.
    const vary = (amount: number, value: number) => (v === 0 ? 0 : v * amount * value);
    const size = geometry.fontPx * (1 + vary(0.045, signed(rng)));
    const gap = ctx.spaceWidth * (1.15 + vary(0.4, rng()));
    const dy = vary(geometry.pitch * 0.045, signed(rng));
    const rotate = vary(1.4, signed(rng));
    const opacity = 1 - vary(0.16, rng());
    const color = inkShade(opts.ink, rng(), v);

    // A word wider than a whole line is broken so every piece fits on a fresh line.
    const freshLineWidth = maxX - Math.max(opts.firstX, opts.contX);
    const pieces = measure(token, size) > freshLineWidth ? splitLongWord(token, freshLineWidth, size, measure) : [token];

    for (const piece of pieces) {
      const width = measure(piece, size);
      if (current.length > 0 && x + width > maxX) pushRow();
      current.push({ text: piece, x, width, dy, size, rotate, opacity, color });
      x += width + gap;
    }
  }
  if (current.length > 0 || rows.length === 0) pushRow();

  // Line-level variation: a small right shift and a gentle slope, both bounded.
  rows.forEach((row, rowIndex) => {
    const rng = createRng(hashString(`${opts.key}:line:${rowIndex}`, settings.seed));
    const shift = v === 0 ? 0 : geometry.maxLineJitter * rng();
    const slope = v === 0 ? 0 : (v * geometry.pitch * 0.06 * signed(rng)) / Math.max(1, maxX - geometry.textLeft);
    let centerOffset = 0;
    if (opts.align === "center" && row.words.length > 0) {
      const last = row.words[row.words.length - 1]!;
      const rowWidth = last.x + last.width - row.words[0]!.x;
      centerOffset = Math.max(0, (maxX - geometry.textLeft - rowWidth) / 2) - (row.words[0]!.x - geometry.textLeft);
    }
    const start = row.words[0]?.x ?? 0;
    for (const word of row.words) {
      word.x += shift + centerOffset;
      word.dy += slope * (word.x - start);
    }
  });
  return rows;
}

/**
 * Write a question's number ("Q1 a)", "Q.2", "3.") in the left margin, ending just before the
 * margin line, as students do in notebooks. Returns null (number stays inline) if it doesn't fit.
 */
function placeMarginLabel(text: string, ctx: WrapContext, ink: InkName, key: string, sourceLine: number): { words: RowWord[]; rest: string } | null {
  const split = splitQuestionLabel(text);
  if (!split) return null;
  const words = marginWords(split.label, ctx, ink, key, sourceLine);
  return words ? { words, rest: split.rest } : null;
}

/** Handwritten label right-aligned just before the margin line, or null if it doesn't fit there. */
function marginWords(label: string, ctx: WrapContext, ink: InkName, key: string, sourceLine: number): RowWord[] | null {
  const { geometry } = ctx;
  const [row] = wrapText(label, ctx, { firstX: 0, contX: 0, ink, key: `${key}m`, sourceLine });
  if (!row || row.words.length === 0) return null;
  const last = row.words[row.words.length - 1]!;
  const width = last.x + last.width - row.words[0]!.x;
  const right = geometry.marginLineX - 2 * PX_PER_MM;
  const left = Math.max(3 * PX_PER_MM, right - width);
  if (left + width > right + 0.01) return null;
  const offset = left - row.words[0]!.x;
  row.words.forEach((word) => (word.x += offset));
  return row.words;
}

/**
 * Like blockRowsInner, but for the first line of an answer writes "Ans." (or the user's own
 * typed "Ans:") in the left margin. `answer` is undefined for blocks that don't start an answer.
 */
function blockRows(block: DocumentBlock, index: number, ctx: WrapContext, rows: Row[], answer: string | null | undefined): void {
  if (answer === undefined || !ctx.settings.answerLabelInMargin) return blockRowsInner(block, index, ctx, rows);
  const typed = answer !== null ? splitAnswerLabel(block.text) : null;
  const words = marginWords(typed?.label ?? "Ans.", ctx, answerInk(ctx.settings), `L${block.sourceLine}a`, block.sourceLine);
  // Doesn't fit in the margin: a typed label simply stays inline; nothing is lost.
  if (!words) return blockRowsInner(block, index, ctx, rows);

  const start = rows.length;
  blockRowsInner(typed ? { ...block, text: typed.rest } : block, index, ctx, rows);
  const first = rows.slice(start).find((row) => row.words.length > 0);
  if (first) {
    first.words.unshift(...words);
  } else {
    // The line was only "Ans:" — keep it as a line of its own.
    rows.splice(start);
    rows.push({ words, sourceLine: block.sourceLine, collapsible: false, keepWithNext: false });
  }
}

function blankRow(sourceLine: number, collapsible: boolean): Row {
  return { words: [], sourceLine, collapsible, keepWithNext: false };
}

function blockRowsInner(block: DocumentBlock, index: number, ctx: WrapContext, rows: Row[]): void {
  const { settings, geometry } = ctx;
  const key = `L${block.sourceLine}`;
  const qInk = questionInk(settings);
  const aInk = answerInk(settings);
  const previous = rows[rows.length - 1];
  const needsGap = previous !== undefined && previous.words.length > 0;
  const indentStep = geometry.fontPx * 1.1;

  switch (block.type) {
    case "heading": {
      if (needsGap) rows.push(blankRow(block.sourceLine, true));
      const wrapped = wrapText(block.text, ctx, {
        firstX: geometry.textLeft,
        contX: geometry.textLeft,
        ink: qInk,
        key,
        sourceLine: block.sourceLine,
        align: block.level === 1 ? "center" : "left",
      });
      wrapped.forEach((row) => {
        row.keepWithNext = true;
        row.underline = { color: inkShade(qInk, 0, 0), wobble: settings.variation };
      });
      rows.push(...wrapped);
      return;
    }
    case "question": {
      if (needsGap && settings.gapBeforeQuestions) rows.push(blankRow(block.sourceLine, true));
      const marginLabel = settings.questionNumberInMargin ? placeMarginLabel(block.text, ctx, qInk, key, block.sourceLine) : null;
      const wrapped = wrapText(marginLabel ? marginLabel.rest : block.text, ctx, {
        firstX: geometry.textLeft,
        contX: geometry.textLeft,
        ink: qInk,
        key: marginLabel ? `${key}q` : key,
        sourceLine: block.sourceLine,
      });
      if (marginLabel) wrapped[0]!.words.unshift(...marginLabel.words);
      wrapped.forEach((row) => (row.keepWithNext = true));
      rows.push(...wrapped);
      return;
    }
    case "list": {
      const level = block.level ?? 0;
      const firstX = geometry.textLeft + indentStep * (level + 0.5);
      if (block.listKind === "unordered") {
        const markerWidth = ctx.measure("•", geometry.fontPx) + ctx.spaceWidth * 1.4;
        rows.push(
          ...wrapText(block.text, ctx, {
            firstX,
            contX: firstX + markerWidth,
            ink: aInk,
            key,
            sourceLine: block.sourceLine,
            marker: "•",
          }),
        );
      } else {
        const marker = block.text.split(/\s+/)[0] ?? "";
        const markerWidth = ctx.measure(marker, geometry.fontPx) + ctx.spaceWidth * 1.4;
        rows.push(
          ...wrapText(block.text, ctx, {
            firstX,
            contX: Math.min(firstX + markerWidth, geometry.textLeft + (geometry.textRight - geometry.textLeft) * 0.4),
            ink: aInk,
            key,
            sourceLine: block.sourceLine,
          }),
        );
      }
      return;
    }
    case "paragraph": {
      if (block.text === "") {
        rows.push(blankRow(block.sourceLine, true));
        return;
      }
      const maxIndent = (geometry.textRight - geometry.textLeft) * 0.4;
      const indent = Math.min(maxIndent, (block.indent ?? 0) * ctx.spaceWidth);
      rows.push(
        ...wrapText(block.text, ctx, {
          firstX: geometry.textLeft + indent,
          contX: geometry.textLeft + indent,
          ink: aInk,
          key,
          sourceLine: block.sourceLine,
        }),
      );
      return;
    }
    default: {
      const exhaustive: never = block.type;
      throw new Error(`Unknown block type ${String(exhaustive)} at ${index}`);
    }
  }
}

/**
 * Write a short text on a fixed line (the TOPIC / DATE lines of the practical-file header),
 * shrinking it slightly if needed. Returns null when it can't fit legibly, so the caller
 * can fall back to writing it in the page body instead (text is never cut off).
 */
function fitInSlot(text: string, x1: number, x2: number, baseline: number, ink: InkName, key: string, ctx: WrapContext): PlacedWord[] | null {
  const { geometry, measure, settings } = ctx;
  const v = settings.variation;
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const base = geometry.fontPx * 0.95;
  const gap = ctx.spaceWidth * 1.15;
  const natural = tokens.reduce((sum, token) => sum + measure(token, base), 0) + gap * (tokens.length - 1);
  const scale = Math.min(1, (x2 - x1) / natural);
  if (scale < 0.6) return null;
  const size = base * scale;
  let x = x1;
  return tokens.map((token, i) => {
    const rng = createRng(hashString(`${key}:${i}`, settings.seed));
    const word: PlacedWord = {
      text: token,
      x,
      y: baseline + (v === 0 ? 0 : v * geometry.pitch * 0.03 * signed(rng)),
      width: measure(token, size),
      size,
      rotate: v === 0 ? 0 : v * 1.2 * signed(rng),
      opacity: 1 - (v === 0 ? 0 : v * 0.12 * rng()),
      color: inkShade(ink, rng(), v),
    };
    x += word.width + gap * scale;
    return word;
  });
}

interface HeaderOptions {
  /** Title already written on the TOPIC line of the practical header. */
  titleInBox: boolean;
  /** Date already written on the DATE line of the practical header. */
  dateInBox: boolean;
}

/** Header rows: title (centered, underlined) and optional student details. */
function headerRows(doc: AssignmentDocument, ctx: WrapContext, options: HeaderOptions): Row[] {
  const { settings, geometry, measure } = ctx;
  const rows: Row[] = [];
  const qInk = questionInk(settings);
  const aInk = answerInk(settings);

  if (settings.showStudentHeader) {
    const m = doc.metadata;
    const pairs: [string, string][] = [
      [m.studentName && `Name: ${m.studentName}`, m.rollNumber && `Roll No.: ${m.rollNumber}`],
      [m.course && `Course: ${m.course}`, m.subject && `Subject: ${m.subject}`],
      ["", !options.dateInBox && m.date ? `Date: ${m.date}` : ""],
    ];
    const half = geometry.textLeft + (geometry.textRight - geometry.textLeft) * 0.55;
    const wrapAt = (text: string, x: number, key: string) =>
      wrapText(text, ctx, { firstX: x, contX: x, ink: aInk, key, sourceLine: -1 });
    pairs.forEach(([left, right], i) => {
      const key = `H${i}`;
      // Side by side when both comfortably fit in their half; otherwise one per line (never truncated).
      const leftFits = !left || measure(left, geometry.fontPx) * 1.3 < half - geometry.textLeft - geometry.fontPx;
      const rightFits = !right || measure(right, geometry.fontPx) * 1.3 < geometry.textRight - geometry.maxLineJitter - half;
      if (left && right && leftFits && rightFits) {
        const l = wrapAt(left, geometry.textLeft, key);
        const r = wrapAt(right, half, `${key}r`);
        if (l.length === 1 && r.length === 1) {
          rows.push({ words: [...l[0]!.words, ...r[0]!.words], sourceLine: -1, collapsible: false, keepWithNext: false });
          return;
        }
      }
      if (left) rows.push(...wrapAt(left, geometry.textLeft, key));
      if (right) rows.push(...wrapAt(right, left ? geometry.textLeft : half, `${key}r`));
    });
    if (rows.length > 0) rows.push(blankRow(-1, true));
  }

  if (doc.title.trim() && !options.titleInBox) {
    const titleRows = wrapText(doc.title.trim(), ctx, {
      firstX: geometry.textLeft,
      contX: geometry.textLeft,
      ink: qInk,
      key: "title",
      sourceLine: -1,
      align: "center",
    });
    titleRows.forEach((row) => {
      row.underline = { color: inkShade(qInk, 0, 0), wobble: settings.variation };
      row.keepWithNext = true;
    });
    rows.push(...titleRows, blankRow(-1, true));
  }
  return rows;
}

function paginate(rows: Row[], linesPerPage: number): Row[][] {
  const pages: Row[][] = [];
  let current: Row[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.words.length === 0 && row.collapsible && current.length === 0) continue;

    if (current.length >= linesPerPage) {
      pages.push(current);
      current = [];
      if (row.words.length === 0 && row.collapsible) continue;
    }

    // Keep a heading/question together with the first line that follows it.
    if (row.keepWithNext && (i === 0 || !rows[i - 1]!.keepWithNext)) {
      let end = i;
      while (end < rows.length - 1 && rows[end]!.keepWithNext) end++;
      const groupSize = end - i + 1;
      if (current.length > 0 && current.length + groupSize > linesPerPage && groupSize <= linesPerPage) {
        // Drop trailing spacer rows before breaking so they don't waste the last lines.
        while (current.length > 0 && current[current.length - 1]!.words.length === 0 && current[current.length - 1]!.collapsible) {
          current.pop();
        }
        pages.push(current);
        current = [];
      }
    }
    current.push(row);
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

export function layoutDocument(doc: AssignmentDocument, settings: RenderSettings, measure: Measurer): DocumentLayout {
  const geometry = computeGeometry(settings);
  const ctx: WrapContext = {
    settings,
    geometry,
    measure,
    // Handwritten word gaps are wider than typographic spaces; some fonts have very narrow spaces.
    spaceWidth: Math.max(measure(" ", geometry.fontPx), geometry.fontPx * 0.36),
  };
  const blocks = parseTextToBlocks(doc.text, { numberedLinesAreQuestions: settings.numberedLinesAreQuestions });

  // Practical-file paper: topic and date go on the printed TOPIC / DATE lines of page 1.
  const practical = geometry.practical;
  const slot = (text: string, x1: number, x2: number, ink: InkName, key: string) =>
    practical && text.trim() ? fitInSlot(text, x1 + 1.5 * PX_PER_MM, x2, practical.labelY - 1, ink, key, ctx) : null;
  const topicWords = practical ? slot(doc.title, practical.topicLineX1, practical.topicLineX2, questionInk(settings), "topic") : null;
  const dateWords = practical ? slot(doc.metadata.date, practical.dateLineX1, practical.dateLineX2, answerInk(settings), "date") : null;

  const rows = headerRows(doc, ctx, { titleInBox: topicWords !== null, dateInBox: dateWords !== null });
  const answerStarts = findAnswerStarts(blocks);
  blocks.forEach((block, index) => blockRows(block, index, ctx, rows, answerStarts.get(index)));

  const pageRows = paginate(rows, geometry.linesPerPage);
  const pageInk = answerInk(settings);

  const pages = pageRows.map((pr, pageIndex): PageLayout => {
    const words: PlacedWord[] = [];
    const underlines: Underline[] = [];
    const lines: PageLayout["lines"] = [];
    pr.forEach((row, lineIndex) => {
      const baseline = geometry.baselines[lineIndex]!;
      if (row.sourceLine >= 0) lines.push({ y: baseline, sourceLine: row.sourceLine });
      for (const w of row.words) {
        words.push({
          text: w.text,
          x: w.x,
          y: baseline + w.dy,
          width: w.width,
          size: w.size,
          rotate: w.rotate,
          opacity: w.opacity,
          color: w.color,
        });
      }
      if (row.underline && row.words.length > 0) {
        const first = row.words[0]!;
        const last = row.words[row.words.length - 1]!;
        underlines.push({
          x1: first.x - geometry.fontPx * 0.1,
          x2: last.x + last.width + geometry.fontPx * 0.1,
          y: baseline + geometry.fontPx * 0.14,
          color: row.underline.color,
          wobble: row.underline.wobble,
        });
      }
    });

    let pageNumber: PlacedWord | undefined;
    if (settings.showPageNumbers) {
      const label = String(pageIndex + 1);
      const size = geometry.fontPx * 0.9;
      const width = measure(label, size);
      pageNumber = {
        text: label,
        x: (geometry.pageWidth - width) / 2,
        y: geometry.pageNumberY,
        width,
        size,
        rotate: 0,
        opacity: 0.9,
        color: inkShade(pageInk, 0, 0),
      };
    }
    const headerWords = pageIndex === 0 ? [...(topicWords ?? []), ...(dateWords ?? [])] : [];
    return { index: pageIndex, words, underlines, lines, pageNumber, headerWords };
  });

  return { geometry, pages, blocks };
}
