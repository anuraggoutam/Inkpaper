import { normalizeText } from "@/lib/document/parseText";
import type { ImportResult } from "@/lib/parsers/types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

interface ListContext {
  kind: "ul" | "ol";
  counter: number;
}

/**
 * Convert the limited HTML produced by Mammoth into InkPaper's plain-text format.
 * The HTML is only tokenised as data — it is never rendered or executed.
 */
export function docxHtmlToText(html: string): ImportResult {
  const lines: string[] = [];
  const warnings = new Set<string>();
  const lists: ListContext[] = [];
  let buffer = "";
  let blockKind: "p" | "h" | "li" | "cell" | null = null;
  let headingLevel = 1;
  let cells: string[] = [];
  let inTable = 0;
  let imageOnly = false;

  const text = () => buffer.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").trim();

  const flush = (kind: typeof blockKind) => {
    const content = text();
    buffer = "";
    if (kind === "cell") {
      cells.push(content.replace(/\n/g, " "));
      return;
    }
    if (inTable > 0) {
      if (content) cells.push(content.replace(/\n/g, " "));
      return;
    }
    if (kind === "h") {
      if (content) lines.push(`${"#".repeat(Math.min(3, headingLevel))} ${content.replace(/\n/g, " ")}`);
      return;
    }
    if (kind === "li") {
      if (!content) return;
      const depth = Math.max(1, lists.length);
      const list = lists[lists.length - 1];
      const indent = "  ".repeat(depth - 1);
      const [first, ...rest] = content.split("\n");
      let marker = "-";
      if (list?.kind === "ol") {
        marker = depth === 1 ? `${list.counter}.` : `${String.fromCharCode(96 + (((list.counter - 1) % 26) + 1))})`;
      }
      lines.push(`${indent}${marker} ${first}`);
      rest.forEach((line) => lines.push(`${indent}  ${line}`));
      return;
    }
    lines.push(...(content ? content.split("\n") : [""]));
  };

  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token[0] !== "<") {
      buffer += decodeEntities(token);
      continue;
    }
    const tag = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(token);
    if (!tag) continue;
    const closing = tag[1] === "/";
    const name = tag[2]!.toLowerCase();

    switch (name) {
      case "p":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        if (inTable > 0 || lists.length > 0) {
          if (closing && buffer.trim()) buffer += "\n";
          break;
        }
        if (!closing) {
          buffer = "";
          blockKind = name === "p" ? "p" : "h";
          headingLevel = name === "p" ? 1 : Number(name[1]);
        } else {
          // A paragraph that only held an image is skipped rather than kept as a blank line.
          if (blockKind === "p" && imageOnly && !buffer.trim()) buffer = "";
          else flush(blockKind);
          blockKind = null;
          imageOnly = false;
        }
        break;
      }
      case "ul":
      case "ol":
        if (!closing) {
          if (lists.length > 0 && buffer.trim()) flush("li");
          lists.push({ kind: name, counter: 0 });
        } else {
          if (buffer.trim()) flush("li");
          lists.pop();
        }
        break;
      case "li":
        if (!closing) {
          if (buffer.trim()) flush("li");
          const list = lists[lists.length - 1];
          if (list) list.counter++;
          buffer = "";
        } else {
          flush("li");
        }
        break;
      case "br":
        buffer += "\n";
        break;
      case "table":
        if (!closing) {
          inTable++;
          warnings.add("Tables were flattened into plain text rows (cells separated by |). Please review them.");
        } else {
          inTable = Math.max(0, inTable - 1);
        }
        break;
      case "tr":
        if (!closing) cells = [];
        else {
          if (buffer.trim()) flush("cell");
          if (cells.some(Boolean)) lines.push(cells.join("  |  "));
          cells = [];
        }
        break;
      case "td":
      case "th":
        if (!closing) buffer = "";
        else flush("cell");
        break;
      case "img":
        warnings.add("Images in the document are not supported and were skipped.");
        imageOnly = true;
        break;
      default:
        break;
    }
  }
  if (buffer.trim()) flush(blockKind ?? "p");

  // Collapse runs of blank lines to a single blank line.
  const collapsed = lines.filter((line, i) => !(line.trim() === "" && (i === 0 || lines[i - 1]!.trim() === "")));
  return { text: normalizeText(collapsed.join("\n")).trim(), warnings: [...warnings] };
}
