import { DEVANAGARI_FALLBACK, fontStack, getFont } from "@/lib/handwriting/fonts";
import type { Measurer } from "@/lib/layout/layout";

const REFERENCE_PX = 100;
let canvas: HTMLCanvasElement | null = null;
const caches = new Map<string, Map<string, number>>();

/**
 * Canvas-based measurer using the exact same font stack as the SVG renderer.
 * Widths are measured once at a reference size and scaled linearly.
 */
export function createCanvasMeasurer(fontId: string): Measurer {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  const font = `${REFERENCE_PX}px ${fontStack(fontId)}`;
  let cache = caches.get(fontId);
  if (!cache) {
    cache = new Map();
    caches.set(fontId, cache);
  }
  const widths = cache;
  return (text, fontPx) => {
    let width = widths.get(text);
    if (width === undefined) {
      ctx.font = font;
      // Match the SVG renderer's unhinted text (Chromium supports CanvasRenderingContext2D.textRendering).
      if ("textRendering" in ctx) (ctx as CanvasRenderingContext2D & { textRendering: string }).textRendering = "geometricPrecision";
      width = ctx.measureText(text).width;
      widths.set(text, width);
    }
    return (width * fontPx) / REFERENCE_PX;
  };
}

/** Load the selected handwriting font (and Devanagari fallback if needed) before measuring. */
export async function loadFonts(fontId: string, sampleText: string): Promise<void> {
  const family = getFont(fontId).family;
  const loads = [document.fonts.load(`20px "${family}"`, "AaQq1")];
  if (/[ऀ-ॿ]/.test(sampleText)) loads.push(document.fonts.load(`20px "${DEVANAGARI_FALLBACK.family}"`, "क"));
  // Latin-extended subsets load lazily via unicode-range; request them when used.
  const extended = sampleText.match(/[Ā-˿Ḁ-ỿ]/u);
  if (extended) loads.push(document.fonts.load(`20px "${family}"`, extended[0]));
  const loaded = await Promise.all(loads);
  if (loaded[0]!.length === 0) {
    throw new Error(`Handwriting font "${family}" could not be loaded from /fonts.`);
  }
  // Fonts changed: drop widths measured with a fallback font.
  caches.delete(fontId);
  await document.fonts.ready;
}
