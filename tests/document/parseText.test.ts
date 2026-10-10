import { describe, expect, it } from "vitest";
import { findAnswerStarts, parseTextToBlocks, splitQuestionLabel } from "@/lib/document/parseText";
import { checkCoverage } from "@/lib/handwriting/coverage";
import { coerceSettings, DEFAULT_SETTINGS, exportPayloadSchema } from "@/lib/validation/schema";
import { safePdfFileName } from "@/lib/pdf/filename";

const opts = { numberedLinesAreQuestions: true };

describe("parseTextToBlocks", () => {
  it("detects questions, headings, lists and paragraphs", () => {
    const blocks = parseTextToBlocks(
      ["# Unit 1", "Q1. What is a cell?", "A cell is the basic unit.", "- nucleus", "  - nucleolus", "(a) plant cell", "Question 2: Define osmosis", "3) Explain"].join("\n"),
      opts,
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "question", "paragraph", "list", "list", "list", "question", "question"]);
    expect(blocks[0]!.text).toBe("Unit 1");
    expect(blocks[3]).toMatchObject({ listKind: "unordered", text: "nucleus", level: 0 });
    expect(blocks[4]).toMatchObject({ level: 1 });
    expect(blocks[5]).toMatchObject({ listKind: "ordered", text: "(a) plant cell" });
  });

  it("keeps original question text intact", () => {
    const [block] = parseTextToBlocks("Q.4) Why is the sky blue?", opts);
    expect(block).toMatchObject({ type: "question", text: "Q.4) Why is the sky blue?" });
  });

  it("does not treat decimals or words starting with Q as questions", () => {
    const blocks = parseTextToBlocks("1.5 litres of water\nQuick sort is fast", opts);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("respects the numbered-question toggle", () => {
    const [block] = parseTextToBlocks("1. Define force", { numberedLinesAreQuestions: false });
    expect(block!.type).toBe("paragraph");
  });

  it("handles Windows newlines, blank lines and trailing blanks", () => {
    const blocks = parseTextToBlocks("a\r\n\r\nb\r\n\r\n\r\n", opts);
    expect(blocks.map((b) => b.text)).toEqual(["a", "", "b"]);
  });
});

describe("splitQuestionLabel", () => {
  it.each([
    ["Q1 a). Design an algorithm", "Q1 a).", "Design an algorithm"],
    ["Q1. What is a cell?", "Q1.", "What is a cell?"],
    ["Q.2(b) Explain", "Q.2(b)", "Explain"],
    ["Question 3: Define", "Question 3:", "Define"],
    ["4. List two uses", "4.", "List two uses"],
    ["Q5 A train travels", "Q5", "A train travels"],
    ["Q2 ii) Prove", "Q2 ii)", "Prove"],
  ])("%s", (text, label, rest) => {
    expect(splitQuestionLabel(text)).toEqual({ label, rest });
  });

  it("returns null when there is no number", () => {
    expect(splitQuestionLabel("Q: why?")).toBeNull();
  });
});

describe("margin labels (label» text)", () => {
  it("parses custom labels and classifies the rest", () => {
    const blocks = parseTextToBlocks("Q7» What is DNA?\nSol» It is a molecule.\n» no label here\nNote» - bullet", opts);
    expect(blocks[0]).toMatchObject({ type: "question", text: "What is DNA?", marginLabel: "Q7" });
    expect(blocks[1]).toMatchObject({ type: "paragraph", text: "It is a molecule.", marginLabel: "Sol" });
    expect(blocks[2]).toMatchObject({ type: "paragraph", text: "no label here", marginLabel: "" });
    expect(blocks[3]).toMatchObject({ type: "list", text: "bullet", marginLabel: "Note" });
  });

  it("custom labels replace the automatic Ans.", () => {
    const blocks = parseTextToBlocks("Q1. Why?\nSol» Because.\nQ2. How?\n» Like this.\nQ3. What?\nThat.", opts);
    const starts = findAnswerStarts(blocks);
    expect([...starts.keys()].map((i) => blocks[i]!.text)).toEqual(["That."]);
  });
});

describe("findAnswerStarts", () => {
  it("marks the first answer line after each question and typed Ans labels", () => {
    const blocks = parseTextToBlocks("Q1. a?\n\nfirst\nsecond\n# Heading\npara\nQ2. b?\n- item\nAnswer: typed\nAns no-colon", opts);
    const starts = findAnswerStarts(blocks);
    expect([...starts.entries()].map(([i, label]) => [blocks[i]!.text, label])).toEqual([
      ["first", null],
      ["item", null],
      ["Answer: typed", "Answer:"],
      ["Ans no-colon", "Ans"],
    ]);
  });
});

describe("coverage", () => {
  it("accepts Latin text and flags unsupported symbols", () => {
    expect(checkCoverage("Hello, world! café", "caveat").unsupported).toEqual([]);
    expect(checkCoverage("Area = πr²", "caveat").unsupported).toEqual(["π"]);
  });

  it("reports Devanagari as handled by the fallback", () => {
    const report = checkCoverage("नमस्ते", "caveat");
    expect(report.hasDevanagari).toBe(true);
    expect(report.unsupported).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects unknown fonts and out-of-range values", () => {
    const document = { title: "", sourceFileName: "", text: "x", metadata: { studentName: "", rollNumber: "", course: "", subject: "", date: "" } };
    expect(exportPayloadSchema.safeParse({ document, settings: DEFAULT_SETTINGS }).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ document, settings: { ...DEFAULT_SETTINGS, fontId: "Arial; color:red" } }).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ document, settings: { ...DEFAULT_SETTINGS, marginMm: 500 } }).success).toBe(false);
  });

  it("coerces stale stored settings back to defaults", () => {
    expect(coerceSettings({ fontSizePt: 999 })).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings({ inkColor: "black" }).inkColor).toBe("black");
  });

  it("sanitises download file names", () => {
    expect(safePdfFileName("")).toBe("assignment-handwritten.pdf");
    expect(safePdfFileName('Physics: Lab/Report <1>?')).toBe("physics-lab-report-1-handwritten.pdf");
    expect(safePdfFileName("..\\..\\etc")).toBe("etc-handwritten.pdf");
  });
});
