import type { BillboardData } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { BAD_AMOUNT, CHANNEL_SHEETS, type ChannelInput, type ChannelKey } from "@/lib/manual/rules";

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
