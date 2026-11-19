import { monthLabel, pad2, round, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

/** Line-by-line port of his parseChannel (template.html 618-623). Spend is in whole BDT. */

export type ChannelRow = { sl: unknown; n: string; m: number[] };
export type ChannelSheet = { rows: ChannelRow[]; notes: unknown[][] };
export type ChannelData = Record<"elec" | "dig" | "press", ChannelSheet>;

const SHEETS = [["Electronic", "elec"], ["Digital", "dig"], ["Press & Radio", "press"]] as const;
const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON_LABEL = /^([a-z]{3})[a-z]*\s*['’]?\s*(\d{2,4})$/i;
const MON_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "Electronic x Mn · Digital y Mn · Press & Radio z Mn": the upload's summary line. Manual Entry uses it too. */
export function channelSummary(data: ChannelData): string {
  const T = (k: keyof ChannelData) => data[k].rows.reduce((t, r) => t + r.m.reduce((a, b) => a + b, 0), 0);
  return `Electronic ${f2(T("elec") / 1e6)} Mn · Digital ${f2(T("dig") / 1e6)} Mn · Press & Radio ${f2(T("press") / 1e6)} Mn`;
}

/** "Channel Cost, Jul'26 to Nov'26" for sorted "YYYY-MM" months; "Channel Cost" for none. */
export const channelLabel = (months: string[]): string =>
  months.length ? `Channel Cost, ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : "Channel Cost";

export function readChannel(wb: Workbook): ReadResult<ChannelData> {
  const out = {} as ChannelData;
  const warn: string[] = [];
  const headers: (string | null)[][] = [];
  for (const [sh, key] of SHEETS) {
    const ws = wb.sheet(sh);
    if (!ws) { warn.push(`No "${sh}" sheet`); out[key] = { rows: [], notes: [] }; continue; }
    const rows: ChannelRow[] = [], notes: unknown[][] = [];
    for (let r = 3; r <= ws.maxRow; r++) {
      const a = ws.v(r, 1), b = ws.v(r, 2);
      if (b == null || !xstr(b) || /^(total|contribution)$/i.test(xstr(a))) continue;
      const m: number[] = [];
      for (let c = 3; c <= 14; c++) { const v = ws.v(r, c); m.push(typeof v === "number" ? round(v, 2) : 0); }
      const st = ws.v(r, 15), s = m.reduce((t, v) => t + v, 0);
      if (Math.abs(s - (typeof st === "number" ? st : 0)) > 1) notes.push([xstr(b), Math.round(s), typeof st === "number" ? st : null]);
      rows.push({ sl: a, n: xstr(b), m });
    }
    out[key] = { rows, notes };
    if (!headers.length || key === "elec") {
      // The real file has the month labels in row 2 (row 1 is blank); synthetic files may use row 1.
      for (const hr of [1, 2]) {
        const h: (string | null)[] = [];
        for (let c = 3; c <= 14; c++) h.push(xstr(ws.v(hr, c)) || null);
        headers[0] = h;
        if (h.some((x) => x && MON_LABEL.test(x))) break;
      }
    }
  }
  if (!out.elec.rows.length && !out.dig.rows.length && !out.press.rows.length) throw new ReadError("None of the Electronic, Digital or Press & Radio sheets had rows.");

  // Months: parse the header labels (columns 3-14), keep those with any non-zero value in any sheet.
  const allRows = [...out.elec.rows, ...out.dig.rows, ...out.press.rows];
  const months: string[] = [];
  (headers[0] ?? []).forEach((label, i) => {
    const mm = label?.match(MON_LABEL);
    const mon = mm ? MON_NUM[mm[1].toLowerCase()] : undefined;
    if (!mm || !mon || !allRows.some((r) => r.m[i])) return;
    const y = mm[2].length === 2 ? 2000 + Number(mm[2]) : Number(mm[2]);
    months.push(`${y}-${pad2(mon)}`);
  });
  months.sort();
  const rowCount = allRows.length;
  return {
    type: "channel",
    datasetKey: "channel",
    label: channelLabel(months),
    summary: channelSummary(out),
    months,
    rowCount,
    data: out,
    warnings: warn,
  };
}
