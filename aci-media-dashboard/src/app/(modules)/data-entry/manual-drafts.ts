import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import type { CellValue } from "@/lib/ingest/workbook";
import { normName } from "@/lib/names-normal";
import { BAD_AMOUNT, CHANNEL_SHEETS, FY_MEDIA, VENDOR_REQUIRED, type BillInput, type ChannelInput, type ChannelKey } from "@/lib/manual/rules";

// Pure helpers for the Manual Entry editors: what the boxes hold and what a save sends. Safe for the browser.

export type ManualBusiness = { slug: string; name: string; brands: string[] };
/** What the page hands the editors. versionId: the version opened (null: nothing yet), sent back for the data-changed check. */
export type ManualEntryData = {
  channel: { versionId: number | null; fyStart: number; data: ChannelData };
  fy: { versionId: number | null; fyStart: number; rows: FyRow[] };
  billboard: { versionId: number | null; data: BillboardData };
  businesses: ManualBusiness[];
};

export type AmountRead = { ok: true; value: number | null } | { ok: false };
/** A typed amount: commas allowed; blank gives null; anything that is not a finite number is not ok. */
export function readAmount(s: string): AmountRead {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}
/** An amount as its box shows it: 0 is blank ("A blank amount counts as 0"). */
export const amountText = (v: number): string => (v === 0 ? "" : String(v));
/** True when the draft differs from what was loaded. */
export const isDirty = <T>(draft: T, initial: T): boolean => JSON.stringify(draft) !== JSON.stringify(initial);

const blank12 = () => Array.from({ length: 12 }, () => "");

// ---- Channel cost ---------------------------------------------------------------------------------------------

export const CHANNEL_TABS: readonly { key: ChannelKey; label: string; column: string; add: string }[] = [
  { key: "elec", label: "Electronic", column: "Channel", add: "+ Add channel" },
  { key: "dig", label: "Digital", column: "Platform", add: "+ Add platform" },
  { key: "press", label: "Press & Radio", column: "Newspaper / station", add: "+ Add newspaper / station" },
];

export type ChannelDraftRow = { key: string; n: string; m: string[] };
export type ChannelDraft = Record<ChannelKey, ChannelDraftRow[]>;

export function channelDraft(data: ChannelData): ChannelDraft {
  const rows = (k: ChannelKey): ChannelDraftRow[] =>
    data[k].rows.map((r, i) => ({ key: `${k}-${i}`, n: r.n, m: Array.from({ length: 12 }, (_, j) => amountText(r.m[j] ?? 0)) }));
  return { elec: rows("elec"), dig: rows("dig"), press: rows("press") };
}

const onRow = (d: ChannelDraft, k: ChannelKey, key: string, f: (r: ChannelDraftRow) => ChannelDraftRow): ChannelDraft =>
  ({ ...d, [k]: d[k].map((r) => (r.key === key ? f(r) : r)) });

