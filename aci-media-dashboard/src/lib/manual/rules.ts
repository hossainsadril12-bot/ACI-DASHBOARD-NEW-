import { monthLabel, pad2, round } from "../ingest/cells";
import { DEFAULT_BILL_STATUSES, billboardLabel, businessGroup, type BillboardData, type BillboardRow } from "../ingest/readers/billboard";
import { channelLabel, channelSummary, type ChannelData, type ChannelSheet } from "../ingest/readers/channel";
import type { FyRow } from "../ingest/readers/fy";
import { ValidationError } from "../../server/errors";

// Manual Entry's save rules (design 3.1 to 3.3). Pure: no store, no clock of its own, safe for the browser.

export const VENDOR_REQUIRED = "Enter the name of the media / vendor.";
export const BAD_AMOUNT = "Amounts must be numbers.";
export const BAD_DATE = "Dates must be real dates.";
export const BAD_STATUS = "Pick a status from the list.";
export const NO_BILL = "That bill no longer exists. Reload to see the latest.";

export const CHANNEL_SHEETS = ["elec", "dig", "press"] as const;
export type ChannelKey = (typeof CHANNEL_SHEETS)[number];
/** What the Channel cost editor sends: each sheet's rows, a name and 12 amounts (Jul to Jun) in BDT. */
export type ChannelInput = Record<ChannelKey, { n: string; m: number[] }[]>;

/** The rows the FY editor shows for every brand. */
export const FY_MEDIA = ["TV", "Digital", "Print", "OOH"] as const;

/** One bill as the dialog sends it: text as typed, amounts null when blank, dates "YYYY-MM-DD" or "". */
export type BillInput = {
  v: string; po: string; bill: string; b: string; billc: string; chq: string; loc: string; cm: string;
  poa: number | null; ba: number | null; diff: number | null;
  st: string; en: string; sb: string; pr: string;
  biz: string; status: string;
};
export type BillChange = { op: "add"; bill: BillInput } | { op: "edit"; sl: number; bill: BillInput } | { op: "delete"; sl: number };

/** The summary a manual version stores, in the same fields an upload's has (History reads rowCount). */
export type ManualSummary = { summary: string; months: string[]; rowCount: number; warnings: string[]; fyStart?: number };
/** What a manual save publishes: an upload's publish input without the file and the source. */
export type ManualVersion<T> = { datasetKey: string; kind: string; label: string; summary: ManualSummary; data: T };

const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- FY (July to June) --------------------------------------------------------------------------------------

