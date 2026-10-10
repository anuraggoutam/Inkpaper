"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PageSvg } from "@/components/preview/PageSvg";
import type { DocumentLayout } from "@/lib/layout/layout";
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from "@/lib/layout/geometry";
import type { RenderSettings } from "@/lib/validation/schema";

type Zoom = "fit" | number;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

interface PreviewPaneProps {
  layout: DocumentLayout | null;
  settings: RenderSettings;
  caretLine: number | null;
  isEmpty: boolean;
  onTrySample: () => void;
}

export function PreviewPane({ layout, settings, caretLine, isEmpty, onTrySample }: PreviewPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [containerWidth, setContainerWidth] = useState(800);
  const [currentPage, setCurrentPage] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Measure before first paint so the page never renders at a stale default width.
    setContainerWidth(el.clientWidth - 48);
    const observer = new ResizeObserver(([entry]) => entry && setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.max(0.3, Math.min(1.6, (containerWidth - 48) / PAGE_WIDTH_PX));
  const scale = zoom === "fit" ? fitScale : zoom;
  const pageCount = layout?.pages.length ?? 0;

  // Where the caret's source line landed in the handwritten pages.
  const caretTarget = useMemo(() => {
    if (caretLine == null || !layout) return null;
    for (const page of layout.pages) {
      const hit = page.lines.find((line) => line.sourceLine === caretLine);
      if (hit) return { page: page.index, y: hit.y };
    }
    return null;
  }, [caretLine, layout]);

  // Follow the cursor: keep the line being edited visible in the preview.
  useEffect(() => {
    const container = scrollRef.current;
    const pageEl = caretTarget ? pageRefs.current[caretTarget.page] : null;
    if (!container || !pageEl || !caretTarget) return;
    const lineTop = pageEl.offsetTop + (caretTarget.y / PAGE_HEIGHT_PX) * pageEl.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (lineTop < viewTop + 60 || lineTop > viewBottom - 60) {
      container.scrollTo({ top: Math.max(0, lineTop - container.clientHeight / 2), behavior: "smooth" });
    }
  }, [caretTarget]);

  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const middle = container.scrollTop + container.clientHeight / 3;
    let index = 0;
    pageRefs.current.forEach((el, i) => {
      if (el && el.offsetTop <= middle) index = i;
    });
    setCurrentPage(index);
  };

  const goTo = (index: number) => {
    const el = pageRefs.current[index];
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
  };

  const zoomIndex = zoom === "fit" ? ZOOM_STEPS.findIndex((s) => s >= fitScale) : ZOOM_STEPS.indexOf(zoom);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2 text-xs text-muted">
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="font-medium text-ink">Handwritten preview</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden tabular-nums sm:inline">
            {pageCount > 0 ? `Page ${Math.min(currentPage + 1, pageCount)} of ${pageCount}` : "Loading font…"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Previous page" disabled={currentPage <= 0} onClick={() => goTo(currentPage - 1)}>
            ‹
          </IconButton>
          <IconButton label="Next page" disabled={currentPage >= pageCount - 1} onClick={() => goTo(currentPage + 1)}>
            ›
          </IconButton>
          <span className="mx-1 h-4 w-px bg-line" />
          <IconButton label="Zoom out" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIndex - 1)]!)}>
            −
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            className={`min-w-[52px] rounded-md px-1.5 py-1 tabular-nums hover:bg-white ${zoom === "fit" ? "text-accent" : "text-ink"}`}
            title="Fit page width"
          >
            {zoom === "fit" ? "Fit" : `${Math.round(scale * 100)}%`}
          </button>
          <IconButton
            label="Zoom in"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1 && zoom !== "fit"}
            onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoom === "fit" ? Math.max(0, zoomIndex) : zoomIndex + 1)]!)}
          >
            +
          </IconButton>
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto bg-canvas px-6 py-6">
        {isEmpty && (
          <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-6">
            <div className="pointer-events-auto max-w-sm rounded-xl border border-line bg-white/95 px-5 py-4 text-center shadow-sm">
              <p className="text-sm font-medium text-ink">Your handwritten pages appear here</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Type or paste on the page at the left, or import a PDF, DOCX or TXT file. Every line is written out as you type.
              </p>
              <button type="button" onClick={onTrySample} className="mt-3 text-xs font-medium text-accent hover:underline">
                Try a sample assignment
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto flex flex-col items-center gap-6" style={{ width: PAGE_WIDTH_PX * scale }}>
          {layout?.pages.map((page) => (
            <div
              key={page.index}
              ref={(el) => {
                pageRefs.current[page.index] = el;
              }}
              className="relative w-full bg-white shadow-[0_1px_2px_rgba(30,42,68,0.08),0_10px_30px_-14px_rgba(30,42,68,0.35)]"
              style={{ aspectRatio: "210 / 297" }}
            >
              <PageSvg
                page={page}
                geometry={layout.geometry}
                settings={settings}
                mode="screen"
                highlightY={caretTarget?.page === page.index ? caretTarget.y : null}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-base text-ink hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
