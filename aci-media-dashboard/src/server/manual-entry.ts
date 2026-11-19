import { z } from "zod";
import { normName } from "@/lib/names-normal";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import {
  BAD_AMOUNT, BAD_DATE, BAD_STATUS, VENDOR_REQUIRED, applyBillChange, billboardVersion, channelVersion, fyStartOf, fyVersion,
  type ManualVersion,
} from "@/lib/manual/rules";
import { applyCatalogChanges, cleanName, getCatalog, type Catalog, type CatalogChange } from "@/store/catalog";
import { activeIfCurrentTx, publishVersionsTx } from "@/store/datasets";
import type { Store, StoreTx } from "@/store/client";
import { ValidationError } from "./errors";

// Manual Entry saves (design section 4): zod first, then one write transaction that checks the version the admin
// opened, adds any new brand, and publishes with source "manual". Untrusted input: every id is checked here.

export const INVALID_INPUT = "Some values could not be saved. Check them and try again.";
const NO_BUSINESS = "That business doesn't exist.";
/** Our messages; any other zod issue becomes INVALID_INPUT, so no schema detail reaches the screen. */
const KNOWN = new Set([VENDOR_REQUIRED, BAD_AMOUNT, BAD_DATE, BAD_STATUS]);

const MAX_BDT = 1e12; // channel and bill amounts, BDT
const MAX_MN = 1e9; // FY amounts, BDT Mn
const amount = (max: number) => z.number({ error: BAD_AMOUNT }).min(-max, { error: BAD_AMOUNT }).max(max, { error: BAD_AMOUNT });
const baseVersionId = z.number().int().positive().nullable();
const name = z.string().trim().min(1).max(120);
const text = (max: number) => z.string().max(max);
const day = z.union([z.literal(""), z.iso.date({ error: BAD_DATE })]);

const channelRows = z.array(z.object({ n: z.string().max(120), m: z.array(amount(MAX_BDT)).length(12) })).max(500);
export const ChannelSaveSchema = z.object({ baseVersionId, data: z.object({ elec: channelRows, dig: channelRows, press: channelRows }) });

export const FySaveSchema = z.object({
  baseVersionId,
  rows: z.array(z.object({ biz: name, b: name, med: z.string().trim().min(1).max(40), m: z.array(amount(MAX_MN)).length(12), py: amount(MAX_MN) })).max(5000),
  newBrands: z.array(z.object({ name, businessSlug: z.string().min(1).max(60) })).max(50),
});

const BillInputSchema = z.object({
  v: z.string().trim().min(1, { error: VENDOR_REQUIRED }).max(500),
  po: text(500), bill: text(500), b: text(500), billc: text(500), chq: text(500), loc: text(500), cm: text(2000),
  poa: amount(MAX_BDT).nullable(), ba: amount(MAX_BDT).nullable(), diff: amount(MAX_BDT).nullable(),
  st: day, en: day, sb: day, pr: day,
  biz: text(120), status: z.string().trim().min(1, { error: BAD_STATUS }).max(120),
});
export const BillChangeSchema = z.discriminatedUnion("op", [
  z.object({ baseVersionId, op: z.literal("add"), bill: BillInputSchema }),
  z.object({ baseVersionId, op: z.literal("edit"), sl: z.number().int().positive(), bill: BillInputSchema }),
  z.object({ baseVersionId, op: z.literal("delete"), sl: z.number().int().positive() }),
]);

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new ValidationError(r.error.issues.find((i) => KNOWN.has(i.message))?.message ?? INVALID_INPUT);
}

export type ManualSaved = { versionId: number; summary: string };

async function publishManual<T>(tx: StoreTx, v: ManualVersion<T>): Promise<ManualSaved> {
  const [versionId] = await publishVersionsTx(tx, [{ ...v, source: "manual" }]);
  return { versionId, summary: v.summary.summary };
}

/** The three Channel cost sheets as one new `channel` version, if nobody published it since `baseVersionId`. */
export async function saveChannel(store: Store, input: unknown, now: Date = new Date()): Promise<ManualSaved> {
  const { baseVersionId: base, data } = parse(ChannelSaveSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<ChannelData>(tx, "channel", base);
    return publishManual(tx, channelVersion(data, fyStartOf(active, now)));
  });
}

type Added = { name: string; businessSlug: string; businessName: string };

/** The brands added in this save, by normName, each under a visible business on the list. */
function addedBrands(catalog: Catalog, list: { name: string; businessSlug: string }[]): Map<string, Added> {
  const out = new Map<string, Added>();
  for (const nb of list) {
    const biz = catalog.businesses.find((b) => b.slug === nb.businessSlug && !b.hidden);
    if (!biz) throw new ValidationError(NO_BUSINESS);
    const clean = cleanName(nb.name);
    if (!out.has(normName(clean))) out.set(normName(clean), { name: clean, businessSlug: biz.slug, businessName: biz.name });
  }
  return out;
}

/** The FY rows as one new `fy` version, with any new brand added to the list in the same transaction. */
export async function saveFy(store: Store, input: unknown, now: Date = new Date()): Promise<ManualSaved> {
  const { baseVersionId: base, rows, newBrands } = parse(FySaveSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<FyRow[]>(tx, "fy", base);
    const catalog = await getCatalog(tx);
    const added = addedBrands(catalog, newBrands);
    // A new brand's rows sit under the business it was added to.
    const placed = rows.map((r) => {
      const a = added.get(normName(r.b));
      return a ? { ...r, biz: a.businessName } : r;
    });
    const version = fyVersion(placed, fyStartOf(active, now));
    const kept = new Set(version.data.map((r) => normName(r.b)));
    // Only brands that still have a row after the save rules, and are not on the list yet.
    const changes: CatalogChange[] = [...added.values()]
      .filter((a) => kept.has(normName(a.name)) && !catalog.brandOf(a.name))
      .map((a) => ({ op: "addBrand", name: a.name, businessSlug: a.businessSlug }));
    if (changes.length) await applyCatalogChanges(tx, changes);
    return publishManual(tx, version);
  });
}

/** A bill's Business: blank, a visible business on the list (its own spelling), or the bill's current value unchanged. */
function billBusiness(catalog: Catalog, raw: string, prev: BillboardRow | null): string {
  const typed = raw.trim();
  if (!typed) return "";
  if (prev && normName(prev.biz) === normName(typed)) return prev.biz;
  const b = catalog.businessOf(typed);
  if (!b || b.hidden) throw new ValidationError(NO_BUSINESS);
  return b.name;
}

/** One bill added, edited or deleted, published as the whole `billboard` dataset. */
export async function changeBillboard(store: Store, input: unknown): Promise<ManualSaved> {
  const change = parse(BillChangeSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<BillboardData>(tx, "billboard", change.baseVersionId);
    const catalog = await getCatalog(tx);
    const { data, summary } = applyBillChange(active?.data ?? null, change, (raw, prev) => billBusiness(catalog, raw, prev));
    return publishManual(tx, billboardVersion(data, summary));
  });
}