/** "YYYY-MM-DD" of a moment in Dhaka. */
export const dhakaDate = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The start year of the FY a moment falls in, in Dhaka. */
export function currentFyStart(now: Date): number {
  const [y, m] = dhakaDate(now).split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

/** The FY a version is about: Manual Entry's own fyStart, else "FY 2026-27" in its label, else its first month, else today's FY. */
export function fyStartOf(active: { label: string; summary: Record<string, unknown> } | null, now: Date): number {
  if (!active) return currentFyStart(now);
  const own = active.summary.fyStart;
  if (typeof own === "number" && Number.isInteger(own)) return own;
  const inLabel = active.label.match(/FY (\d{4})-\d{2}/);
  if (inLabel) return Number(inLabel[1]);
  const months = active.summary.months;
  const first = Array.isArray(months) ? months.find((x): x is string => typeof x === "string" && /^\d{4}-\d{2}$/.test(x)) : undefined;
  if (first) {
    const [y, m] = first.split("-").map(Number);
    return m >= 7 ? y : y - 1;
  }
  return currentFyStart(now);
}

/** The 12 months of an FY, "YYYY-MM", Jul to Jun. */
export const fyMonths = (fyStart: number): string[] =>
  Array.from({ length: 12 }, (_, i) => (i < 6 ? `${fyStart}-${pad2(i + 7)}` : `${fyStart + 1}-${pad2(i - 5)}`));
/** "Jul'26" … "Jun'27". */
export const fyMonthLabels = (fyStart: number): string[] => fyMonths(fyStart).map(monthLabel);
/** "2026-27". */
export const fyName = (fyStart: number): string => `${fyStart}-${pad2((fyStart + 1) % 100)}`;

/** The FY's months that have any amount in any row. */
const usedMonths = (fyStart: number, rows: { m: number[] }[]) => fyMonths(fyStart).filter((_, i) => rows.some((r) => r.m[i]));

// ---- Channel cost ---------------------------------------------------------------------------------------------

/** Rows with no name dropped, names trimmed, SL 1..N per sheet, amounts to 2 decimals (as the reader), notes cleared. */
export function cleanChannel(input: ChannelInput): ChannelData {
  const sheet = (rows: ChannelInput[ChannelKey]): ChannelSheet => ({
    rows: rows
      .map((r) => ({ n: r.n.trim(), m: r.m.map((v) => round(v, 2)) }))
      .filter((r) => r.n !== "")
      .map((r, i) => ({ sl: i + 1, n: r.n, m: r.m })),
    notes: [],
  });
  return { elec: sheet(input.elec), dig: sheet(input.dig), press: sheet(input.press) };
}

export function channelVersion(input: ChannelInput, fyStart: number): ManualVersion<ChannelData> {
  const data = cleanChannel(input);
  const all = CHANNEL_SHEETS.flatMap((k) => data[k].rows);
  const months = usedMonths(fyStart, all);
  return {
    datasetKey: "channel", kind: "channel", label: channelLabel(months),
    summary: { summary: channelSummary(data), months, rowCount: all.length, warnings: [], fyStart },
    data,
  };
}

// ---- FY media spend --------------------------------------------------------------------------------------------

/** Names trimmed, values to 4 decimals, rows with every value 0 (12 months and last FY) dropped. Order kept. */
export function cleanFy(rows: FyRow[]): FyRow[] {
  return rows
    .map((r) => ({ biz: r.biz.trim(), b: r.b.trim(), med: r.med.trim(), m: r.m.map((v) => round(v, 4)), py: round(r.py, 4) }))
    .filter((r) => r.m.some((v) => v !== 0) || r.py !== 0);
}

/** "N brands · FY spend x Mn" (design 3.2; his app's manual line). */
export function fySummary(rows: FyRow[]): string {
  const total = rows.reduce((t, r) => t + r.m.reduce((a, b) => a + b, 0), 0);
  return `${new Set(rows.map((r) => r.b)).size} brands · FY spend ${f2(total)} Mn`;
}

export function fyVersion(rows: FyRow[], fyStart: number): ManualVersion<FyRow[]> {
  const data = cleanFy(rows);
  return {
    datasetKey: "fy", kind: "fy", label: `FY spend, FY ${fyName(fyStart)}`,
    summary: { summary: fySummary(data), months: usedMonths(fyStart, data), rowCount: data.length, warnings: [], fyStart },
    data,
  };
}

// ---- OOH / billboard bills ---------------------------------------------------------------------------------------

function billRow(input: BillInput, prev: BillboardRow | null, biz: string, status: string): BillboardRow {
  const poa = round(input.poa ?? 0, 2);
  const ba = round(input.ba ?? 0, 2);
  const day = (s: string) => s.trim() || null;
  const st = day(input.st);
  const en = day(input.en);
  return {
    sl0: prev ? prev.sl0 : null,
    v: input.v.trim(), po: input.po.trim(), bill: input.bill.trim(), poa, ba, diff: round(input.diff ?? poa - ba, 2),
    st, en, sb: day(input.sb), pr: day(input.pr),
    // the sheet's unreadable date text stays until the admin types a real date there
    stR: !st && prev && prev.st === null ? prev.stR : null, enR: !en && prev && prev.en === null ? prev.enR : null,
    biz, bz: businessGroup(biz), b: input.b.trim(), billc: input.billc.trim(), chq: input.chq.trim(),
    loc: input.loc.trim(), cm: input.cm.trim(), show: prev ? prev.show : "", status, sl: 0,
  };
}

/**
 * One add, edit or delete on the whole bill list, then every bill renumbered 1..N in stored order (a new bill goes
 * last, so it has the highest SL). `businessOf` turns the typed business into the one stored, or throws.
 */
export function applyBillChange(
  data: BillboardData | null,
  change: BillChange,
  businessOf: (raw: string, prev: BillboardRow | null) => string,
): { data: BillboardData; summary: string } {
  const legend = data && data.legend.length ? [...data.legend] : [...DEFAULT_BILL_STATUSES];
  const rows = [...(data?.rows ?? [])];
  const build = (bill: BillInput, prev: BillboardRow | null) => {
    const status = bill.status.trim();
    if (!legend.includes(status) && status !== prev?.status) throw new ValidationError(BAD_STATUS);
    return billRow(bill, prev, businessOf(bill.biz, prev), status);
  };
  let row: BillboardRow;
  let verb: string;
  if (change.op === "add") {
    row = build(change.bill, null);
    rows.push(row);
    verb = "Added";
  } else {
    const at = rows.findIndex((r) => r.sl === change.sl);
    const prev = at >= 0 ? rows[at] : undefined;
    if (!prev) throw new ValidationError(NO_BILL);
    if (change.op === "delete") {
      row = prev;
      rows.splice(at, 1);
      verb = "Deleted";
    } else {
      row = build(change.bill, prev);
      rows[at] = row;
      verb = "Edited";
    }
  }
  const head = row.bill ? `${verb} bill ${row.bill}` : `${verb} bill`;
  return { data: { legend, rows: rows.map((r, i) => ({ ...r, sl: i + 1 })) }, summary: [head, row.v, row.status].join(" · ") };
}

export function billboardVersion(data: BillboardData, summary: string): ManualVersion<BillboardData> {
  const n = data.rows.length;
  return { datasetKey: "billboard", kind: "billboard", label: billboardLabel(n), summary: { summary, months: [], rowCount: n, warnings: [] }, data };
}
