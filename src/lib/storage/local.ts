import { z } from "zod";
import { coerceSettings, DEFAULT_SETTINGS, documentSchema, type RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument } from "@/types/document";

/**
 * Everything InkPaper keeps between visits lives in this browser's localStorage.
 * Style settings are always remembered. The draft (text, title and student details) is
 * only stored after the user turns on "Keep my work in this browser".
 */
const KEYS = {
  settings: "inkpaper.settings.v2",
  oldSettings: "inkpaper.settings.v1",
  rememberWork: "inkpaper.rememberWork",
  draft: "inkpaper.draft.v1",
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage may be full or disabled; nothing else to do */
  }
}

function readJson(key: string): unknown {
  const raw = read(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function loadSettings(): RenderSettings {
  const stored = readJson(KEYS.settings);
  if (stored !== undefined) return coerceSettings(stored);
  const old = readJson(KEYS.oldSettings);
  // v1 → v2: keep the user's choices but switch to the practical-file paper default.
  if (typeof old === "object" && old !== null) {
    return coerceSettings({ ...old, paperType: "practical", marginMm: DEFAULT_SETTINGS.marginMm });
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: RenderSettings): void {
  write(KEYS.settings, JSON.stringify(settings));
}

export function loadRememberWork(): boolean {
  return read(KEYS.rememberWork) === "1";
}

/** Turning this off also deletes the stored draft, so nothing is left behind. */
export function saveRememberWork(remember: boolean): void {
  write(KEYS.rememberWork, remember ? "1" : null);
  if (!remember) write(KEYS.draft, null);
}

const draftSchema = z.object({
  savedAt: z.number(),
  document: documentSchema,
});

export interface Draft {
  savedAt: number;
  document: AssignmentDocument;
}

export function loadDraft(): Draft | null {
  const parsed = draftSchema.safeParse(readJson(KEYS.draft));
  return parsed.success ? parsed.data : null;
}

export function saveDraft(document: AssignmentDocument): void {
  const draft: Draft = { savedAt: Date.now(), document };
  write(KEYS.draft, JSON.stringify(draft));
}