export const addChannelRow = (d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft => ({ ...d, [k]: [...d[k], { key, n: "", m: blank12() }] });
export const removeChannelRow = (d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft => ({ ...d, [k]: d[k].filter((r) => r.key !== key) });
export const setChannelName = (d: ChannelDraft, k: ChannelKey, key: string, n: string): ChannelDraft => onRow(d, k, key, (r) => ({ ...r, n }));
export const setChannelAmount = (d: ChannelDraft, k: ChannelKey, key: string, month: number, text: string): ChannelDraft =>
  onRow(d, k, key, (r) => ({ ...r, m: r.m.map((v, i) => (i === month ? text : v)) }));

/** The draft as saveChannelAction takes it (blank is 0), or the first problem. The server drops nameless rows. */
export function channelInput(d: ChannelDraft): { ok: true; data: ChannelInput } | { ok: false; error: string } {
  const data: ChannelInput = { elec: [], dig: [], press: [] };
  for (const k of CHANNEL_SHEETS) {
    for (const r of d[k]) {
      const m: number[] = [];
      for (const s of r.m) {
        const a = readAmount(s);
        if (!a.ok) return { ok: false, error: BAD_AMOUNT };
        m.push(a.value ?? 0);
      }
      data[k].push({ n: r.n, m });
    }
  }
  return { ok: true, data };
}

// ---- FY media spend -------------------------------------------------------------------------------------------

export type FyDraftRow = { biz: string; b: string; med: string; m: string[]; py: string };
export type NewBrand = { name: string; businessSlug: string };
/** rows: every FY row (other media kept as they are); newBrands: names added in this editor, for the list. */
export type FyDraft = { rows: FyDraftRow[]; newBrands: NewBrand[] };
export type FyBrand = { biz: string; b: string };
export type BrandToAdd = { name: string; businessSlug: string; businessName: string; isNew: boolean };
/** The "New brand…" option of the Add brand dialog's Brand select. */
export const NEW_BRAND = "__new__";

export const fyBrandKey = (x: FyBrand): string => JSON.stringify([x.biz, x.b]);
const isBrand = (r: FyDraftRow, x: FyBrand) => r.biz === x.biz && r.b === x.b;
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

export const fyDraft = (rows: FyRow[]): FyDraft => ({
  rows: rows.map((r) => ({ biz: r.biz, b: r.b, med: r.med, m: Array.from({ length: 12 }, (_, j) => amountText(r.m[j] ?? 0)), py: amountText(r.py) })),
  newBrands: [],
});

/** The brand select: brands by business, in the order they first appear in the data. */
export function fyBrandGroups(d: FyDraft): { biz: string; brands: FyBrand[] }[] {
  const groups: { biz: string; brands: FyBrand[] }[] = [];
  const seen = new Set<string>();
  for (const r of d.rows) {
    const key = fyBrandKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    let g = groups.find((x) => x.biz === r.biz);
    if (!g) {
      g = { biz: r.biz, brands: [] };
      groups.push(g);
    }
    g.brands.push({ biz: r.biz, b: r.b });
  }
  return groups;
}

/** One brand's table: TV, Digital, Print, OOH (blank when the brand has no such row), then any other medium it has. */
export function fyTable(d: FyDraft, brand: FyBrand): { med: string; m: string[]; py: string }[] {
  const own = d.rows.filter((r) => isBrand(r, brand));
  const fixed = FY_MEDIA.map((med) => own.find((r) => r.med === med) ?? { med, m: blank12(), py: "" });
  const others = own.filter((r) => !(FY_MEDIA as readonly string[]).includes(r.med));
  return [...fixed, ...others].map(({ med, m, py }) => ({ med, m, py }));
}

/** Types one box (a month 0..11, or "py" for Last FY), making the brand's row for that medium when it has none. */
export function setFyAmount(d: FyDraft, brand: FyBrand, med: string, col: number | "py", text: string): FyDraft {
  const at = d.rows.findIndex((r) => isBrand(r, brand) && r.med === med);
  const base = at >= 0 ? d.rows[at] : { biz: brand.biz, b: brand.b, med, m: blank12(), py: "" };
  const next = col === "py" ? { ...base, py: text } : { ...base, m: base.m.map((v, j) => (j === col ? text : v)) };
  return { ...d, rows: at >= 0 ? d.rows.map((r, j) => (j === at ? next : r)) : [...d.rows, next] };
}

export function addFyBrand(d: FyDraft, add: BrandToAdd): FyDraft {
  const rows = FY_MEDIA.map((med) => ({ biz: add.businessName, b: add.name, med, m: blank12(), py: "" }));
  return { rows: [...d.rows, ...rows], newBrands: add.isNew ? [...d.newBrands, { name: add.name, businessSlug: add.businessSlug }] : d.newBrands };
}

/** The draft as saveFyAction takes it (blank is 0), or the first problem. The server drops all-0 rows. */
export function fyInput(d: FyDraft): { ok: true; rows: FyRow[]; newBrands: NewBrand[] } | { ok: false; error: string } {
  const rows: FyRow[] = [];
  for (const r of d.rows) {
    const read = [...r.m, r.py].map(readAmount);
    const nums: number[] = [];
    for (const a of read) {
      if (!a.ok) return { ok: false, error: BAD_AMOUNT };
      nums.push(a.value ?? 0);
    }
    rows.push({ biz: r.biz, b: r.b, med: r.med, m: nums.slice(0, 12), py: nums[12] });
  }
  return { ok: true, rows, newBrands: d.newBrands };
}

/** A business's brands on the list that are not in the FY data yet. */
export function brandChoices(d: FyDraft, business: ManualBusiness): string[] {
  const inData = new Set(d.rows.map((r) => normName(r.b)));
  return business.brands.filter((n) => !inData.has(normName(n)));
}

/** The Add brand dialog's answer, or what to show in red. A typed name on the list takes the list's spelling. */
export function brandToAdd(d: FyDraft, businesses: ManualBusiness[], pick: { businessSlug: string; brand: string; newName: string }):
  { ok: true; brand: BrandToAdd } | { ok: false; error: string } {
  const business = businesses.find((b) => b.slug === pick.businessSlug);
  if (!business) return { ok: false, error: "Pick the business." };
  const typed = tidy(pick.brand === NEW_BRAND ? pick.newName : pick.brand);
  if (!typed) return { ok: false, error: "Pick a brand or type a new name." };
  if (d.rows.some((r) => normName(r.b) === normName(typed))) return { ok: false, error: `${typed} is already in the FY data.` };
  const onList = businesses.flatMap((b) => b.brands).find((n) => normName(n) === normName(typed));
  return { ok: true, brand: { name: onList ?? typed, businessSlug: business.slug, businessName: business.name, isNew: !onList } };
}

// ---- OOH / billboard bills ------------------------------------------------------------------------------------

export type BillForm = Record<"v" | "po" | "bill" | "b" | "billc" | "chq" | "loc" | "cm" | "poa" | "ba" | "diff" | "st" | "en" | "sb" | "pr" | "biz" | "status", string>;
export const NEW_BILL_STATUS = "Finance/Audit";
export const BILLS_SHOWN = 40;

const cellText = (v: CellValue): string => (v == null ? "" : String(v));

export const billForm = (r: BillboardRow): BillForm => ({
  v: r.v, po: r.po, bill: r.bill, b: r.b, billc: cellText(r.billc), chq: cellText(r.chq), loc: r.loc, cm: r.cm,
  poa: String(r.poa), ba: String(r.ba), diff: String(r.diff), st: r.st ?? "", en: r.en ?? "", sb: r.sb ?? "", pr: r.pr ?? "",
  biz: r.biz, status: r.status,
});

/** A new bill: Status Finance/Audit (else the legend's first) and today's date as the Submit Date. */
export const newBillForm = (statuses: readonly string[], today: string): BillForm => ({
  v: "", po: "", bill: "", b: "", billc: "", chq: "", loc: "", cm: "", poa: "", ba: "", diff: "", st: "", en: "", sb: today, pr: "", biz: "",
  status: statuses.includes(NEW_BILL_STATUS) ? NEW_BILL_STATUS : (statuses[0] ?? NEW_BILL_STATUS),
});

/** The form as changeBillboardAction takes a bill: blank amounts null, or the first problem. */
export function billInput(f: BillForm): { ok: true; bill: BillInput } | { ok: false; error: string } {
  if (!f.v.trim()) return { ok: false, error: VENDOR_REQUIRED };
  const poa = readAmount(f.poa);
  const ba = readAmount(f.ba);
  const diff = readAmount(f.diff);
  if (!poa.ok || !ba.ok || !diff.ok) return { ok: false, error: BAD_AMOUNT };
  return {
    ok: true,
    bill: {
      v: f.v, po: f.po, bill: f.bill, b: f.b, billc: f.billc, chq: f.chq, loc: f.loc, cm: f.cm,
      poa: poa.value, ba: ba.value, diff: diff.value, st: f.st, en: f.en, sb: f.sb, pr: f.pr, biz: f.biz, status: f.status,
    },
  };
}

/** Search: vendor, PO, bill no, brand or location contains the text, ignoring case and spaces. */
export const billMatches = (r: BillboardRow, query: string): boolean => {
  const q = normName(query);
  return !q || [r.v, r.po, r.bill, r.b, r.loc].some((s) => normName(s).includes(q));
};

/** The bills to list: matching the search, newest (highest SL) first, the first 40 unless Show all. */
export function billsToShow(rows: BillboardRow[], query: string, showAll: boolean): { shown: BillboardRow[]; matching: number } {
  const hits = rows.filter((r) => billMatches(r, query)).sort((a, b) => b.sl - a.sl);
  return { shown: showAll ? hits : hits.slice(0, BILLS_SHOWN), matching: hits.length };
}

/** A select's options plus the bill's own value when the list does not have it, so an edit never changes it silently. */
export const withCurrent = (options: readonly string[], current: string): string[] =>
  current.trim() && !options.some((o) => normName(o) === normName(current)) ? [...options, current] : [...options];

export const billsCaption = (n: number): string => `${n} ${n === 1 ? "bill" : "bills"} · add a bill or change a status. Each save publishes.`;
