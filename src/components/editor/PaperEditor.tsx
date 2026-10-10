"use client";

import { useEffect, useRef, useState } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { findAnswerStarts, MARGIN_MARK, parseTextToBlocks, splitMarginPrefix, splitQuestionLabel } from "@/lib/document/parseText";

const PLACEHOLDER = `Type or paste your assignment here…

Q1. What is photosynthesis?
Photosynthesis is the process by which green plants make food using sunlight.

Q2. List two uses of water.
- Drinking
- Farming

Tip: lines starting with Q1. / Q.1 / 1. / Question 1 become questions,
# makes a heading, and - makes a bullet point.`;

/** Labels longer than this stay inline (same idea as the handwriting renderer's margin fallback). */
const MAX_MARGIN_LABEL = 8;

export interface EditorOptions {
  numberedLinesAreQuestions: boolean;
  questionNumberInMargin: boolean;
  answerLabelInMargin: boolean;
}

interface PaperEditorProps {
  text: string;
  onChange: (text: string) => void;
  onCaretLine: (line: number | null) => void;
  options: EditorOptions;
}

const questionLine = Decoration.line({ class: "cm-question" });
const marginLabel = Decoration.mark({ class: "cm-qlabel" });
const typedAnswerLabel = Decoration.mark({ class: "cm-qlabel cm-anslabel" });
const customLabel = Decoration.mark({ class: "cm-qlabel cm-customlabel" });
/** Hides the "» " that stores a margin label in the text. */
const hiddenMark = Decoration.replace({});

/** Width of the margin column (px) — matches --margin-line in globals.css. */
const MARGIN_PX = 64;
const MAX_CUSTOM_LABEL = 10;

/** "Ans." shown in the margin; not part of the text (the handwriting adds it the same way). */
class AnswerLabelWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-qlabel cm-anslabel";
    el.textContent = "Ans.";
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
const answerWidget = Decoration.widget({ widget: new AnswerLabelWidget(), side: -1 });

/** Source line → typed answer label (or null for an automatic "Ans."). */
function answerLines(doc: string, options: EditorOptions): Map<number, string | null> {
  const lines = new Map<number, string | null>();
  if (!options.answerLabelInMargin) return lines;
  const blocks = parseTextToBlocks(doc, options);
  findAnswerStarts(blocks).forEach((label, index) => lines.set(blocks[index]!.sourceLine, label));
  return lines;
}

type LineLabel =
  | { kind: "custom"; label: string; prefixLength: number }
  | { kind: "autoQuestion" | "typedAnswer" | "autoAnswer"; label: string }
  | { kind: "none"; label: "" };

/** What the margin currently shows for a line, and where that label comes from. */
function lineLabel(text: string, lineIndex: number, answers: Map<number, string | null>, options: EditorOptions): LineLabel {
  const custom = splitMarginPrefix(text);
  if (custom) return { kind: "custom", label: custom.label, prefixLength: custom.prefixLength };
  const answer = answers.get(lineIndex);
  if (answer === null) return { kind: "autoAnswer", label: "Ans." };
  if (answer !== undefined) return { kind: "typedAnswer", label: answer };
  const [block] = parseTextToBlocks(text, options);
  const split = block?.type === "question" && options.questionNumberInMargin ? splitQuestionLabel(text) : null;
  if (split && split.label.length <= MAX_MARGIN_LABEL) return { kind: "autoQuestion", label: split.label };
  return { kind: "none", label: "" };
}

