import { xstr } from "./cells";
import { FILE_TYPES, type FileType } from "./file-types";
import type { Sheet, Workbook } from "./workbook";

export type Detection =
  | { status: "sure"; type: FileType }
  | { status: "unsure"; candidates: FileType[] }
  | { status: "none"; lookedFor: string };

export const NOT_USUAL_FILE =
  "This is not one of the usual Media Mind files. We look for: an ATL dashboard (\"Brand Name:\" line), the Activity Calendar, the FY Media Spent Report, Channel Cost, the billing \"Master\" sheet, Billboard Billing Status, a business's Digital file (Meta, YouTube, TikTok sheets) or the Billboard Master Sheet.";

type Match = "full" | "partial" | "no";
const norm = (v: unknown) => xstr(v).toLowerCase().replace(/\s+/g, " ");
const rowCells = (ws: Sheet, r: number) => Array.from({ length: Math.min(ws.maxCol, 60) }, (_, i) => norm(ws.v(r, i + 1)));
const MONTH = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'’-]*(\d{2,4})/i;

const visible = (wb: Workbook) => wb.visibleSheets();
const named = (wb: Workbook, name: string) => visible(wb).find((s) => norm(s.name) === name) ?? null;
const rows = (ws: Sheet, from: number, to: number) => Array.from({ length: Math.max(0, Math.min(to, ws.maxRow) - from + 1) }, (_, i) => from + i);
const ratio = (n: number, total: number): Match => (n === total ? "full" : n > 0 ? "partial" : "no");

/** How many keywords can each be matched to a different cell (bipartite matching, augmenting paths). */
function distinctMatches(keywords: string[], cells: string[]): number {
  const owner = new Map<number, number>(); // cell index -> keyword index
  const assign = (k: number, seen: Set<number>): boolean =>
    cells.some((c, i) => {
      if (seen.has(i) || !c.includes(keywords[k])) return false;
      seen.add(i);
      const prev = owner.get(i);
      if (prev !== undefined && !assign(prev, seen)) return false;
      owner.set(i, k);
      return true;
    });
  return keywords.filter((_, k) => assign(k, new Set())).length;
}

const RULES: Record<FileType, (wb: Workbook) => Match> = {
  atl(wb) {
    const ws = visible(wb)[0];
    if (!ws) return "no";
    let line = false;
    for (const r of rows(ws, 1, 8)) for (let c = 1; c <= 3; c++) if (/^brand( name)?\s*:/i.test(xstr(ws.v(r, c)))) line = true;
    if (!line) return "no";
    const header = rows(ws, 1, 15).some((r) => norm(ws.v(r, 1)) === "brand name" || norm(ws.v(r, 2)) === "brand");
    return header ? "full" : "partial";
  },
  calendar(wb) {
    const withHeader = visible(wb).filter((ws) => rows(ws, 1, 8).some((r) => norm(ws.v(r, 1)) === "business" && norm(ws.v(r, 2)) === "brand"));
    const monthly = withHeader.filter((ws) => MONTH.test(ws.name) || MONTH.test(xstr(ws.v(1, 1))));
    if (!monthly.length) return "no";
    const allTotals = monthly.every((ws) => rows(ws, 1, ws.maxRow).some((r) => norm(ws.v(r, 1)) === "grand total"));
    return allTotals ? "full" : "partial";
  },
  fy(wb) {
    const hasHeader = (ws: Sheet) => rows(ws, 1, 10).some((r) => norm(ws.v(r, 1)) === "brand" && norm(ws.v(r, 2)) === "media");
    const matching = visible(wb).filter(hasHeader);
    if (!matching.length) return "no";
    return matching.some((ws) => norm(ws.name).includes("final report")) ? "full" : "partial";
  },
  channel(wb) {
    const n = ["electronic", "digital", "press & radio"].filter((name) => named(wb, name)).length;
    return ratio(n, 3);
  },
  billing(wb) {
    const ws = named(wb, "master");
    if (!ws) return "no";
    // Each keyword must be in its own cell, so "Business Brand" in one cell counts once.
    const found = distinctMatches(["media/ vendor", "business", "brand", "month", "po number", "invoice no"], rowCells(ws, 1));
    return found === 6 ? "full" : found >= 3 ? "partial" : "no";
  },
  billboard(wb) {
    const ws = visible(wb)[0];
    if (!ws) return "no";
    let best: Match = "no";
    for (const r of rows(ws, 1, 20)) {
      const cells = rowCells(ws, r);
      if (cells[0] !== "sl" || !(cells[1] ?? "").match(/vendor|media/)) continue;
      const full = cells.some((c) => c.includes("purchase order")) && cells.some((c) => c.includes("bill no"));
      if (full) return "full";
      best = "partial";
    }
    return best;
  },
  digital(wb) {
    const n = ["meta", "youtube", "tiktok"].filter((name) => {
      const ws = named(wb, name);
      return ws && norm(ws.v(1, 1)) === "brand" && norm(ws.v(1, 2)) === "month";
    }).length;
    return ratio(n, 3);
  },
  "ooh-sites"(wb) {
    const ws = visible(wb)[0];
    if (!ws) return "no";
    let best: Match = "no";
    for (const r of rows(ws, 1, 10)) {
      const cells = rowCells(ws, r);
      if (!cells.some((c) => c.includes("ooh location"))) continue;
      if (cells.some((c) => c.includes("latitude")) && cells.some((c) => c.includes("longitude"))) return "full";
      best = "partial";
    }
    return best;
  },
};

export function detectFileType(wb: Workbook): Detection {
  const results = FILE_TYPES.map((t) => [t, RULES[t](wb)] as const);
  const full = results.filter(([, m]) => m === "full").map(([t]) => t);
  if (full.length === 1) return { status: "sure", type: full[0] };
  const candidates = [...full, ...results.filter(([, m]) => m === "partial").map(([t]) => t)];
  return candidates.length ? { status: "unsure", candidates } : { status: "none", lookedFor: NOT_USUAL_FILE };
}
