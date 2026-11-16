import { monthLabel, pad2, sum, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

export type CalendarRow = { biz: string; b: string; v: number[]; t: number }; // v = [TV, Digital, Print, OOH] in BDT Mn
export type CalendarMonth = { m: string; label: string; rows: CalendarRow[]; notes: { tvCount?: string; channels?: string; digital?: string } };
export type CalendarData = { months: CalendarMonth[] };

const CALMON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function readCalendar(wb: Workbook): ReadResult<CalendarData> {
  const months: CalendarMonth[] = [];
  const warnings: string[] = [];
  for (const ws of wb.visibleSheets()) {
    const title = xstr(ws.v(1, 1));
    const mm = `${title} ${ws.name}`.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'’-]*(\d{2,4})/);
    if (!mm) { warnings.push(`Sheet "${ws.name}": month not recognised`); continue; }
    let y = Number(mm[2]); if (y < 100) y += 2000;
    const m = `${y}-${pad2(CALMON[mm[1]])}`;
    let hr = 0;
    for (let r = 1; r <= 8; r++) if (/^business$/i.test(xstr(ws.v(r, 1))) && /^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; break; }
    if (!hr) { warnings.push(`Sheet "${ws.name}": header row not found`); continue; }
    const col: Record<string, number> = {};
    for (let c = 3; c <= 12; c++) for (const r of [hr, hr + 1]) {
      const h = xstr(ws.v(r, c)).toLowerCase();
      if (["tv", "digital", "print", "ooh", "total"].includes(h) && !col[h]) col[h] = c;
    }
    const rows: CalendarRow[] = [];
    let biz: string | null = null;
    let sawGrandTotal = false;
    for (let r = hr + 2; r <= ws.maxRow; r++) {
      const a = xstr(ws.v(r, 1)), b = xstr(ws.v(r, 2));
      if (/^grand total$/i.test(a)) { sawGrandTotal = true; break; }
      if (a) biz = a;
      if (!b || /^total$/i.test(b)) continue;
      const bn = /^skin\s*gen$/i.test(b) ? "SkinZen" : b;
      const n = (c: number | undefined) => { const v = c ? ws.v(r, c) : null; return typeof v === "number" ? r4(v) : 0; };
      const v = [n(col.tv), n(col.digital), n(col.print), n(col.ooh)];
      rows.push({ biz: biz || "Others", b: bn, v, t: r4(v.reduce((x, y2) => x + y2, 0)) });
    }
    if (!sawGrandTotal) warnings.push(`Sheet "${ws.name}" has no Grand Total row; read to the last row.`);
    const notes: CalendarMonth["notes"] = {};
    for (let r = hr; r <= ws.maxRow; r++) {
      const t = xstr(ws.v(r, 1));
      if (/^total television channel/i.test(t)) notes.tvCount = t.replace(/^total television channel\s*/i, "").trim();
      else if (/^channel name/i.test(t)) notes.channels = t.replace(/^channel name\s*:\s*/i, "").trim();
      else if (/^digital media platform/i.test(t)) notes.digital = t.replace(/^digital media platform\s*/i, "").trim();
    }
    months.push({ m, label: ws.name.trim(), rows, notes });
  }
  if (!months.length) throw new ReadError("No monthly sheets were recognised. Each sheet needs a title like \"… July 2026\" and a Business · Brand · Media header.");
  months.sort((a, b) => a.m.localeCompare(b.m));
  const ms = months.map((x) => x.m);
  const total = sum(months, (x) => sum(x.rows, (r) => r.t));
  const active = new Set(months.flatMap((x) => x.rows.filter((r) => r.t > 0).map((r) => r.b))).size;
  return {
    type: "calendar",
    datasetKey: "calendar",
    label: `Activity Calendar, ${monthLabel(ms[0])} to ${monthLabel(ms[ms.length - 1])}`,
    summary: `${months.length} months (${ms.map(monthLabel).join(", ")}) · ${active} active brands · ${total.toFixed(2)} Mn total`,
    months: ms,
    rowCount: sum(months, (x) => x.rows.length),
    data: { months },
    warnings,
  };
}
