"use client";

import { useEffect, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { loadDraft, loadRememberWork, loadSettings, saveDraft, saveRememberWork, saveSettings } from "@/lib/storage/local";
import { DEFAULT_SETTINGS, type RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument } from "@/types/document";

/** Style settings, restored from and saved to this browser. */
export function usePersistentSettings(): [RenderSettings, Dispatch<SetStateAction<RenderSettings>>] {
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);

  // Read storage after mount so the server-rendered HTML always matches the first client render.
  useEffect(() => {
    setSettings(loadSettings());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) saveSettings(settings);
  }, [settings]);

  return [settings, setSettings];
}

const DRAFT_SAVE_DELAY_MS = 600;

/**
 * Opt-in draft storage. When enabled, the document is restored on the next visit and saved
 * shortly after every change. Turning it off deletes the stored draft.
 */
export function useDraft(doc: AssignmentDocument, onRestore: (doc: AssignmentDocument) => void) {
  const [rememberWork, setRememberWorkState] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const ready = useRef(false);
  const restore = useRef(onRestore);
  restore.current = onRestore;

  useEffect(() => {
    const remember = loadRememberWork();
    setRememberWorkState(remember);
    const draft = remember ? loadDraft() : null;
    if (draft) {
      restore.current(draft.document);
      setSavedAt(draft.savedAt);
    }
    ready.current = true;
  }, []);

  useEffect(() => {
    if (!ready.current || !rememberWork) return;
    const timer = window.setTimeout(() => {
      saveDraft(doc);
      setSavedAt(Date.now());
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, rememberWork]);

  const setRememberWork = (remember: boolean) => {
    saveRememberWork(remember);
    setRememberWorkState(remember);
    if (remember) {
      saveDraft(doc);
      setSavedAt(Date.now());
    } else {
      setSavedAt(null);
    }
  };

  return { rememberWork, setRememberWork, savedAt };
}

/** Window-wide file drag and drop. `dragging` is true while files hover over the window. */
export function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  const handlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current++;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) onFile(file);
    },
  };

  return { dragging, handlers };
}
