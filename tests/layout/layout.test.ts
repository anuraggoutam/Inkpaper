import { describe, expect, it } from "vitest";
import { layoutDocument, type DocumentLayout, type Measurer } from "@/lib/layout/layout";
import { computeGeometry, PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from "@/lib/layout/geometry";
import { DEFAULT_SETTINGS, type RenderSettings } from "@/lib/validation/schema";
import { EMPTY_METADATA, type AssignmentDocument } from "@/types/document";

/** Deterministic fake font: every character is 0.5em wide. */
const measure: Measurer = (text, fontPx) => Array.from(text).length * fontPx * 0.5;

function doc(text: string, title = ""): AssignmentDocument {
  return { title, sourceFileName: "test.txt", text, metadata: EMPTY_METADATA };
}

function settings(overrides: Partial<RenderSettings> = {}): RenderSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function allText(layout: DocumentLayout): string {
  return layout.pages.flatMap((p) => p.words.map((w) => w.text)).join(" ");
}

function assertInsidePage(layout: DocumentLayout) {
  const g = layout.geometry;
  for (const page of layout.pages) {
    for (const word of page.words) {
      if (word.x < g.textLeft - 0.01) {
        // Question numbers written in the margin must stay between the page edge and the margin line.
        expect(word.x).toBeGreaterThan(0);
        expect(word.x + word.width).toBeLessThan(g.marginLineX);
        continue;
      }
      expect(word.x + word.width).toBeLessThanOrEqual(g.textRight + 0.01);
      expect(word.y).toBeGreaterThan(g.topRuleY);
      expect(word.y).toBeLessThan(g.baselines[g.baselines.length - 1]! + g.pitch * 0.2);
    }
    if (page.pageNumber) {
      expect(page.pageNumber.y - page.pageNumber.size).toBeGreaterThan(g.baselines[g.baselines.length - 1]! + g.fontPx * 0.2);
      expect(page.pageNumber.y).toBeLessThan(PAGE_HEIGHT_PX);
    }
  }
}

const LOREM =
  "Photosynthesis is the process by which green plants use sunlight water and carbon dioxide to make glucose and oxygen in their chloroplasts.";

describe("geometry", () => {
  it("is A4 portrait in CSS pixels", () => {
    expect(PAGE_WIDTH_PX).toBeCloseTo(793.7, 1);
    expect(PAGE_HEIGHT_PX).toBeCloseTo(1122.5, 1);
  });

  it("recomputes lines per page when spacing changes", () => {
    const tight = computeGeometry(settings({ paperType: "ruled", lineHeight: 1.3 }));
    const loose = computeGeometry(settings({ paperType: "ruled", lineHeight: 2.2 }));
    expect(tight.linesPerPage).toBeGreaterThan(loose.linesPerPage);
  });
});

describe("layoutDocument", () => {
  it("lays out a one page document and keeps every word", () => {
    const layout = layoutDocument(doc("Q1. What is photosynthesis?\n" + LOREM), settings(), measure);
    expect(layout.pages).toHaveLength(1);
    expect(allText(layout).replace(/\s+/g, " ")).toBe(("Q1. What is photosynthesis? Ans. " + LOREM).replace(/\s+/g, " "));
    assertInsidePage(layout);
  });

  it('writes "Ans." in the margin on the first line of each answer only', () => {
    const text = "Q1. What is a cell?\n\nA cell is the unit of life.\nIt has a nucleus.\nQ2. Name parts.\n- wall\n- membrane";
    const layout = layoutDocument(doc(text), settings(), measure);
    const g = layout.geometry;
    const ans = layout.pages[0]!.words.filter((w) => w.text === "Ans.");
    expect(ans).toHaveLength(2);
    for (const a of ans) expect(a.x + a.width).toBeLessThan(g.marginLineX);
    const first = layout.pages[0]!.words.find((w) => w.text === "A")!;
    expect(first.y).toBeCloseTo(ans[0]!.y, -1);
    assertInsidePage(layout);
    const off = layoutDocument(doc(text), settings({ answerLabelInMargin: false }), measure);
    expect(off.pages[0]!.words.some((w) => w.text === "Ans.")).toBe(false);
  });

  it("moves a typed Ans: label into the margin instead of writing it twice", () => {
    const layout = layoutDocument(doc("Q1. Why?\nAns: Because.\nAns:"), settings(), measure);
    const g = layout.geometry;
    const words = layout.pages[0]!.words;
    expect(words.filter((w) => w.text.startsWith("Ans"))).toHaveLength(2);
    for (const w of words.filter((w) => w.text === "Ans:")) expect(w.x + w.width).toBeLessThan(g.marginLineX);
    expect(words.map((w) => w.text)).toContain("Because.");
  });

  it("produces a single empty page for an empty document", () => {
    const layout = layoutDocument(doc(""), settings(), measure);
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0]!.words).toHaveLength(0);
  });

  it("flows a paragraph taller than one page across pages without losing text", () => {
    const long = Array.from({ length: 120 }, () => LOREM).join(" ");
    const layout = layoutDocument(doc(long), settings(), measure);
    expect(layout.pages.length).toBeGreaterThan(1);
    expect(allText(layout)).toBe(long.split(/\s+/).join(" "));
    assertInsidePage(layout);
  });

  it("handles a 10+ page assignment with questions without clipping", () => {
    const parts: string[] = [];
    for (let i = 1; i <= 40; i++) parts.push(`Q${i}. Explain topic number ${i} in detail?`, LOREM, LOREM, "");
    const layout = layoutDocument(doc(parts.join("\n"), "Biology Assignment"), settings({ showStudentHeader: true }), measure);
    expect(layout.pages.length).toBeGreaterThanOrEqual(10);
    assertInsidePage(layout);
    for (let i = 1; i <= 40; i++) expect(allText(layout)).toContain(`Q${i}.`);
  });

  it("splits very long words so they never overflow", () => {
    const word = "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(6);
    const layout = layoutDocument(doc(word), settings({ variation: 1 }), measure);
    expect(layout.pages[0]!.words.length).toBeGreaterThan(1);
    expect(allText(layout).replace(/ /g, "")).toBe(word);
    assertInsidePage(layout);
  });

  it("keeps empty paragraphs as blank ruled lines", () => {
    const layout = layoutDocument(doc("first\n\n\nsecond"), settings({ variation: 0 }), measure);
    const [a, b] = layout.pages[0]!.words;
    expect(Math.round((b!.y - a!.y) / layout.geometry.pitch)).toBe(3);
  });

  it("detects numbered questions and colours them with the question ink", () => {
    const layout = layoutDocument(doc("1. What is DNA?\nDNA is a molecule."), settings({ variation: 0, inkColor: "blue", questionInk: "red" }), measure);
    const words = layout.pages[0]!.words;
    expect(words[0]!.color).not.toBe(words[words.length - 1]!.color);
  });

  it("does not strand a question at the bottom of a page", () => {
    const g = computeGeometry(settings());
    const filler = Array.from({ length: g.linesPerPage - 1 }, (_, i) => `line ${i}`);
    const text = [...filler, "Q9. A question that should move?", "Its answer."].join("\n");
    const layout = layoutDocument(doc(text), settings({ gapBeforeQuestions: false }), measure);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[1]!.words[0]!.text).toBe("Q9.");
    // No spacer line at the top of the new page.
    expect(Math.abs(layout.pages[1]!.words[0]!.y - g.baselines[0]!)).toBeLessThan(g.pitch * 0.2);
  });

  it("writes question numbers in the margin, left of the margin line", () => {
    // The fake font is wide (0.5em per char), so give it a roomy margin.
    const layout = layoutDocument(doc("Q1 a). Design an algorithm.\nAnswer text."), settings({ marginMm: 35 }), measure);
    const g = layout.geometry;
    const [q1, a] = layout.pages[0]!.words;
    expect(q1!.text).toBe("Q1");
    expect(a!.text).toBe("a).");
    expect(a!.x + a!.width).toBeLessThan(g.marginLineX);
    const design = layout.pages[0]!.words.find((w) => w.text === "Design")!;
    expect(design.x).toBeGreaterThanOrEqual(g.textLeft);
    expect(design.y).toBeCloseTo(q1!.y, -1);
    assertInsidePage(layout);
  });

  it("keeps the question number inline when the margin is off or too narrow", () => {
    const off = layoutDocument(doc("Q1. Define force."), settings({ questionNumberInMargin: false }), measure);
    expect(off.pages[0]!.words[0]!.x).toBeGreaterThanOrEqual(off.geometry.textLeft);
    const narrow = layoutDocument(doc("Question 12 (iii): Define force."), settings({ marginMm: 10, fontSizePt: 32 }), measure);
    expect(narrow.pages[0]!.words[0]!.x).toBeGreaterThanOrEqual(narrow.geometry.textLeft);
    expect(narrow.pages[0]!.words.map((w) => w.text).join(" ")).toBe("Question 12 (iii): Define force.");
  });

  it("writes topic and date inside the practical-file header box on page 1 only", () => {
    const d = { ...doc("Q1. Aim?\n" + Array.from({ length: 80 }, () => LOREM).join("\n"), "Prime sieve"), metadata: { ...EMPTY_METADATA, date: "10/10/26" } };
    const layout = layoutDocument(d, settings({ paperType: "practical", showStudentHeader: true }), measure);
    const p = layout.geometry.practical!;
    const header = layout.pages[0]!.headerWords;
    expect(header.map((w) => w.text)).toEqual(["Prime", "sieve", "10/10/26"]);
    for (const w of header) {
      expect(w.y).toBeGreaterThan(p.boxY1);
      expect(w.y).toBeLessThan(p.boxY2);
    }
    expect(header[1]!.x + header[1]!.width).toBeLessThanOrEqual(p.topicLineX2 + 0.01);
    expect(header[2]!.x + header[2]!.width).toBeLessThanOrEqual(p.dateLineX2 + 0.01);
    // Not repeated in the body, and only on the first page.
    expect(allText(layout)).not.toContain("Prime sieve");
    expect(allText(layout)).not.toContain("Date:");
    expect(layout.pages[1]!.headerWords).toEqual([]);
    expect(layout.geometry.topRuleY).toBeCloseTo(p.topRuleY2);
    assertInsidePage(layout);
  });

  it("gives a practical-file page exactly the chosen number of writing lines", () => {
    const g = computeGeometry(settings({ paperType: "practical" }));
    expect(g.linesPerPage).toBe(30);
    expect(g.baselines).toHaveLength(30);
    expect(g.baselines[29]! / (PAGE_HEIGHT_PX / 297)).toBeCloseTo(282, 1);
    expect(g.pageNumberY).toBeLessThan(PAGE_HEIGHT_PX);
    // Font size doesn't change the line count; the line count changes the spacing.
    expect(computeGeometry(settings({ paperType: "practical", fontSizePt: 24 })).linesPerPage).toBe(30);
    expect(computeGeometry(settings({ paperType: "practical", practicalLines: 25 })).pitch).toBeGreaterThan(g.pitch);
    // 30 lines of text fill one page; the 31st starts page 2.
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");
    expect(layoutDocument(doc(lines(30)), settings({ paperType: "practical" }), measure).pages).toHaveLength(1);
    expect(layoutDocument(doc(lines(31)), settings({ paperType: "practical" }), measure).pages).toHaveLength(2);
  });

  it("falls back to a body heading when the topic is too long for the box", () => {
    const title = "A very long practical topic about designing and analysing efficient algorithms for prime numbers";
    const layout = layoutDocument(doc("Answer.", title), settings({ paperType: "practical" }), measure);
    expect(layout.pages[0]!.headerWords).toEqual([]);
    expect(allText(layout)).toContain(title);
  });

  it("does not create an extra page when content ends exactly at the page boundary", () => {
    const g = computeGeometry(settings());
    const text = Array.from({ length: g.linesPerPage }, (_, i) => `line ${i}`).join("\n") + "\n\n\n";
    const layout = layoutDocument(doc(text), settings(), measure);
    expect(layout.pages).toHaveLength(1);
    const next = layoutDocument(doc(text + "one more"), settings(), measure);
    expect(next.pages).toHaveLength(2);
  });

  it("is deterministic and variation 0 is perfectly clean", () => {
    const a = layoutDocument(doc(LOREM), settings(), measure);
    const b = layoutDocument(doc(LOREM), settings(), measure);
    expect(a.pages).toEqual(b.pages);
    const clean = layoutDocument(doc(LOREM), settings({ variation: 0 }), measure);
    const g = clean.geometry;
    for (const word of clean.pages[0]!.words) {
      expect(word.rotate).toBe(0);
      expect(g.baselines).toContainEqual(word.y);
      expect(word.opacity).toBe(1);
    }
  });

  it("never overlaps words or lines at maximum variation", () => {
    const layout = layoutDocument(doc(Array.from({ length: 30 }, () => LOREM).join("\n")), settings({ variation: 1 }), measure);
    const g = layout.geometry;
    for (const page of layout.pages) {
      const sorted = [...page.words].sort((a, b) => a.y - b.y || a.x - b.x);
      for (const word of sorted) {
        // Baseline drift stays well within a line pitch.
        const nearest = g.baselines.reduce((best, y) => (Math.abs(y - word.y) < Math.abs(best - word.y) ? y : best));
        expect(Math.abs(nearest - word.y)).toBeLessThan(g.pitch * 0.15);
      }
    }
    assertInsidePage(layout);
  });
});
