"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PaperEditor } from "@/components/editor/PaperEditor";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { SettingsPanel } from "@/components/studio/SettingsPanel";
import { TopBar, type Status } from "@/components/studio/TopBar";
import { Notice } from "@/components/studio/controls";
import { useDraft, useFileDrop, usePersistentSettings } from "@/components/studio/hooks";
import { countQuestions, isEffectivelyEmpty, parseTextToBlocks } from "@/lib/document/parseText";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "@/lib/document/sample";
import { checkCoverage } from "@/lib/handwriting/coverage";
import { useHandwritingLayout } from "@/lib/layout/useHandwritingLayout";
import { importFile } from "@/lib/parsers/importFile";
import { ImportError } from "@/lib/parsers/types";
import { exportPdf } from "@/lib/pdf/downloadPdf";
import { DEFAULT_SETTINGS, type RenderSettings } from "@/lib/validation/schema";
import { EMPTY_METADATA, type AssignmentDocument, type AssignmentMetadata } from "@/types/document";

const EMPTY_DOC: AssignmentDocument = { title: "", sourceFileName: "", text: "", metadata: EMPTY_METADATA };

export function Studio() {
  const [doc, setDoc] = useState<AssignmentDocument>(EMPTY_DOC);
  const [original, setOriginal] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = usePersistentSettings();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [mobileView, setMobileView] = useState<"write" | "preview">("write");

  const { rememberWork, setRememberWork, savedAt } = useDraft(doc, setDoc);

  useEffect(() => {
    if (window.innerWidth < 1280) setShowSettings(false);
  }, []);

  // Warn before closing the tab with text that exists nowhere else.
  useEffect(() => {
    if (rememberWork || !dirty || isEffectivelyEmpty(doc.text)) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rememberWork, dirty, doc.text]);

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
  const updateSettings = useCallback((patch: Partial<RenderSettings>) => setSettings((s) => ({ ...s, ...patch })), [setSettings]);
  const updateMetadata = useCallback((patch: Partial<AssignmentMetadata>) => setDoc((d) => ({ ...d, metadata: { ...d.metadata, ...patch } })), []);
  const updateTitle = useCallback((title: string) => setDoc((d) => ({ ...d, title })), []);

  /** Replace the editor text (import, sample, clear) and forget the previous file's notices. */
  const replaceText = (text: string, patch: Partial<AssignmentDocument> = {}) => {
    setDoc((d) => ({ ...d, ...patch, text }));
    setWarnings([]);
    setError(null);
    setDirty(false);
  };

  const handleFile = async (file: File) => {
    if (status.kind !== "idle") return;
    if (!isEffectivelyEmpty(doc.text) && !window.confirm(`Replace the current text with the contents of "${file.name}"?`)) return;
    setError(null);
    setStatus({ kind: "importing", name: file.name, size: file.size });
    try {
      const result = await importFile(file);
      replaceText(result.text, { sourceFileName: file.name });
      setOriginal(result.text);
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : "Something went wrong while reading this file. Try a different file or paste the text instead.");
    } finally {
      setStatus({ kind: "idle" });
    }
  };

  const empty = isEffectivelyEmpty(doc.text) && !doc.title.trim();

  const runExport = async () => {
    if (status.kind !== "idle" || !layout) return;
    if (empty) {
      setError("The page is empty. Type, paste or import your assignment before exporting.");
      return;
    }
    setError(null);
    setStatus({ kind: "exporting" });
    try {
      await exportPdf(doc, settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed.");
    } finally {
      setStatus({ kind: "idle" });
    }
  };

  // Ctrl+P (Cmd+P) exports the PDF instead of printing the studio screen.
  const exportRef = useRef(runExport);
  exportRef.current = runExport;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void exportRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadSample = () => {
    if (!isEffectivelyEmpty(doc.text) && !window.confirm("Replace the current text with the sample assignment?")) return;
    replaceText(SAMPLE_TEXT, { title: doc.title || SAMPLE_TITLE, sourceFileName: "" });
    setOriginal(null);
  };

  const resetToOriginal = () => {
    if (original == null) return;
    if (window.confirm("Discard your edits and restore the text exactly as it was imported?")) {
      setDoc((d) => ({ ...d, text: original }));
      setDirty(false);
    }
  };

  const clearAll = () => {
    // Student details stay: they are usually the same for the next assignment.
    if (window.confirm("Start a new page? This removes the text and title. Your name and other details are kept.")) {
      replaceText("", { title: "", sourceFileName: "" });
      setOriginal(null);
    }
  };

  const { dragging, handlers: dropHandlers } = useFileDrop((file) => void handleFile(file));

  const pageCount = empty ? 0 : (layout?.pages.length ?? 0);
  const saveNote = rememberWork
    ? savedAt && !empty
      ? { text: "saved in this browser", tone: "ok" as const }
      : null
    : dirty && !empty
      ? { text: "edited · not saved", tone: "warn" as const }
      : null;

  return (
    <div className="flex h-dvh flex-col" {...dropHandlers}>
      <TopBar
        status={status}
        fileName={doc.sourceFileName}
        saveNote={saveNote}
        pageCount={pageCount}
        canExport={layout !== null}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((s) => !s)}
        onImport={(file) => void handleFile(file)}
        onExport={() => void runExport()}
      />

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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-muted">
              <span className="tabular-nums">
                {stats.words} words · {stats.questions} {stats.questions === 1 ? "question" : "questions"}
              </span>
              <label className="flex cursor-pointer items-center gap-1.5" title="Your text, title and details stay in this browser only. Turning this off deletes them.">
                <input type="checkbox" className="accent-accent" checked={rememberWork} onChange={(event) => setRememberWork(event.target.checked)} />
                Keep my work in this browser
              </label>
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
                    New page
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
              onTitle={updateTitle}
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
