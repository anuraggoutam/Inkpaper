"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PaperEditor } from "@/components/editor/PaperEditor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { SettingsPanel } from "@/components/studio/SettingsPanel";
import { Notice } from "@/components/studio/controls";
import { countQuestions, isEffectivelyEmpty, parseTextToBlocks } from "@/lib/document/parseText";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "@/lib/document/sample";
import { checkCoverage } from "@/lib/handwriting/coverage";
import { useHandwritingLayout } from "@/lib/layout/useHandwritingLayout";
import { importFile } from "@/lib/parsers/importFile";
import { ImportError } from "@/lib/parsers/types";
import { safePdfFileName } from "@/lib/pdf/filename";
import { coerceSettings, DEFAULT_SETTINGS, type RenderSettings } from "@/lib/validation/schema";
import { EMPTY_METADATA, type AssignmentDocument, type AssignmentMetadata } from "@/types/document";

const SETTINGS_KEY = "inkpaper.settings.v2";
const OLD_SETTINGS_KEY = "inkpaper.settings.v1";
const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

type Status =
  | { kind: "idle" }
  | { kind: "importing"; name: string; size: number }
  | { kind: "exporting" };

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function Studio() {
  const [doc, setDoc] = useState<AssignmentDocument>({ title: "", sourceFileName: "", text: "", metadata: EMPTY_METADATA });
  const [original, setOriginal] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // Settings (never document content) are remembered in this browser.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SETTINGS_KEY);
      const old = stored ? null : window.localStorage.getItem(OLD_SETTINGS_KEY);
      if (stored) setSettings(coerceSettings(JSON.parse(stored)));
      // v1 → v2: keep the user's choices but switch to the new practical-file paper default.
      else if (old) setSettings(coerceSettings({ ...JSON.parse(old), paperType: "practical", marginMm: DEFAULT_SETTINGS.marginMm }));
    } catch {
      /* ignore unreadable storage */
    }
    if (window.innerWidth < 1280) setShowSettings(false);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be unavailable */
    }
  }, [settings]);

  // Warn before closing the tab with unsaved text (nothing is stored on disk).
  useEffect(() => {
    if (!dirty || isEffectivelyEmpty(doc.text)) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, doc.text]);

  // Typing stays responsive; the handwriting re-layout trails slightly behind.
  const deferredDoc = useDeferredValue(doc);
  const { layout, fontError } = useHandwritingLayout(deferredDoc, settings);

  const stats = useMemo(() => {
    const blocks = parseTextToBlocks(deferredDoc.text, { numberedLinesAreQuestions: settings.numberedLinesAreQuestions });
    return {
      questions: countQuestions(blocks),
      words: deferredDoc.text.split(/\s+/).filter(Boolean).length,
      coverage: checkCoverage(`${deferredDoc.title}\n${deferredDoc.text}`, settings.fontId),
    };
  }, [deferredDoc.text, deferredDoc.title, settings.fontId, settings.numberedLinesAreQuestions]);

  const editorOptions = useMemo(
    () => ({
      numberedLinesAreQuestions: settings.numberedLinesAreQuestions,
      questionNumberInMargin: settings.questionNumberInMargin,
      answerLabelInMargin: settings.answerLabelInMargin,
    }),
    [settings.numberedLinesAreQuestions, settings.questionNumberInMargin, settings.answerLabelInMargin],
  );

  const updateText = useCallback((text: string) => {
    setDoc((d) => ({ ...d, text }));
    setDirty(true);
  }, []);
  const updateSettings = useCallback((patch: Partial<RenderSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateMetadata = useCallback((patch: Partial<AssignmentMetadata>) => setDoc((d) => ({ ...d, metadata: { ...d.metadata, ...patch } })), []);

  const handleFile = async (file: File) => {
    if (status.kind !== "idle") return;
    if (!isEffectivelyEmpty(doc.text) && !window.confirm(`Replace the current text with the contents of "${file.name}"?`)) return;
    setError(null);
    setWarnings([]);
    setStatus({ kind: "importing", name: file.name, size: file.size });
    try {
      const result = await importFile(file);
      setDoc((d) => ({ ...d, text: result.text, sourceFileName: file.name }));
      setOriginal(result.text);
      setWarnings(result.warnings);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : "Something went wrong while reading this file. Try a different file or paste the text instead.");
    } finally {
      setStatus({ kind: "idle" });
    }
  };

  const exportPdf = async () => {
    if (status.kind !== "idle") return;
    if (isEffectivelyEmpty(doc.text) && !doc.title.trim()) {
      setError("The page is empty. Type, paste or import your assignment before exporting.");
      return;
    }
    setError(null);
    setStatus({ kind: "exporting" });
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc, settings }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Export failed (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
      if (blob.size === 0 || head !== "%PDF-") throw new Error("The exported file was not a valid PDF.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safePdfFileName(doc.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Could not reach the local InkPaper server. Make sure `npm run dev` (or `npm start`) is still running."
          : err instanceof Error
            ? err.message
            : "PDF export failed.",
      );
    } finally {
      setStatus({ kind: "idle" });
    }
  };

  const loadSample = () => {
    if (!isEffectivelyEmpty(doc.text) && !window.confirm("Replace the current text with the sample assignment?")) return;
    setDoc((d) => ({ ...d, text: SAMPLE_TEXT, title: d.title || SAMPLE_TITLE, sourceFileName: "" }));
    setOriginal(null);
    setWarnings([]);
    setError(null);
  };

  const resetToOriginal = () => {
    if (original == null) return;
    if (window.confirm("Discard your edits and restore the text exactly as it was imported?")) {
      setDoc((d) => ({ ...d, text: original }));
      setDirty(false);
    }
  };

  const clearAll = () => {
    if (window.confirm("Clear the page? This removes all text from the editor.")) {
      setDoc((d) => ({ ...d, text: "", sourceFileName: "" }));
      setOriginal(null);
      setWarnings([]);
      setDirty(false);
    }
  };

  const onDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const busy = status.kind !== "idle";
  const empty = isEffectivelyEmpty(doc.text) && !doc.title.trim();
  const pageCount = layout?.pages.length ?? 0;

  return (
    <div
      className="flex h-dvh flex-col"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.dataTransfer.types.includes("Files") && event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 sm:px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[19px] font-semibold tracking-tight text-ink">
            Ink<span className="text-accent">Paper</span>
          </span>
          <span className="hidden text-xs text-muted md:inline">handwritten assignment studio</span>
        </div>
        <div className="mx-2 hidden h-6 w-px bg-line sm:block" />
        <div className="min-w-0 flex-1 truncate text-sm text-muted" aria-live="polite">
          {status.kind === "importing" ? (
            <span className="text-ink">
              Reading {status.name} <span className="text-muted">({formatSize(status.size)})</span>…
            </span>
          ) : doc.sourceFileName ? (
            <span>
              <span className="text-ink">{doc.sourceFileName}</span>
              {dirty && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn">edited · not saved</span>}
            </span>
          ) : (
            !empty && <span>Untitled · {dirty ? "not saved" : "sample"}</span>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          Import<span className="hidden sm:inline"> file</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-pressed={showSettings}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${showSettings ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line bg-white text-ink hover:text-accent"}`}
        >
          Style
        </button>
        <button
          type="button"
          onClick={() => void exportPdf()}
          disabled={busy || !layout}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.kind === "exporting" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
          {status.kind === "exporting" ? (
            "Exporting…"
          ) : (
            <span className="whitespace-nowrap">
              Export<span className="hidden sm:inline"> PDF</span>
              {pageCount > 0 && !empty && (
                <span className="hidden font-normal opacity-80 lg:inline">
                  {" "}
                  · {pageCount} {pageCount === 1 ? "page" : "pages"}
                </span>
              )}
            </span>
          )}
        </button>
      </header>

      <div className="flex border-b border-line bg-panel p-1 md:hidden" role="tablist" aria-label="View">
        {(["write", "preview"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={mobileView === view}
            onClick={() => setMobileView(view)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${mobileView === view ? "bg-white text-accent-strong shadow-sm" : "text-muted"}`}
          >
            {view === "write" ? "Write" : `Handwritten${pageCount > 0 ? ` (${pageCount})` : ""}`}
          </button>
        ))}
      </div>

      <main className="relative flex min-h-0 flex-1">
        {/* Left: writing page */}
        <section
          aria-label="Your text"
          className={`${mobileView === "write" ? "flex" : "hidden"} min-w-0 flex-1 flex-col border-r border-line md:flex md:max-w-[46%]`}
        >
          <PaperEditor text={doc.text} onChange={updateText} onCaretLine={setCaretLine} options={editorOptions} />
          <div className="space-y-2 border-t border-line bg-panel px-4 py-2.5">
            {error && (
              <Notice tone="error" onDismiss={() => setError(null)}>
                {error}
              </Notice>
            )}
            {fontError && <Notice tone="error">{fontError} Reinstall the app files in public/fonts (see README).</Notice>}
            {warnings.map((warning) => (
              <Notice key={warning} tone="warn" onDismiss={() => setWarnings((w) => w.filter((x) => x !== warning))}>
                {warning}
              </Notice>
            ))}
            {stats.coverage.unsupported.length > 0 && (
              <Notice tone="warn">
                These characters are not in the handwriting font and will be printed in a plain system font:{" "}
                <span className="font-mono">{stats.coverage.unsupported.join(" ")}</span>
              </Notice>
            )}
            {stats.coverage.hasDevanagari && (
              <Notice tone="info">Hindi/Devanagari text is written with the Kalam handwriting fallback. Check the result before printing.</Notice>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {stats.words} words · {stats.questions} {stats.questions === 1 ? "question" : "questions"} detected
              </span>
              <span className="flex gap-3">
                {empty && (
                  <button type="button" className="font-medium text-accent hover:underline" onClick={loadSample}>
                    Try a sample
                  </button>
                )}
                {original != null && (
                  <button type="button" className="hover:text-ink hover:underline disabled:opacity-40" disabled={doc.text === original} onClick={resetToOriginal}>
                    Reset to imported text
                  </button>
                )}
                {!empty && (
                  <button type="button" className="hover:text-danger hover:underline" onClick={clearAll}>
                    Clear
                  </button>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Center: handwritten preview */}
        <section aria-label="Handwritten preview" className={`${mobileView === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
          <PreviewPane layout={layout} settings={settings} caretLine={caretLine} isEmpty={empty} onTrySample={loadSample} />
        </section>

        {/* Right: style settings */}
        {showSettings && (
          <aside
            aria-label="Style settings"
            className="absolute inset-y-0 right-0 z-20 w-[300px] overflow-y-auto border-l border-line bg-panel shadow-xl xl:static xl:shadow-none"
          >
            <SettingsPanel
              settings={settings}
              onSettings={updateSettings}
              onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
              doc={doc}
              onTitle={(title) => setDoc((d) => ({ ...d, title }))}
              onMetadata={updateMetadata}
            />
          </aside>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/60 bg-accent-soft/80">
            <div className="text-center">
              <p className="text-lg font-semibold text-accent-strong">Drop to import</p>
              <p className="mt-1 text-sm text-accent">PDF (with selectable text), DOCX or TXT · up to 20 MB · stays on this computer</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
