import { round, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

/** Line-by-line port of his bMonth, BBIZ, BMG and parseBilling (template.html 625-639). Amounts are in BDT. */

type Cell = string | number | null;
export type BillingData = { bl: Cell[][]; br: { h: string[]; r: Cell[][] } };

const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BMN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const BBIZ: Record<string, string> = { Toiletries: "Toiletries", Hygiene: "Hygiene", Salt: "Salt", "ACI Salt": "Salt" };
const BMG: Record<string, string> = { TVC: "TV", Electronic: "TV", Digital: "Digital", Print: "Print", Newspaper: "Print", Magazine: "Print", "Press Ad": "Print", Branding: "Branding/OOH", "Film Branding": "Branding/OOH", "Cineplex Branding": "Branding/OOH", Research: "Research", Radio: "Radio" };
const look = (t: Record<string, string>, k: string): string | undefined => (Object.hasOwn(t, k) ? t[k] : undefined);

function bMonth(s: unknown): string | null {
  const t = xstr(s).toLowerCase();
  const m = t.match(/^([a-z]{3})/), y = t.match(/(\d{2,4})/);
  if (!m || !y || !Object.hasOwn(BMN, m[1])) return null;
  const yr = y[1].length <= 2 ? +y[1] : (+y[1]) % 100;
  return `20${String(yr).padStart(2, "0")}-${String(BMN[m[1]]).padStart(2, "0")}`;
}

export function readBilling(wb: Workbook): ReadResult<BillingData> {
  const ws = wb.sheet("Master");
  if (!ws) throw new ReadError('Sheet "Master" wasn\'t found in this file.');
  const H: string[] = [];
  for (let c = 1; c <= 22; c++) H.push(xstr(ws.v(1, c)));
  const R: unknown[][] = [];
  for (let r = 2; r <= ws.maxRow; r++) {
    const v: unknown[] = [];
    for (let c = 1; c <= 22; c++) { const cl = ws.cell(r, c); v.push(cl.date ? cl.date.toISOString().slice(0, 10) : cl.v); }
    if (v[1] == null || !xstr(v[1])) continue;
    R.push(v);
  }
  if (!R.length) throw new ReadError('The "Master" sheet has no rows.');
  const n = (v: unknown): number => { const k = typeof v === "number" ? v : parseFloat(v as string); return isFinite(k) ? k : 0; };

  // A bill split across lines (same PO and invoice, same amounts) is counted once.
  const g = new Map<string, unknown[][]>();
  R.forEach((r) => { const k = r[6] + "|" + r[9]; if (!g.has(k)) g.set(k, []); g.get(k)!.push(r); });
  const out: Cell[][] = [];
  for (const v of g.values()) {
    const same = v.length > 1 && new Set(v.map((x) => [n(x[8]), n(x[10]), n(x[16])].join("|"))).size === 1;
    const share = same ? 1 / v.length : 1;
    for (const x of v) {
      const med = xstr(x[5]);
      out.push([xstr(x[1]).replace(/\.\s*$/, "").trim(), look(BBIZ, xstr(x[2])) || "Others", xstr(x[2]), xstr(x[3]), bMonth(x[4]), look(BMG, med) || "Other", med, xstr(x[6]), xstr(x[9]),
        Math.round(n(x[8]) * share), Math.round(n(x[10]) * share), Math.round(n(x[16]) * share), Math.round(n(x[12]) * share), Math.round(n(x[15]) * share), Math.round(n(x[13]) * share), Math.round(n(x[11]) * share),
        same ? 1 : 0, xstr(x[4]), (xstr(x[20]) + " " + xstr(x[21])).trim()]);
    }
  }

  // PO-level unbilled spread: several invoices on one PO whose PO amounts agree.
  const pog = new Map<Cell, Map<Cell, Cell[][]>>();
  out.forEach((o) => {
    if (!pog.has(o[7])) pog.set(o[7], new Map());
    const m = pog.get(o[7])!;
    if (!m.has(o[8])) m.set(o[8], []);
    m.get(o[8])!.push(o);
  });
  for (const [po, invs] of pog) {
    if (!po || invs.size < 2) continue;
    const vals = [...invs.values()].map((v) => v.reduce((t, x) => t + (x[9] as number), 0));
    if (new Set(vals.map(Math.round)).size !== 1) continue;
    const P = vals[0], B = [...invs.values()].flat().reduce((t, x) => t + (x[10] as number), 0);
    if (P <= 0 || B > P * 1.02) continue;
    const U = Math.max(P - B, 0), nl = [...invs.values()].flat().length;
    for (const v of invs.values()) for (const x of v) {
      const w = B ? (x[10] as number) / B : 1 / nl;
      x[9] = Math.round((x[10] as number) + U * w);
      x[11] = Math.round(U * w);
      x[16] = 2;
    }
  }

  const raw = R.map((v) => {
    const o = v.map((x) => (typeof x === "number" ? (Math.abs(x) < 10 ? round(x, 4) : round(x, 2)) : x === "" ? null : x)) as Cell[];
    o.push(look(BBIZ, xstr(v[2])) || "Others", bMonth(v[4]));
    return o;
  });
  const po = out.reduce((t, x) => t + (x[9] as number), 0), ub = out.reduce((t, x) => t + (x[11] as number), 0);
  const bad = out.filter((o) => !o[4]).length;
  const months = [...new Set(out.map((o) => o[4]).filter((m): m is string => !!m))].sort();
  return {
    type: "billing",
    datasetKey: "billing",
    label: `Billing master, ${R.length.toLocaleString("en-US")} lines`,
    summary: `${R.length} lines · PO value ${f2(po / 1e6)} Mn · unbilled ${f2(ub / 1e6)} Mn (each bill counted once)`,
    months,
    rowCount: R.length,
    data: { bl: out, br: { h: H, r: raw } },
    warnings: bad ? [`${bad} lines have a month that couldn't be read`] : [],
  };
}
