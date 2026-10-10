import type { DocumentBlock } from "@/types/document";

export interface ParseOptions {
  /** Treat lines like "1." / "2)" as questions (common assignment convention). */
  numberedLinesAreQuestions: boolean;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
// "Q1.", "Q.1", "Q 2)", "Q:", "Ques 3:", "Question 4 -", "Q1(a)"
const Q_PREFIX = /^(?:q(?:ues(?:tion)?)?\s*[.:)\-]?\s*\d{1,3}\s*(?:\([a-z0-9]{1,4}\)|[a-z])?\s*[.:)\-]?|q\s*[.:)\-])(?=\s|$)/i;
const NUMBERED = /^\d{1,3}\s*[.)](?=\s+\S)/;
const BULLET = /^([-*•●▪◦])\s+(.*)$/;
// "a)", "(a)", "(ii)", "iv)", "(3)", "a."
const SUB_ITEM = /^(?:\([a-z]{1,4}\)|\([0-9]{1,2}\)|[a-z]\)|[ivx]{1,4}\)|[a-z]\.)(?=\s+\S)/i;

/** Normalise newlines/tabs and strip control characters that cannot be rendered. */
export function normalizeText(input: string): string {
  return input
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[   ]/g, " ");
}

/**
 * Convert the editor text into typed blocks, one logical line per block.
 * Line breaks typed by the user are preserved; blank lines become empty paragraphs.
 */
export function parseTextToBlocks(input: string, options: ParseOptions): DocumentBlock[] {
  const lines = normalizeText(input).split("\n");
  // Drop trailing blank lines so they don't create empty trailing pages.
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  return lines.map((raw, index) => {
    const margin = splitMarginPrefix(raw);
    if (!margin) return classifyLine(raw, index, options);
    const block = classifyLine(margin.rest, index, options);
    block.marginLabel = margin.label;
    // A numbered margin label ("Q1", "Ex 2", "3(a)") makes the line a question.
    if (isQuestionLikeLabel(margin.label) && block.type !== "heading") {
      return { id: block.id, type: "question", text: margin.rest.trim(), sourceLine: index, marginLabel: margin.label };
    }
    return block;
  });
}

/**
 * Labels written in the editor's left margin are stored in the text as "label» text".
 * "»" with an empty label means "no margin label on this line" and suppresses the automatic ones.
 */
export const MARGIN_MARK = "»";
const MARGIN_PREFIX = /^([^»\n]{0,24})»[ ]?/;
const ANSWER_LIKE = /^(?:ans(?:wer)?|sol(?:ution)?)\b/i;

export function splitMarginPrefix(line: string): { label: string; rest: string; prefixLength: number } | null {
  const match = MARGIN_PREFIX.exec(line);
  if (!match) return null;
  return { label: match[1]!.trim(), rest: line.slice(match[0].length), prefixLength: match[0].length };
}

export function isQuestionLikeLabel(label: string): boolean {
  return label !== "" && !ANSWER_LIKE.test(label) && /\d/.test(label);
}

function classifyLine(raw: string, index: number, options: ParseOptions): DocumentBlock {
  const line = raw.replace(/\s+$/, "");
  const indent = line.length - line.trimStart().length;
  const body = line.trimStart();
  const id = `b${index}`;

  if (body === "") return { id, type: "paragraph", text: "", sourceLine: index };

  const heading = HEADING.exec(body);
  if (heading && indent === 0) {
    return { id, type: "heading", text: heading[2]!, level: heading[1]!.length, sourceLine: index };
  }

  if (indent === 0 && (Q_PREFIX.test(body) || (options.numberedLinesAreQuestions && NUMBERED.test(body)))) {
    return { id, type: "question", text: body, sourceLine: index };
  }

  const level = Math.min(3, Math.floor(indent / 2));
  const bullet = BULLET.exec(body);
  if (bullet) {
    return { id, type: "list", listKind: "unordered", text: bullet[2]!, level, indent, sourceLine: index };
  }
  if (SUB_ITEM.test(body) || (indent > 0 && NUMBERED.test(body))) {
    return { id, type: "list", listKind: "ordered", text: body, level, indent, sourceLine: index };
  }

  return { id, type: "paragraph", text: body, indent, sourceLine: index };
}

// The number part of a question: "Q1", "Q1 a)", "Q.2(b)", "Question 3:", "4.", "5 b)".
const QUESTION_LABEL =
  /^(?:q(?:ues(?:tion)?)?\s*[.:)\-]?\s*\d{1,3}|\d{1,3})(?:\s*(?:\([a-z0-9]{1,4}\)|[a-z](?=[.)])|[ivx]{1,4}(?=[.)])))?\s*[.:)\-]{0,3}(?=\s|$)/i;

/** Split a question line into its number label and the question text (both unchanged). */
export function splitQuestionLabel(text: string): { label: string; rest: string } | null {
  const match = QUESTION_LABEL.exec(text);
  if (!match) return null;
  const label = match[0].trim();
  const rest = text.slice(match[0].length).trim();
  return label ? { label, rest } : null;
}

// "Ans", "Ans.", "Ans:", "Answer -", "ANS)"
const ANSWER_LABEL = /^ans(?:wer)?\s*[.:)\-]{0,2}(?=\s|$)/i;

/** Split a typed answer label ("Ans:") from the rest of the line (both unchanged). */
export function splitAnswerLabel(text: string): { label: string; rest: string } | null {
  const match = ANSWER_LABEL.exec(text);
  if (!match) return null;
  return { label: match[0].trim(), rest: text.slice(match[0].length).trim() };
}

/**
 * Blocks that start an answer, mapped to the label the user typed ("Ans:") or null when
 * InkPaper should add "Ans." itself. An answer starts at the first paragraph/list line after
 * a question (blank lines skipped), or at any paragraph the user began with "Ans".
 */
export function findAnswerStarts(blocks: DocumentBlock[]): Map<number, string | null> {
  const starts = new Map<number, string | null>();
  let afterQuestion = false;
  blocks.forEach((block, index) => {
    if (block.type === "question" || block.type === "heading") {
      afterQuestion = block.type === "question";
      return;
    }
    if (block.type === "paragraph" && block.text === "" && block.marginLabel === undefined) return;
    if (block.marginLabel !== undefined) {
      // The user wrote their own margin label here; no automatic "Ans.".
      afterQuestion = false;
      return;
    }
    const typed = block.type === "paragraph" ? splitAnswerLabel(block.text) : null;
    if (typed) starts.set(index, typed.label);
    else if (afterQuestion) starts.set(index, null);
    afterQuestion = false;
  });
  return starts;
}

export function countQuestions(blocks: DocumentBlock[]): number {
  return blocks.filter((block) => block.type === "question").length;
}

/**
 * The number to give a newly marked question: one more than the highest question number
 * already written ("Q1", "Q.3", "4.", or a margin label like "Q5"), so gaps and reordering
 * never produce a duplicate.
 */
export function nextQuestionNumber(blocks: DocumentBlock[]): number {
  let highest = 0;
  for (const block of blocks) {
    if (block.type !== "question") continue;
    const label = block.marginLabel ?? splitQuestionLabel(block.text)?.label ?? "";
    const number = Number(/\d{1,3}/.exec(label)?.[0] ?? 0);
    highest = Math.max(highest, number);
  }
  return highest + 1;
}

export function isEffectivelyEmpty(text: string): boolean {
  return text.trim().length === 0;
}
