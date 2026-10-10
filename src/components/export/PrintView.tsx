"use client";

import { useEffect, useState } from "react";
import { PageSvg } from "@/components/preview/PageSvg";
import { layoutDocument, type DocumentLayout } from "@/lib/layout/layout";
import { createCanvasMeasurer, loadFonts } from "@/lib/layout/measure";
import { exportPayloadSchema, type RenderSettings } from "@/lib/validation/schema";

declare global {
  interface Window {
    __INKPAPER_PAYLOAD__?: unknown;
    __INKPAPER_STATUS__?: { ok: true; pages: number } | { ok: false; error: string };
  }
}

/**
 * Print renderer: reads the validated payload injected by the export route, waits for the
 * handwriting fonts, then runs the exact same layout + SVG renderer as the on-screen preview.
 */
export function PrintView() {
  const [result, setResult] = useState<{ layout: DocumentLayout; settings: RenderSettings } | null>(null);

  useEffect(() => {
    const parsed = exportPayloadSchema.safeParse(window.__INKPAPER_PAYLOAD__);
    if (!parsed.success) {
      window.__INKPAPER_STATUS__ = { ok: false, error: "Invalid export payload." };
      return;
    }
    const { document: doc, settings } = parsed.data;
    loadFonts(settings.fontId, doc.text)
      .then(() => {
        const layout = layoutDocument(doc, settings, createCanvasMeasurer(settings.fontId));
        setResult({ layout, settings });
      })
      .catch((error: unknown) => {
        window.__INKPAPER_STATUS__ = { ok: false, error: error instanceof Error ? error.message : "Font loading failed." };
      });
  }, []);

  useEffect(() => {
    if (!result) return;
    // Signal readiness only after the pages are in the DOM and fonts are settled.
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        window.__INKPAPER_STATUS__ = { ok: true, pages: result.layout.pages.length };
      });
    });
  }, [result]);

  if (!result) return null;
  return (
    <div className="print-root">
      {result.layout.pages.map((page) => (
        <div className="print-page" key={page.index}>
          <PageSvg page={page} geometry={result.layout.geometry} settings={result.settings} mode="print" />
        </div>
      ))}
    </div>
  );
}
