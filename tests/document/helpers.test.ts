import { describe, expect, it } from "vitest";
import { formatSheetDate } from "@/lib/document/date";
import { nextQuestionNumber, parseTextToBlocks } from "@/lib/document/parseText";

const next = (text: string, numberedLinesAreQuestions = true) => nextQuestionNumber(parseTextToBlocks(text, { numberedLinesAreQuestions }));

describe("nextQuestionNumber", () => {
  it("starts at 1 for an empty page", () => {
    expect(next("")).toBe(1);
    expect(next("Just an answer.")).toBe(1);
  });

  it("continues after the highest number, not the count", () => {
    expect(next("Q1. First\nanswer\n\nQ3. Third")).toBe(4);
    expect(next("Q5. Late start")).toBe(6);
  });

  it("understands every question style, sub-parts and margin labels", () => {
    expect(next("Q.2) two\nQuestion 7: seven")).toBe(8);
    expect(next("Q4 (b) part b")).toBe(5);
    expect(next("Q9» Explain")).toBe(10);
  });

  it("counts plain numbered lines only when they are treated as questions", () => {
    expect(next("1. one\n2. two")).toBe(3);
    expect(next("1. one\n2. two", false)).toBe(1);
  });
});

describe("formatSheetDate", () => {
  it("writes DD/MM/YYYY with leading zeros", () => {
    expect(formatSheetDate(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formatSheetDate(new Date(2026, 9, 10))).toBe("10/10/2026");
  });
});
