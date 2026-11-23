import { pad2, round, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

/** Line-by-line port of his parseFY (template.html 607-616). Spend is in BDT Mn. */

export type FyRow = { biz: string; b: string; med: string; m: number[]; py: number };

/** The warning when the file has no business summary table: the businesses are his standard order, not the file's. */
export const FY_STANDARD_ORDER = "Business summary table not found; used the standard business order";
const FYM = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function readFy(wb: Workbook): ReadResult<FyRow[]> {
  let ws = null;
  for (const s of wb.sheets) if (/final report/i.test(s.name) && s.visible) { ws = wb.sheet(s.name); break; }
  if (!ws) ws = wb.sheet(wb.sheets.findIndex((s) => s.visible));
  if (!ws) throw new ReadError("No visible report sheet was found.");
  let hr = 0;
  for (let r = 1; r <= 10; r++) if (/^brand$/i.test(xstr(ws.v(r, 1)))) { hr = r; break; }
  if (!hr) throw new ReadError(`The header row ("Brand · Media · July…") wasn't found in sheet "${ws.name}".`);
  const names: string[] = [];
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    if (/^business$/i.test(xstr(ws.v(r, 1)))) {
      for (let q = r + 1; q <= ws.maxRow; q++) { const n = xstr(ws.v(q, 1)); if (!n || /^total$/i.test(n)) break; names.push(n); }
      break;
    }
  }
  const groups = names.length ? names : ["Toiletries", "Hygiene", "Salt", "Foods", "Electrolyte", "Commodity"];
  const out: FyRow[] = [];
  let g = 0, b: string | null = null;
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    const a = xstr(ws.v(r, 1));
    if (/^grand total$/i.test(a)) break;
    if (/^total$/i.test(a)) { g++; b = null; continue; }
    if (a) b = a;
    let med = xstr(ws.v(r, 2));
    if (!med || !b) continue;
    if (med === "Press") med = "Print";
    const mv: number[] = [];
    for (let c = 3; c <= 14; c++) { const v = ws.v(r, c); mv.push(typeof v === "number" ? round(v, 6) : 0); }
    const py = ws.v(r, 16);
    out.push({ biz: groups[g] || "Others", b, med, m: mv, py: typeof py === "number" ? round(py, 6) : 0 });
  }
  const rows = out.filter((r) => r.m.some((v) => v) || r.py);
  if (!rows.length) throw new ReadError("No brand rows with values were found.");
  const tot = rows.reduce((t, r) => t + r.m.reduce((a, c) => a + c, 0), 0);
  const nm = FYM.filter((_, i) => rows.some((r) => r.m[i])).length;

  const fyMatch = ws.name.match(/(\d{4})-(\d{2})/);
  const startYear = fyMatch ? Number(fyMatch[1]) : null;
  const months: string[] = [];
  if (startYear) {
    FYM.forEach((_, i) => {
      if (!rows.some((r) => r.m[i])) return;
      const calMonth = ((i + 6) % 12) + 1; // Jul=7 ... Dec=12, Jan=1 ... Jun=6
      months.push(`${i < 6 ? startYear : startYear + 1}-${pad2(calMonth)}`);
    });
  }
  return {
    type: "fy",
    datasetKey: "fy",
    label: fyMatch ? `FY spend, FY ${fyMatch[1]}-${fyMatch[2]}` : "FY spend",
    summary: `${new Set(rows.map((r) => r.b)).size} brands · ${groups.length} business groups · FY spend ${f2(tot)} Mn over ${nm} months`,
    months,
    rowCount: rows.length,
    data: rows,
    warnings: names.length ? [] : [FY_STANDARD_ORDER],
  };
}
