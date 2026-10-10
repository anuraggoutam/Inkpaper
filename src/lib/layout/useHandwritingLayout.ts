"use client";

import { useEffect, useMemo, useState } from "react";
import { layoutDocument, type DocumentLayout } from "@/lib/layout/layout";
import { createCanvasMeasurer, loadFonts } from "@/lib/layout/measure";
import type { RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument } from "@/types/document";

export interface LayoutState {
  layout: DocumentLayout | null;
  fontError: string | null;
}

/** Loads the selected handwriting font, then measures and paginates the document with it. */
export function useHandwritingLayout(doc: AssignmentDocument, settings: RenderSettings): LayoutState {
  const [fontsReadyFor, setFontsReadyFor] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);

  const needsDevanagari = /[ऀ-ॿ]/.test(doc.text);
  const needsExtended = /[Ā-˿Ḁ-ỿ]/u.test(doc.text);
  const fontKey = `${settings.fontId}|${needsDevanagari}|${needsExtended}`;

  useEffect(() => {
    let cancelled = false;
    const sample = `${needsDevanagari ? "क" : ""}${needsExtended ? (doc.text.match(/[Ā-˿Ḁ-ỿ]/u)?.[0] ?? "") : ""}`;
    loadFonts(settings.fontId, sample)
      .then(() => {
        if (!cancelled) {
          setFontError(null);
          setFontsReadyFor(fontKey);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFontError(error instanceof Error ? error.message : "The handwriting font failed to load.");
          setFontsReadyFor(fontKey);
        }
      });
    return () => {
      cancelled = true;
    };
    // doc.text is only used to pick sample glyphs; fontKey captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey, settings.fontId]);

  const ready = fontsReadyFor === fontKey;
  const fresh = useMemo(() => {
    if (!ready) return null;
    return layoutDocument(doc, settings, createCanvasMeasurer(settings.fontId));
  }, [ready, doc, settings]);

  // While a newly selected font loads, keep showing the previous pages instead of flashing empty.
  const [previous, setPrevious] = useState<DocumentLayout | null>(null);
  if (fresh && fresh !== previous) setPrevious(fresh);

  return { layout: fresh ?? previous, fontError };
}
