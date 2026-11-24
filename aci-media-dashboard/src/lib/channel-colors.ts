import type { FyMedium } from "@/lib/pages/fy-spend";

export const CHANNEL_COLORS: Record<string, string> = {
  TV: "bg-teal-600 text-white",
  PRESS: "bg-amber-500 text-gray-950",
  RADIO: "bg-violet-600 text-white",
  OOH: "bg-emerald-600 text-white",
  DIGITAL: "bg-rose-600 text-white",
  META: "bg-blue-700 text-white",
  YOUTUBE: "bg-red-600 text-white",
  TIKTOK: "bg-gray-800 text-white",
};

export const FALLBACK_COLOR = "bg-gray-500 text-white";

/** The four FY media (3.1, 3.2) in their channel colours: fills for lanes and squares, text for figures. */
export const MEDIUM_BG: Record<FyMedium, string> = { TV: "bg-teal-600", Digital: "bg-rose-600", Print: "bg-amber-500", OOH: "bg-emerald-600" };
/** A 1px inner edge for fills under 3:1 against white: only Print's amber-500 needs it (amber-600 meets 3:1). */
export const MEDIUM_EDGE: Record<FyMedium, string> = { TV: "", Digital: "", Print: "ring-1 ring-inset ring-amber-600", OOH: "" };
// One step darker than the fill, so a figure on white stays readable.
export const MEDIUM_TEXT: Record<FyMedium, string> = { TV: "text-teal-700", Digital: "text-rose-700", Print: "text-amber-700", OOH: "text-emerald-700" };

export function mainChannel(lines: { code: string; plannedAmount: number }[]): string | null {
  if (lines.length === 0) return null;
  return lines.reduce((best, l) => (l.plannedAmount > best.plannedAmount ? l : best)).code;
}
