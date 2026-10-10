import type { RenderSettings } from "@/lib/validation/schema";

export type InkName = "blue" | "black" | "red";

/** Ballpoint-like ink colours, each with a few shades used for subtle pressure variation. */
export const INK_SHADES: Record<InkName, readonly string[]> = {
  blue: ["#1b3a8c", "#203f94", "#183685", "#23449b"],
  black: ["#1d1d24", "#25252c", "#18181e", "#2b2b31"],
  red: ["#b0261f", "#ba2d25", "#a6221b", "#c0332a"],
};

export function answerInk(settings: RenderSettings): InkName {
  return settings.inkColor;
}

export function questionInk(settings: RenderSettings): InkName {
  return settings.questionInk === "same" ? settings.inkColor : settings.questionInk;
}

export function inkShade(ink: InkName, pick: number, variation: number): string {
  const shades = INK_SHADES[ink];
  if (variation <= 0) return shades[0]!;
  const index = Math.min(shades.length - 1, Math.floor(pick * shades.length));
  return shades[index]!;
}