/** Marks question lines and hangs labels ("Q1 a).", "Ans.", custom ones) into the left margin. */
function questionDecorations(options: EditorOptions) {
  const build = (view: EditorView, answers: Map<number, string | null>) => {
    const builder = new RangeSetBuilder<Decoration>();
    const hidden = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        const [block] = parseTextToBlocks(line.text, options);
        const info = lineLabel(line.text, line.number - 1, answers, options);
        if (block?.type === "question") builder.add(line.from, line.from, questionLine);
        if (info.kind === "custom") {
          const markAt = line.text.indexOf(MARGIN_MARK);
          if (info.label) {
            builder.add(line.from, line.from + markAt, customLabel);
            builder.add(line.from + markAt, line.from + info.prefixLength, hiddenMark);
            hidden.add(line.from + markAt, line.from + info.prefixLength, hiddenMark);
          } else {
            builder.add(line.from, line.from + info.prefixLength, hiddenMark);
            hidden.add(line.from, line.from + info.prefixLength, hiddenMark);
          }
        } else if (info.kind === "autoAnswer") {
          builder.add(line.from, line.from, answerWidget);
        } else if (info.kind === "typedAnswer") {
          builder.add(line.from, line.from + info.label.length, typedAnswerLabel);
        } else if (info.kind === "autoQuestion") {
          builder.add(line.from, line.from + info.label.length, marginLabel);
        }
        pos = line.to + 1;
      }
    }
    return { decorations: builder.finish(), hidden: hidden.finish() };
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      hidden: DecorationSet;
      answers: Map<number, string | null>;
      constructor(view: EditorView) {
        this.answers = answerLines(view.state.doc.toString(), options);
        const built = build(view, this.answers);
        this.decorations = built.decorations;
        this.hidden = built.hidden;
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.answers = answerLines(update.state.doc.toString(), options);
        if (update.docChanged || update.viewportChanged) {
          const built = build(update.view, this.answers);
          this.decorations = built.decorations;
          this.hidden = built.hidden;
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      // The caret skips over the hidden "» " as if it weren't there.
      provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.hidden ?? Decoration.none),
    },
  );
}

function placeholderElement(): HTMLElement {
  const el = document.createElement("span");
  el.textContent = PLACEHOLDER;
  el.style.whiteSpace = "pre-wrap";
  return el;
}

