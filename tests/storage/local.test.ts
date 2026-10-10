import { beforeEach, describe, expect, it } from "vitest";
import { loadDraft, loadRememberWork, loadSettings, saveDraft, saveRememberWork, saveSettings } from "@/lib/storage/local";
import { DEFAULT_SETTINGS } from "@/lib/validation/schema";
import { EMPTY_METADATA, type AssignmentDocument } from "@/types/document";

/** Minimal in-memory localStorage for the node test environment. */
function installStorage(): Map<string, string> {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
  };
  (globalThis as unknown as { window: { localStorage: typeof storage } }).window = { localStorage: storage };
  return data;
}

const doc: AssignmentDocument = {
  title: "Lab 4",
  sourceFileName: "",
  text: "Q1. Define osmosis.\nMovement of water across a membrane.",
  metadata: { ...EMPTY_METADATA, studentName: "Asha", rollNumber: "21" },
};

let data: Map<string, string>;
beforeEach(() => {
  data = installStorage();
});

describe("settings storage", () => {
  it("round-trips settings and falls back to defaults for junk", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, fontId: "kalam", fontSizePt: 20 });
    expect(loadSettings()).toMatchObject({ fontId: "kalam", fontSizePt: 20 });
    data.set("inkpaper.settings.v2", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates v1 settings to the practical-file paper", () => {
    data.set("inkpaper.settings.v1", JSON.stringify({ fontId: "kalam", paperType: "ruled", marginMm: 15 }));
    expect(loadSettings()).toMatchObject({ fontId: "kalam", paperType: "practical", marginMm: DEFAULT_SETTINGS.marginMm });
  });
});

describe("draft storage", () => {
  it("is off by default", () => {
    expect(loadRememberWork()).toBe(false);
    expect(loadDraft()).toBeNull();
  });

  it("restores the saved document, including student details", () => {
    saveRememberWork(true);
    saveDraft(doc);
    expect(loadRememberWork()).toBe(true);
    expect(loadDraft()?.document).toEqual(doc);
  });

  it("deletes the draft when the user turns remembering off", () => {
    saveRememberWork(true);
    saveDraft(doc);
    saveRememberWork(false);
    expect(loadDraft()).toBeNull();
    expect([...data.keys()]).not.toContain("inkpaper.draft.v1");
  });

  it("ignores a corrupted or oversized draft", () => {
    data.set("inkpaper.draft.v1", JSON.stringify({ savedAt: 1, document: { title: 5 } }));
    expect(loadDraft()).toBeNull();
    data.set("inkpaper.draft.v1", JSON.stringify({ savedAt: 1, document: { ...doc, title: "x".repeat(500) } }));
    expect(loadDraft()).toBeNull();
  });
});
