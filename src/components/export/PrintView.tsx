"use client";

import { useEffect, useState } from "react";
import { PageSvg } from "@/components/preview/PageSvg";
import { layoutDocument, type DocumentLayout } from "@/lib/layout/layout";
import { createCanvasMeasurer, loadFonts } from "@/lib/layout/measure";
import { safePdfFileName } from "@/lib/pdf/filename";
import { exportPayloadSchema, type RenderSettings } from "@/lib/validation/schema";

declare global {
  interface Window {
    __INKPAPER_PAYLOAD__?: unknown;
    __INKPAPER_STATUS__?: { ok: true; pages: number } | { ok: false; error: string };
  }
}

/** Payload from the export route (headless Chromium) or from the studio page hosting this iframe. */
function readPayload(): unknown {
  if (window.__INKPAPER_PAYLOAD__ !== undefined) return window.__INKPAPER_PAYLOAD__;
  try {
    return window.parent !== window ? window.parent.__INKPAPER_PRINT_PAYLOAD__ : undefined;
  } catch {
    return undefined; // different origin: never trust it
  }
}

/**
 * Print renderer: validates the payload, waits for the handwriting fonts, then runs the exact
 * same layout + SVG renderer as the on-screen preview.
 */
export function PrintView() {
  const [result, setResult] = useState<{ layout: DocumentLayout; settings: RenderSettings; fileTitle: string } | null>(null);

  useEffect(() => {
    const parsed = exportPayloadSchema.safeParse(readPayload());
    if (!parsed.success) {
      window.__INKPAPER_STATUS__ = { ok: false, error: "Invalid export payload." };
      return;
    }
    const { document: doc, settings } = parsed.data;
    loadFonts(settings.fontId, doc.text)
      .then(() => {
        const layout = layoutDocument(doc, settings, createCanvasMeasurer(settings.fontId));
        setResult({ layout, settings, fileTitle: safePdfFileName(doc.title).replace(/\.pdf$/, "") });
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
        // Browsers suggest the document title as the PDF file name (set late so Next's metadata doesn't override it).
        document.title = result.fileTitle;
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
