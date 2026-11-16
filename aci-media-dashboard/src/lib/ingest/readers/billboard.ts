import { xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Cell as WbCell, CellValue, Workbook } from "../workbook";

/** Line-by-line port of his BBLEG_DEFAULT and parseBillboard (template.html 641-654). Amounts are in BDT. The status comes from the row colour. */

export type BillboardRow = {
  sl0: CellValue; v: string; po: string; bill: string; poa: number; ba: number; diff: number;
  st: string | null; en: string | null; sb: string | null; pr: string | null; stR: string | null; enR: string | null;
  biz: string; bz: string; b: string; billc: CellValue; chq: CellValue; loc: string; cm: string; show: string; status: string; sl: number;
};
export type BillboardData = { legend: string[]; rows: BillboardRow[] };

const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BBLEG_DEFAULT: Record<string, string> = { FFFF00: "Payment Done", "00B0F0": "Cheque in Hand", FBD4B4: "Finance/Audit", FF0000: "Bill Error/DOC Problem", "00B050": "Cheque in Counter" };
const hx = (h: string): number[] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

/** His day-first date rule. Returns [iso, raw text when it was text]. */
function dt(cl: WbCell): [string | null, string | null] {
  const v = cl.v;
  if (v == null || v === "" || v === 0 || v === "0") return [null, null];
  if (cl.date) {
    const d = cl.date;
    const D = d.getUTCDate(), M = d.getUTCMonth() + 1, Y = d.getUTCFullYear();
    const iso = D <= 12 ? `${Y}-${String(D).padStart(2, "0")}-${String(M).padStart(2, "0")}` : `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
    return [iso, null];
  }
  const raw = xstr(v).replace(/\.\.+/g, ".");
  const m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return [null, raw];
  const d = +m[1], mo = +m[2];
  let y = +m[3];
  if (y < 100) y += 2000;
  if (y >= 1000 && y < 2000) y += 1000;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1) return [null, raw];
  return [t.toISOString().slice(0, 10), raw];
}

export function readBillboard(wb: Workbook): ReadResult<BillboardData> {
  const ws = wb.sheet(wb.sheets.findIndex((s) => s.visible));
  if (!ws) throw new ReadError("No visible sheet was found in this file.");
  let hr = 0;
  for (let r = 1; r <= 20; r++) if (/^sl$/i.test(xstr(ws.v(r, 1))) && /vendor|media/i.test(xstr(ws.v(r, 2)))) { hr = r; break; }
  if (!hr) throw new ReadError('The header row ("SL · Name of the Media/ Vendor · …") wasn\'t found.');

  // The colour legend sits above the header: a coloured cell in column A, its meaning in column B.
  const leg: Record<string, string> = {};
  for (let r = 1; r < hr; r++) { const f = ws.cell(r, 1).fill, t = xstr(ws.v(r, 2)); if (f && t) leg[f] = t; }
  const LEG = Object.keys(leg).length ? leg : BBLEG_DEFAULT;

  const hcol: Record<string, number> = {};
  for (let c = 1; c <= ws.maxCol; c++) { const h = xstr(ws.v(hr, c)).toLowerCase(); if (h) hcol[h] = c; }
  const stCol = hcol["status"];
  const status = (r: number): string => {
    if (stCol) { const s = xstr(ws.v(r, stCol)); if (s) return s; }
    const f = ws.cell(r, 2).fill;
    if (!f) return "Unmarked";
    if (Object.hasOwn(LEG, f)) return LEG[f];
    const a = hx(f);
    let best: string | null = null, bd = 1e9;
    for (const k in LEG) { const d = hx(k).reduce((t, v, i) => t + (v - a[i]) ** 2, 0); if (d < bd) { bd = d; best = k; } }
    return LEG[best as string];
  };

  const rows: BillboardRow[] = [];
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    const a = ws.v(r, 1), b = ws.v(r, 2);
    if (a == null && (b == null || !xstr(b))) continue;
    const n = (c: number): number => { const v = ws.v(r, c); return typeof v === "number" ? v : 0; };
    const [st] = dt(ws.cell(r, 8)), [en] = dt(ws.cell(r, 9)), [sb] = dt(ws.cell(r, 12)), [pr] = dt(ws.cell(r, 13));
    const biz = xstr(ws.v(r, 10));
    rows.push({
      sl0: a, v: xstr(b), po: xstr(ws.v(r, 3)), bill: xstr(ws.v(r, 4)), poa: n(5), ba: n(6), diff: n(7), st, en, sb, pr,
      stR: st ? null : (ws.v(r, 8) ? xstr(ws.v(r, 8)) : null), enR: en ? null : (ws.v(r, 9) ? xstr(ws.v(r, 9)) : null),
      biz, bz: ["Toiletries", "Hygiene", "Salt"].includes(biz) ? biz : "Others", b: xstr(ws.v(r, 11)),
      billc: ws.v(r, 14), chq: ws.v(r, 15), loc: xstr(ws.v(r, 16)), cm: xstr(ws.v(r, 17)), show: xstr(ws.v(r, 18)), status: status(r), sl: 0,
    });
  }
  if (!rows.length) throw new ReadError("No bill rows were found under the header row.");
  rows.forEach((o, i) => { o.sl = i + 1; });

  const cnt: Record<string, number> = {};
  rows.forEach((o) => { cnt[o.status] = (cnt[o.status] || 0) + 1; });
  const warnings: string[] = [];
  const bad = rows.filter((o) => o.st && o.en && o.en < o.st).length;
  if (bad) warnings.push(`${bad} bills have an end date before the start date`);
  if (cnt.Unmarked) warnings.push(`${cnt.Unmarked} bills have no status colour`);
  return {
    type: "billboard",
    datasetKey: "billboard",
    label: `Billboard billing, ${rows.length} bills`,
    summary: `${rows.length} bills · ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(" · ")} · bill amount ${f2(rows.reduce((t, o) => t + o.ba, 0) / 1e6)} Mn`,
    months: [],
    rowCount: rows.length,
    data: { legend: [...new Set(Object.values(LEG))], rows },
    warnings,
  };
}
