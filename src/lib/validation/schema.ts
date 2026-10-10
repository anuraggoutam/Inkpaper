import { z } from "zod";
import { DEFAULT_FONT_ID, FONT_IDS } from "@/lib/handwriting/fonts";

export const LIMITS = {
  fontSizePt: { min: 10, max: 32 },
  lineHeight: { min: 1.2, max: 2.4 },
  marginMm: { min: 10, max: 40 },
  practicalLines: { min: 20, max: 40 },
  textChars: 400_000,
  fieldChars: 200,
} as const;

export const renderSettingsSchema = z.object({
  fontId: z.enum(FONT_IDS),
  fontSizePt: z.number().min(LIMITS.fontSizePt.min).max(LIMITS.fontSizePt.max),
  lineHeight: z.number().min(LIMITS.lineHeight.min).max(LIMITS.lineHeight.max),
  inkColor: z.enum(["blue", "black"]),
  questionInk: z.enum(["same", "blue", "black", "red"]),
  paperType: z.enum(["practical", "ruled", "plain"]),
  marginMm: z.number().min(LIMITS.marginMm.min).max(LIMITS.marginMm.max),
  variation: z.number().min(0).max(1),
  seed: z.number().int().min(0).max(999_999),
  showPageNumbers: z.boolean(),
  showStudentHeader: z.boolean(),
  showMarginLine: z.boolean(),
  numberedLinesAreQuestions: z.boolean(),
  gapBeforeQuestions: z.boolean(),
  questionNumberInMargin: z.boolean(),
  answerLabelInMargin: z.boolean(),
  /** Number of ruled writing lines on a practical-file page (fixes the line spacing). */
  practicalLines: z.number().int().min(LIMITS.practicalLines.min).max(LIMITS.practicalLines.max),
});

export type RenderSettings = z.infer<typeof renderSettingsSchema>;

export const DEFAULT_SETTINGS: RenderSettings = {
  fontId: DEFAULT_FONT_ID,
  fontSizePt: 17,
  lineHeight: 1.75,
  inkColor: "blue",
  questionInk: "black",
  paperType: "practical",
  marginMm: 27,
  variation: 0.75,
  seed: 1234,
  showPageNumbers: true,
  showStudentHeader: false,
  showMarginLine: true,
  numberedLinesAreQuestions: true,
  gapBeforeQuestions: true,
  questionNumberInMargin: true,
  answerLabelInMargin: true,
  practicalLines: 30,
};

const field = z.string().max(LIMITS.fieldChars);

export const documentSchema = z.object({
  title: field,
  sourceFileName: field,
  text: z.string().max(LIMITS.textChars),
  metadata: z.object({
    studentName: field,
    rollNumber: field,
    course: field,
    subject: field,
    date: field,
  }),
});

export const exportPayloadSchema = z.object({
  document: documentSchema,
  settings: renderSettingsSchema,
});

export type ExportPayload = z.infer<typeof exportPayloadSchema>;

/** Merge possibly stale/partial stored settings with defaults, dropping anything invalid. */
export function coerceSettings(input: unknown): RenderSettings {
  if (typeof input !== "object" || input === null) return DEFAULT_SETTINGS;
  const merged = { ...DEFAULT_SETTINGS, ...(input as Record<string, unknown>) };
  const parsed = renderSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
