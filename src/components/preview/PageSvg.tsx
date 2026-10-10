import { memo } from "react";
import { fontStack } from "@/lib/handwriting/fonts";
import type { PageGeometry } from "@/lib/layout/geometry";
import type { PageLayout, PlacedWord, Underline } from "@/lib/layout/layout";
import type { RenderSettings } from "@/lib/validation/schema";

const PAPER = "#fffefa";
const PRACTICAL_PAPER = "#ffffff";
const RULE = "#a8c3e2";
const HEADER_RULE = "#e2a3a3";
const MARGIN_RULE = "#e39a9a";
const PRACTICAL_RULE = "#6f6f6f";
const PRACTICAL_PRINT = "#3f3f3f";
const MM = 96 / 25.4;

interface PageSvgProps {
  page: PageLayout;
  geometry: PageGeometry;
  settings: RenderSettings;
  /** "print" sizes the SVG in mm for exact A4 output; "screen" fills its container. */
  mode: "print" | "screen";
  highlightY?: number | null;
}

function Word({ word }: { word: PlacedWord }) {
  const x = word.x.toFixed(2);
  const y = word.y.toFixed(2);
  return (
    <text
      x={x}
      y={y}
      fontSize={word.size.toFixed(2)}
      fill={word.color}
      fillOpacity={word.opacity === 1 ? undefined : word.opacity.toFixed(3)}
      transform={word.rotate !== 0 ? `rotate(${word.rotate.toFixed(3)} ${x} ${y})` : undefined}
    >
      {/* Trailing space keeps copied PDF text readable; it never affects placement. */}
      {`${word.text} `}
    </text>
  );
}

function UnderlinePath({ line }: { line: Underline }) {
  const mid = (line.x1 + line.x2) / 2;
  const bow = line.wobble * 1.6;
  const d = `M ${line.x1.toFixed(1)} ${line.y.toFixed(1)} Q ${mid.toFixed(1)} ${(line.y + bow).toFixed(1)} ${line.x2.toFixed(1)} ${(line.y - bow * 0.4).toFixed(1)}`;
  return <path d={d} stroke={line.color} strokeWidth={1.1} strokeOpacity={0.85} fill="none" strokeLinecap="round" />;
}

/** Practical-file sheet: TOPIC/DATE box, double top rule, double margin line, grey full-width rules. */
function PracticalPaper({ geometry, showMarginLine }: { geometry: PageGeometry; showMarginLine: boolean }) {
  const p = geometry.practical;
  if (!p) return null;
  const { pageWidth: w } = geometry;
  const lastY = geometry.baselines[geometry.baselines.length - 1] ?? p.topRuleY2;
  const gap = 1.1 * MM;
  return (
    <g stroke={PRACTICAL_RULE} fill="none" shapeRendering="geometricPrecision">
      <rect x={p.boxX1} y={p.boxY1} width={p.boxX2 - p.boxX1} height={p.boxY2 - p.boxY1} strokeWidth={0.9} />
      <rect x={p.boxX1 + gap} y={p.boxY1 + gap} width={p.boxX2 - p.boxX1 - 2 * gap} height={p.boxY2 - p.boxY1 - 2 * gap} strokeWidth={0.6} />
      <g stroke="none" fill={PRACTICAL_PRINT} fontFamily="Arial, Helvetica, sans-serif" fontSize={11} letterSpacing={0.4}>
        <text x={p.topicLabelX} y={p.labelY}>TOPIC</text>
        <text x={p.dateLabelX} y={p.labelY}>DATE</text>
      </g>
      <line x1={p.topicLineX1} x2={p.topicLineX2} y1={p.labelY + 0.5} y2={p.labelY + 0.5} strokeWidth={0.8} />
      <line x1={p.dateLineX1} x2={p.dateLineX2} y1={p.labelY + 0.5} y2={p.labelY + 0.5} strokeWidth={0.8} />
      <line x1={0} x2={w} y1={p.topRuleY2 - gap} y2={p.topRuleY2 - gap} strokeWidth={0.8} />
      <line x1={0} x2={w} y1={p.topRuleY2} y2={p.topRuleY2} strokeWidth={0.8} />
      {geometry.baselines.map((y) => (
        <line key={y} x1={0} x2={w} y1={y} y2={y} strokeWidth={0.6} />
      ))}
      {showMarginLine && (
        <>
          <line x1={geometry.marginLineX - 1.3 * MM} x2={geometry.marginLineX - 1.3 * MM} y1={p.topRuleY2} y2={lastY} strokeWidth={0.7} />
          <line x1={geometry.marginLineX} x2={geometry.marginLineX} y1={p.topRuleY2} y2={lastY} strokeWidth={0.7} />
        </>
      )}
    </g>
  );
}

function PageSvgInner({ page, geometry, settings, mode, highlightY }: PageSvgProps) {
  const { pageWidth: w, pageHeight: h } = geometry;
  const ruled = settings.paperType === "ruled";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w.toFixed(3)} ${h.toFixed(3)}`}
      width={mode === "print" ? "210mm" : "100%"}
      height={mode === "print" ? "297mm" : undefined}
      style={{ display: "block", whiteSpace: "pre" }}
      aria-label={`Page ${page.index + 1}`}
      role="img"
    >
      <rect x={0} y={0} width={w} height={h} fill={settings.paperType === "practical" ? PRACTICAL_PAPER : PAPER} />
      {ruled && (
        <g strokeWidth={0.75} shapeRendering="geometricPrecision">
          <line x1={0} x2={w} y1={geometry.topRuleY} y2={geometry.topRuleY} stroke={HEADER_RULE} strokeWidth={1} />
          {geometry.baselines.map((y) => (
            <line key={y} x1={0} x2={w} y1={y} y2={y} stroke={RULE} />
          ))}
        </g>
      )}
      {ruled && settings.showMarginLine && (
        <line x1={geometry.marginLineX} x2={geometry.marginLineX} y1={0} y2={h} stroke={MARGIN_RULE} strokeWidth={1} />
      )}
      {settings.paperType === "practical" && <PracticalPaper geometry={geometry} showMarginLine={settings.showMarginLine} />}
      {highlightY != null && (
        <rect
          x={geometry.textLeft - 6}
          y={highlightY - geometry.pitch * 0.85}
          width={geometry.textRight - geometry.textLeft + 12}
          height={geometry.pitch * 0.95}
          fill="#3b5bdb"
          fillOpacity={0.07}
          rx={4}
          data-screen-only
        />
      )}
      {/* geometricPrecision = unhinted, linearly scaling advances, so widths match the canvas measurer at any zoom. */}
      <g style={{ fontFamily: fontStack(settings.fontId) }} textRendering="geometricPrecision">
        {page.underlines.map((line, i) => (
          <UnderlinePath key={`u${i}`} line={line} />
        ))}
        {page.words.map((word, i) => (
          <Word key={i} word={word} />
        ))}
        {page.headerWords.map((word, i) => (
          <Word key={`h${i}`} word={word} />
        ))}
        {page.pageNumber && <Word word={page.pageNumber} />}
      </g>
    </svg>
  );
}

export const PageSvg = memo(PageSvgInner);
