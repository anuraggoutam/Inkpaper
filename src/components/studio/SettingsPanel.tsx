"use client";

import { formatSheetDate } from "@/lib/document/date";
import { FONTS } from "@/lib/handwriting/fonts";
import { INK_SHADES } from "@/lib/handwriting/ink";
import { LIMITS, type RenderSettings } from "@/lib/validation/schema";
import type { AssignmentDocument, AssignmentMetadata } from "@/types/document";
import { Section, Segmented, Slider, Swatch, TextField, Toggle } from "@/components/studio/controls";

interface SettingsPanelProps {
  settings: RenderSettings;
  onSettings: (patch: Partial<RenderSettings>) => void;
  onResetSettings: () => void;
  doc: AssignmentDocument;
  onTitle: (title: string) => void;
  onMetadata: (patch: Partial<AssignmentMetadata>) => void;
}

const REALISM_LABELS: [number, string][] = [
  [0, "Perfectly neat"],
  [0.3, "Neat"],
  [0.6, "Natural"],
  [0.85, "Realistic"],
  [1.01, "Very loose"],
];

function realismLabel(value: number): string {
  return REALISM_LABELS.find(([limit]) => value <= limit)?.[1] ?? "Realistic";
}

export function SettingsPanel({ settings, onSettings, onResetSettings, doc, onTitle, onMetadata }: SettingsPanelProps) {
  const m = doc.metadata;
  const practical = settings.paperType === "practical";
  return (
    <div className="pb-6">
      <Section title="Assignment">
        <TextField
          label={practical ? "Topic" : "Title (optional)"}
          value={doc.title}
          onChange={onTitle}
          placeholder={practical ? "e.g. Sieve of Eratosthenes" : "e.g. Physics Practical 3"}
          hint={practical ? "Written in the TOPIC box on page 1." : "Written centred and underlined at the top of page 1."}
        />
        <TextField
          label="Date"
          value={m.date}
          onChange={(date) => onMetadata({ date })}
          placeholder="DD/MM/YYYY"
          action={{ label: "Today", onClick: () => onMetadata({ date: formatSheetDate(new Date()) }) }}
          hint={practical ? "Written in the DATE box on page 1." : settings.showStudentHeader ? "Written with the student details." : "Printed when student details are on."}
        />
        <Toggle
          label="Student details on page 1"
          hint="Name, roll number, course and subject"
          checked={settings.showStudentHeader}
          onChange={(showStudentHeader) => onSettings({ showStudentHeader })}
        />
        {settings.showStudentHeader && (
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Name" value={m.studentName} onChange={(studentName) => onMetadata({ studentName })} />
            <TextField label="Roll no." value={m.rollNumber} onChange={(rollNumber) => onMetadata({ rollNumber })} />
            <TextField label="Course / class" value={m.course} onChange={(course) => onMetadata({ course })} />
            <TextField label="Subject" value={m.subject} onChange={(subject) => onMetadata({ subject })} />
          </div>
        )}
      </Section>

      <Section title="Handwriting">
        <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Handwriting style">
          {FONTS.map((font) => {
            const active = font.id === settings.fontId;
            return (
              <button
                key={font.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSettings({ fontId: font.id })}
                className={`rounded-lg border px-3 pt-1.5 pb-1 text-left transition-colors ${
                  active ? "border-accent/50 bg-accent-soft" : "border-line bg-white hover:border-accent/30"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2 text-[11px] leading-tight text-muted">
                  <span className="font-medium text-ink">{font.label}</span>
                  <span className="truncate">{font.description}</span>
                </span>
                <span
                  className="block truncate leading-snug"
                  style={{ fontFamily: `"${font.family}", cursive`, color: INK_SHADES[settings.inkColor][0], fontSize: 17 * font.sizeScale }}
                >
                  Q1. The quick brown fox
                </span>
              </button>
            );
          })}
        </div>
        <Slider
          label="Realism"
          value={settings.variation}
          min={0}
          max={1}
          step={0.05}
          format={(v) => realismLabel(v)}
          onChange={(variation) => onSettings({ variation })}
        />
        <button
          type="button"
          onClick={() => onSettings({ seed: Math.floor(Math.random() * 999_999) })}
          className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-accent/40 hover:text-accent"
          title="Same text, a slightly different natural hand"
        >
          ↻ Rewrite with a fresh hand
        </button>
      </Section>

      <Section title="Ink">
        <Segmented
          label="Answer ink"
          value={settings.inkColor}
          onChange={(inkColor) => onSettings({ inkColor })}
          options={[
            { value: "blue", label: <><Swatch color={INK_SHADES.blue[0]!} /> Blue</> },
            { value: "black", label: <><Swatch color={INK_SHADES.black[0]!} /> Black</> },
          ]}
        />
        <Segmented
          label="Question & heading ink"
          value={settings.questionInk}
          onChange={(questionInk) => onSettings({ questionInk })}
          options={[
            { value: "same", label: "Same" },
            { value: "black", label: <><Swatch color={INK_SHADES.black[0]!} /> Black</> },
            { value: "blue", label: <><Swatch color={INK_SHADES.blue[0]!} /> Blue</> },
            { value: "red", label: <><Swatch color={INK_SHADES.red[0]!} /> Red</> },
          ]}
        />
      </Section>

      <Section title="Size & spacing">
        <Slider
          label="Writing size"
          value={settings.fontSizePt}
          min={LIMITS.fontSizePt.min}
          max={LIMITS.fontSizePt.max}
          step={0.5}
          format={(v) => `${v} pt`}
          onChange={(fontSizePt) => onSettings({ fontSizePt })}
        />
        {settings.paperType === "practical" ? (
          <Slider
            label="Lines per page"
            value={settings.practicalLines}
            min={LIMITS.practicalLines.min}
            max={LIMITS.practicalLines.max}
            step={1}
            format={(v) => `${v} lines`}
            onChange={(practicalLines) => onSettings({ practicalLines })}
          />
        ) : (
          <Slider
            label="Line spacing"
            value={settings.lineHeight}
            min={LIMITS.lineHeight.min}
            max={LIMITS.lineHeight.max}
            step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(lineHeight) => onSettings({ lineHeight })}
          />
        )}
        <Slider
          label="Margins"
          value={settings.marginMm}
          min={LIMITS.marginMm.min}
          max={LIMITS.marginMm.max}
          step={1}
          format={(v) => `${v} mm`}
          onChange={(marginMm) => onSettings({ marginMm })}
        />
      </Section>

      <Section title="Paper">
        <Segmented
          label="Paper type"
          value={settings.paperType}
          onChange={(paperType) => onSettings({ paperType })}
          options={[
            { value: "practical", label: "Practical file", title: "TOPIC / DATE box, double margin line, grey rules" },
            { value: "ruled", label: "Ruled" },
            { value: "plain", label: "Plain" },
          ]}
        />
        {settings.paperType !== "plain" && (
          <Toggle label="Margin line" checked={settings.showMarginLine} onChange={(showMarginLine) => onSettings({ showMarginLine })} />
        )}
        <Toggle label="Page numbers" checked={settings.showPageNumbers} onChange={(showPageNumbers) => onSettings({ showPageNumbers })} />
      </Section>

      <Section title="Questions">
        <Toggle
          label="Numbered lines are questions"
          hint={'Treat "1." and "2)" like "Q1."'}
          checked={settings.numberedLinesAreQuestions}
          onChange={(numberedLinesAreQuestions) => onSettings({ numberedLinesAreQuestions })}
        />
        <Toggle
          label="Question number in the margin"
          hint="Writes Q1 / Q1 a) left of the margin line"
          checked={settings.questionNumberInMargin}
          onChange={(questionNumberInMargin) => onSettings({ questionNumberInMargin })}
        />
        <Toggle
          label={'Write "Ans." in the margin'}
          hint="On the first line of every answer"
          checked={settings.answerLabelInMargin}
          onChange={(answerLabelInMargin) => onSettings({ answerLabelInMargin })}
        />
        <Toggle
          label="Blank line before each question"
          checked={settings.gapBeforeQuestions}
          onChange={(gapBeforeQuestions) => onSettings({ gapBeforeQuestions })}
        />
      </Section>

      <div className="px-5 pt-4">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset all style settings to their defaults? Your text is not affected.")) onResetSettings();
          }}
          className="w-full rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-white hover:text-danger"
        >
          Reset style settings
        </button>
      </div>
    </div>
  );
}
