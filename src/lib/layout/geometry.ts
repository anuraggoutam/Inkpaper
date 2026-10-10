import { getFont } from "@/lib/handwriting/fonts";
import type { RenderSettings } from "@/lib/validation/schema";

/** CSS reference pixels (96 dpi). The SVG viewBox uses these units, the page box uses mm. */
export const PX_PER_MM = 96 / 25.4;
export const PX_PER_PT = 96 / 72;
export const A4_MM = { width: 210, height: 297 } as const;
export const PAGE_WIDTH_PX = A4_MM.width * PX_PER_MM;
export const PAGE_HEIGHT_PX = A4_MM.height * PX_PER_MM;

export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  /** Rendered font size of the handwriting (px). */
  fontPx: number;
  /** Distance between ruled lines / baselines (px). */
  pitch: number;
  /** Top rule of the writing area (the "header line" of a notebook page). */
  topRuleY: number;
  /** Baseline y of every writable line on a page. */
  baselines: number[];
  linesPerPage: number;
  marginLineX: number;
  textLeft: number;
  textRight: number;
  /** Maximum extra left offset a line may receive from variation (reserved from the width). */
  maxLineJitter: number;
  pageNumberY: number;
  /** Header box of the "practical file" paper (TOPIC / DATE), null for other papers. */
  practical: PracticalHeader | null;
}

export interface PracticalHeader {
  /** Outer double-line box. */
  boxX1: number;
  boxX2: number;
  boxY1: number;
  boxY2: number;
  /** Baseline of the printed labels and of the handwritten topic/date. */
  labelY: number;
  topicLabelX: number;
  topicLineX1: number;
  topicLineX2: number;
  dateLabelX: number;
  dateLineX1: number;
  dateLineX2: number;
  /** Second line of the double rule under the header (the first is topRuleY). */
  topRuleY2: number;
}

const mm = (value: number) => value * PX_PER_MM;
/** Last writing line of the practical-file sheet; the page number sits below it. */
const PRACTICAL_LAST_LINE_MM = 282;

/** Practical-file page header, modelled on common Indian lab-record sheets. */
function practicalHeader(margin: number): PracticalHeader {
  const boxX1 = Math.max(mm(6), margin - mm(1.5));
  const boxX2 = PAGE_WIDTH_PX - mm(24);
  const labelY = mm(24.5);
  return {
    boxX1,
    boxX2,
    boxY1: mm(12),
    boxY2: mm(27.5),
    labelY,
    topicLabelX: boxX1 + mm(3),
    topicLineX1: boxX1 + mm(13),
    topicLineX2: boxX2 - mm(37),
    dateLabelX: boxX2 - mm(35),
    dateLineX1: boxX2 - mm(26),
    dateLineX2: boxX2 - mm(3),
    topRuleY2: mm(31),
  };
}

export function computeGeometry(settings: RenderSettings): PageGeometry {
  const font = getFont(settings.fontId);
  const basePx = settings.fontSizePt * PX_PER_PT;
  const margin = settings.marginMm * PX_PER_MM;
  const practical = settings.paperType === "practical" ? practicalHeader(margin) : null;
  const topRuleY = practical ? practical.topRuleY2 : Math.max(margin, 20 * PX_PER_MM);

  let pitch: number;
  let linesPerPage: number;
  let bottomLimit: number;
  if (practical) {
    // Printed sheet: a fixed number of lines between the header rule and 282 mm.
    linesPerPage = settings.practicalLines;
    bottomLimit = mm(PRACTICAL_LAST_LINE_MM);
    pitch = (bottomLimit - topRuleY) / linesPerPage;
  } else {
    pitch = basePx * settings.lineHeight;
    const bottomReserve = settings.showPageNumbers
      ? Math.max(margin, 16 * PX_PER_MM, pitch * 1.6)
      : Math.max(margin * 0.75, 12 * PX_PER_MM);
    bottomLimit = PAGE_HEIGHT_PX - bottomReserve;
    linesPerPage = Math.max(1, Math.floor((bottomLimit - topRuleY) / pitch));
  }
  // Keep glyphs inside their own ruled line even for large fonts with tight spacing.
  const fontPx = Math.min(basePx * font.sizeScale, pitch * 0.95);
  const baselines = Array.from({ length: linesPerPage }, (_, k) => topRuleY + (k + 1) * pitch);
  const lastBaseline = baselines[baselines.length - 1]!;

  return {
    pageWidth: PAGE_WIDTH_PX,
    pageHeight: PAGE_HEIGHT_PX,
    fontPx,
    pitch,
    topRuleY,
    baselines,
    linesPerPage,
    marginLineX: margin,
    textLeft: margin + 3 * PX_PER_MM,
    textRight: PAGE_WIDTH_PX - Math.max(10 * PX_PER_MM, margin * 0.55),
    maxLineJitter: 1.5 * PX_PER_MM * settings.variation,
    // Midway through the free bottom area, but always clearly below the last text line.
    pageNumberY: practical
      ? Math.min(PAGE_HEIGHT_PX - mm(4), lastBaseline + Math.max(pitch * 1.2, mm(9)))
      : Math.max(lastBaseline + pitch, (bottomLimit + PAGE_HEIGHT_PX) / 2),
    practical,
  };
}
