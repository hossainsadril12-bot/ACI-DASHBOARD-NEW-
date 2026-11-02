import { and, eq, inArray } from "drizzle-orm";
import { spendEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RowError } from "@/lib/upload/parse";
import { addMissing, type Applier, type Missing } from "./types";
import { createMissingRefs, inScope, num, str } from "./shared";

export type SpendItem = {
  key: string;
  brandId: number;
  month: string;
  entryDate: string | null;
  channelId: number;
  tvStationId: number | null;
  vendorId: number | null;
  amount: number;
  note: string | null;
};

export const spendKey = (r: Omit<SpendItem, "key" | "amount" | "note">) =>
  [r.brandId, r.month, r.channelId, r.tvStationId ?? "", r.vendorId ?? "", r.entryDate ?? ""].join("|");

export const spendApplier: Applier<SpendItem> = {
  kind: "spend",

  resolve(rows, lk) {
    const items: SpendItem[] = [];
    const errors: RowError[] = [];
    const missing: Missing = { vendors: [], tvStations: [] };
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const channelName = str(v.channel);
      const brandId = brandName ? lk.brand(brandName) : undefined;
      const channelId = channelName ? lk.channel(channelName) : undefined;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      if (channelName && !channelId) errors.push({ row: r.rowNumber, column: "Channel", message: `Unknown channel "${channelName}"` });
      const amount = num(v.amount);
      if (amount !== null && amount < 0) errors.push({ row: r.rowNumber, column: "Amount (BDT, with VAT)", message: "Must be 0 or more" });

      const stationName = str(v.tvStation);
      const vendorName = str(v.vendor);
      const tvStationId = stationName ? lk.tvStation(stationName) ?? null : null;
      const vendorId = vendorName ? lk.vendor(vendorName) ?? null : null;
      if (stationName && tvStationId === null) addMissing(missing.tvStations, stationName);
      if (vendorName && vendorId === null) addMissing(missing.vendors, vendorName);

      if (!brandId || !channelId || amount === null || amount < 0 || typeof v.month !== "string") continue;
      const base = { brandId, month: v.month, entryDate: str(v.entryDate), channelId, tvStationId, vendorId };
      items.push({ ...base, key: spendKey(base), amount: Math.round(amount), note: str(v.note) });
    }
    return { items, errors, missing };
  },

  createMissing: createMissingRefs,

  async existingKeys(db, periods) {
    if (!periods.length) return [];
    const rows = await db.select().from(spendEntries).where(inArray(spendEntries.month, periods));
    return rows.map((r) => ({ key: spendKey(r), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    await db.delete(spendEntries).where(and(eq(spendEntries.source, "upload"), inArray(spendEntries.month, periods), inScope(spendEntries.brandId, scope)));
    if (!items.length) return 0;
    await db.insert(spendEntries).values(
      items.map((i) => ({
        brandId: i.brandId, month: i.month, entryDate: i.entryDate, channelId: i.channelId, tvStationId: i.tvStationId,
        vendorId: i.vendorId, amount: i.amount, note: i.note, source: "upload" as const, uploadId,
      })),
    );
    return items.length;
  },
};
