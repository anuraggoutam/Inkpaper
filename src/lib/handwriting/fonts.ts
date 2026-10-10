/**
 * Allowlisted handwriting fonts. Only ids from this registry are accepted by the renderer
 * and the export API; font-family strings are never taken from requests.
 * All files live in public/fonts and are redistributable (see public/fonts/*.LICENSE.txt).
 */

export interface FontFile {
  file: string;
  unicodeRange: string;
}

export interface HandwritingFont {
  id: string;
  label: string;
  description: string;
  family: string;
  files: FontFile[];
  /** Multiplier applied to the chosen point size so all fonts get a similar x-height (~0.47em of the base size). */
  sizeScale: number;
  license: string;
}

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const DEVANAGARI =
  "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF";

function files(name: string, subsets: ("latin" | "latin-ext")[]): FontFile[] {
  return subsets.map((subset) => ({
    file: `${name}-${subset}-400-normal.woff2`,
    unicodeRange: subset === "latin" ? LATIN : LATIN_EXT,
  }));
}

export const FONTS: readonly HandwritingFont[] = [
  {
    id: "caveat",
    label: "Caveat",
    description: "Quick, natural student handwriting",
    family: "InkPaper Caveat",
    files: files("caveat", ["latin", "latin-ext"]),
    sizeScale: 1.3,
    license: "SIL OFL 1.1",
  },
  {
    id: "nanum-pen",
    label: "Nanum Pen",
    description: "Thin ballpoint pen, tall letters",
    family: "InkPaper Nanum Pen",
    files: files("nanum-pen-script", ["latin"]),
    sizeScale: 1.0,
    license: "SIL OFL 1.1",
  },
  {
    id: "kalam",
    label: "Kalam",
    description: "Neat, upright, very readable",
    family: "InkPaper Kalam",
    files: files("kalam", ["latin", "latin-ext"]),
    sizeScale: 0.92,
    license: "SIL OFL 1.1",
  },
  {
    id: "indie-flower",
    label: "Indie Flower",
    description: "Rounded, friendly print",
    family: "InkPaper Indie Flower",
    files: files("indie-flower", ["latin", "latin-ext"]),
    sizeScale: 1.18,
    license: "SIL OFL 1.1",
  },
  {
    id: "patrick-hand",
    label: "Patrick Hand",
    description: "Clean marker-style print",
    family: "InkPaper Patrick Hand",
    files: files("patrick-hand", ["latin", "latin-ext"]),
    sizeScale: 1.0,
    license: "SIL OFL 1.1",
  },
  {
    id: "homemade-apple",
    label: "Homemade Apple",
    description: "Joined cursive, less readable",
    family: "InkPaper Homemade Apple",
    files: files("homemade-apple", ["latin"]),
    sizeScale: 0.7,
    license: "Apache License 2.0",
  },
];

/** Devanagari glyphs come from Kalam and are used as a fallback for every style. */
export const DEVANAGARI_FALLBACK: HandwritingFont = {
  id: "devanagari-fallback",
  label: "Kalam Devanagari",
  description: "Fallback for Hindi / Devanagari text",
  family: "InkPaper Devanagari",
  files: [{ file: "kalam-devanagari-400-normal.woff2", unicodeRange: DEVANAGARI }],
  sizeScale: 1,
  license: "SIL OFL 1.1",
};

export const FONT_IDS = FONTS.map((font) => font.id) as [string, ...string[]];
export const DEFAULT_FONT_ID = "caveat";

export function getFont(id: string): HandwritingFont {
  return FONTS.find((font) => font.id === id) ?? FONTS[0]!;
}

/** CSS font-family stack used by both canvas measurement and SVG rendering. */
export function fontStack(id: string): string {
  return `"${getFont(id).family}", "${DEVANAGARI_FALLBACK.family}", cursive`;
}

export function fontFaceCss(): string {
  return [...FONTS, DEVANAGARI_FALLBACK]
    .flatMap((font) =>
      font.files.map(
        (f) =>
          `@font-face{font-family:"${font.family}";font-style:normal;font-weight:400;font-display:block;` +
          `src:url("/fonts/${f.file}") format("woff2");unicode-range:${f.unicodeRange};}`,
      ),
    )
    .join("\n");
}

/** Unicode ranges the selected style renders with real handwriting glyphs (incl. the Devanagari fallback). */
export function coveredRanges(id: string): string[] {
  return [...getFont(id).files, ...DEVANAGARI_FALLBACK.files].map((f) => f.unicodeRange);
}
