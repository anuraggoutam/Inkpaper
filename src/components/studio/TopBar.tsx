"use client";

import { useRef } from "react";

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export type Status = { kind: "idle" } | { kind: "importing"; name: string; size: number } | { kind: "exporting" };

interface TopBarProps {
  status: Status;
  fileName: string;
  /** Short note next to the file name, e.g. "edited · not saved" or "saved in this browser". */
  saveNote: { text: string; tone: "warn" | "ok" } | null;
  pageCount: number;
  canExport: boolean;
  showSettings: boolean;
  onToggleSettings: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function TopBar({ status, fileName, saveNote, pageCount, canExport, showSettings, onToggleSettings, onImport, onExport }: TopBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = status.kind !== "idle";

  return (
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
        ) : (
          <span>
            {fileName && <span className="text-ink">{fileName}</span>}
            {saveNote && (
              <span
                className={`${fileName ? "ml-2 " : ""}rounded px-1.5 py-0.5 text-[11px] ${
                  saveNote.tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-strong"
                }`}
              >
                {saveNote.text}
              </span>
            )}
          </span>
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
          if (file) onImport(file);
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
        onClick={onToggleSettings}
        aria-pressed={showSettings}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
          showSettings ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line bg-white text-ink hover:text-accent"
        }`}
      >
        Style
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={busy || !canExport}
        title="Export PDF (Ctrl+P)"
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === "exporting" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
        {status.kind === "exporting" ? (
          "Exporting…"
        ) : (
          <span className="whitespace-nowrap">
            Export<span className="hidden sm:inline"> PDF</span>
            {pageCount > 0 && (
              <span className="hidden font-normal opacity-80 lg:inline">
                {" "}
                · {pageCount} {pageCount === 1 ? "page" : "pages"}
              </span>
            )}
          </span>
        )}
      </button>
    </header>
  );
}
