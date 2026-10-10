"use client";

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { findAnswerStarts, parseTextToBlocks, splitQuestionLabel } from "@/lib/document/parseText";

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

/** Marks question lines and hangs their number ("Q1 a).") into the left margin, like the handwritten page. */
function questionDecorations(options: EditorOptions) {
  const build = (view: EditorView, answers: Map<number, string | null>): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        const [block] = parseTextToBlocks(line.text, options);
        const answer = answers.get(line.number - 1);
        if (answer !== undefined) {
          if (answer === null) builder.add(line.from, line.from, answerWidget);
          else builder.add(line.from, line.from + answer.length, typedAnswerLabel);
        } else if (block?.type === "question") {
          builder.add(line.from, line.from, questionLine);
          const split = options.questionNumberInMargin ? splitQuestionLabel(line.text) : null;
          if (split && split.label.length <= MAX_MARGIN_LABEL) {
            builder.add(line.from, line.from + split.label.length, marginLabel);
          }
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      answers: Map<number, string | null>;
      constructor(view: EditorView) {
        this.answers = answerLines(view.state.doc.toString(), options);
        this.decorations = build(view, this.answers);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.answers = answerLines(update.state.doc.toString(), options);
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view, this.answers);
      }
    },
    { decorations: (plugin) => plugin.decorations },
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
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#efece5] p-4 sm:p-5">
        <div className="mx-auto max-w-[720px] overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(30,42,68,0.08),0_8px_24px_-12px_rgba(30,42,68,0.25)]">
          <div ref={host} className="paper-editor" onClick={() => viewRef.current?.focus()} />
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