export function PaperEditor({ text, onChange, onCaretLine, options }: PaperEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const decorations = useRef(new Compartment());
  const callbacks = useRef({ onChange, onCaretLine });
  callbacks.current = { onChange, onCaretLine };
  const [marginEdit, setMarginEdit] = useState<{ lineNumber: number; top: number; value: string; original: string } | null>(null);

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          placeholder(placeholderElement()),
          EditorView.contentAttributes.of({ spellcheck: "true", "aria-label": "Assignment text", autocapitalize: "sentences" }),
          decorations.current.of(questionDecorations(options)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
            if ((update.docChanged || update.selectionSet) && update.view.hasFocus) {
              callbacks.current.onCaretLine(update.state.doc.lineAt(update.state.selection.main.head).number - 1);
            }
          }),
          EditorView.domEventHandlers({
            focus: (_event, v) => callbacks.current.onCaretLine(v.state.doc.lineAt(v.state.selection.main.head).number - 1),
            blur: () => callbacks.current.onCaretLine(null),
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns its state after creation; later `text` changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External text changes (import, sample, reset, clear) replace the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === text) return;
    const head = Math.min(view.state.selection.main.head, text.length);
    view.dispatch({ changes: { from: 0, to: current.length, insert: text }, selection: { anchor: head } });
  }, [text]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: decorations.current.reconfigure(questionDecorations(options)) });
  }, [options]);

  /** Toggle a marker such as "Q1. " or "# " at the start of the caret's line. */
  const applyPrefix = (prefix: string, pattern: RegExp) => {
    const view = viewRef.current;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const match = pattern.exec(line.text);
    const leading = line.text.length - line.text.trimStart().length;
    const change = match
      ? { from: line.from, to: line.from + match[0].length, insert: "" }
      : { from: line.from, to: line.from + leading, insert: prefix };
    view.dispatch({ changes: change, selection: { anchor: line.from + (match ? line.text.length - match[0].length : line.text.length - leading + prefix.length) } });
    view.focus();
  };

  /** Click in the left margin: open a small box to write that line's margin label. */
  const openMarginEditor = (clientY: number) => {
    const view = viewRef.current;
    const hostEl = host.current;
    if (!view || !hostEl) return;
    const contentLeft = view.contentDOM.getBoundingClientRect().left;
    const pos = view.posAtCoords({ x: contentLeft + 90, y: clientY }, false);
    const line = view.state.doc.lineAt(pos);
    const info = lineLabel(line.text, line.number - 1, answerLines(view.state.doc.toString(), options), options);
    const top = view.lineBlockAt(line.from).top + view.documentTop - hostEl.getBoundingClientRect().top;
    setMarginEdit({ lineNumber: line.number, top, value: info.label, original: info.label });
  };

  /** Write the margin label into the text as "label» " (null = cancel). */
  const commitMarginEdit = (value: string | null) => {
    const view = viewRef.current;
    const edit = marginEdit;
    setMarginEdit(null);
    if (!view || !edit) return;
    view.focus();
    if (value === null || edit.lineNumber > view.state.doc.lines) return;
    const next = value.replaceAll(MARGIN_MARK, "").trim().slice(0, MAX_CUSTOM_LABEL);
    if (next === edit.original) return;
    const line = view.state.doc.line(edit.lineNumber);
    const info = lineLabel(line.text, line.number - 1, answerLines(view.state.doc.toString(), options), options);
    const body =
      info.kind === "custom"
        ? line.text.slice(info.prefixLength)
        : info.kind === "autoQuestion" || info.kind === "typedAnswer"
          ? line.text.slice(info.label.length).trimStart()
          : line.text;
    // Empty label: drop a custom one, or hide an automatic Q/Ans label with a bare "»".
    const replacement = next
      ? `${next}${MARGIN_MARK} ${body}`
      : info.kind === "custom" || info.kind === "none"
        ? body
        : `${MARGIN_MARK} ${body}`;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: replacement },
      selection: { anchor: line.from + replacement.length - body.length },
    });
  };

  const nextQuestionNumber = () => (text.match(/^\s*q(?:ues(?:tion)?)?\s*[.:]?\s*(\d+)/gim) ?? []).length + 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-4 py-2" role="toolbar" aria-label="Line formatting">
        <span className="mr-1 text-xs text-muted">Mark line as</span>
        <ToolButton onClick={() => applyPrefix(`Q${nextQuestionNumber()}. `, /^\s*q(?:ues(?:tion)?)?\s*[.:]?\s*\d*\s*[.:)]?\s*/i)} title="Question (Q1.)">
          Question
        </ToolButton>
        <ToolButton onClick={() => applyPrefix("# ", /^#{1,3}\s+/)} title="Heading (# )">
          Heading
        </ToolButton>
        <ToolButton onClick={() => applyPrefix("- ", /^\s*[-*•]\s+/)} title="Bullet (- )">
          • Bullet
        </ToolButton>
        <span className="ml-auto hidden text-[11px] text-muted lg:inline">Tip: click the left margin to write Q1, Ans, Sol…</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#efece5] p-4 sm:p-5">
        <div className="mx-auto max-w-[720px] overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(30,42,68,0.08),0_8px_24px_-12px_rgba(30,42,68,0.25)]">
          <div className="relative">
            <div ref={host} className="paper-editor" onClick={() => viewRef.current?.focus()} />
            {/* Clickable margin column: write Q1, Ans, Sol… next to any line. */}
            <div
              className="absolute inset-y-0 left-0 cursor-pointer hover:bg-accent/[0.04]"
              style={{ width: MARGIN_PX }}
              title="Click to write in the margin (Q1, Ans, Sol…)"
              onMouseDown={(event) => {
                event.preventDefault();
                openMarginEditor(event.clientY);
              }}
            />
            {marginEdit && (
              <input
                autoFocus
                aria-label="Margin label"
                maxLength={MAX_CUSTOM_LABEL}
                value={marginEdit.value}
                placeholder="Q1 / Ans"
                onChange={(event) => setMarginEdit({ ...marginEdit, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    commitMarginEdit(marginEdit.value);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    commitMarginEdit(null);
                  }
                }}
                onBlur={() => commitMarginEdit(marginEdit.value)}
                className="absolute left-1 z-10 h-8 rounded border border-accent/50 bg-white px-1.5 text-right text-[15px] text-ink shadow-sm outline-none placeholder:text-[#b3ada1]"
                style={{ top: marginEdit.top, width: MARGIN_PX - 6 }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-accent/40 hover:text-accent"
    >
      {children}
    </button>
  );
}
