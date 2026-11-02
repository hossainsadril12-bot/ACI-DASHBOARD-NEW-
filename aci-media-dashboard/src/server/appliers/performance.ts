import { and, eq, inArray } from "drizzle-orm";
import { performanceEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RowError } from "@/lib/upload/parse";
import { ValidationError } from "../errors";
import { checkPerformanceRow, TV_FIELDS, type PerformanceValues } from "../performance";
import type { Applier, Missing } from "./types";
import { createMissingRefs, inScope, num, str } from "./shared";

export type PerformanceItem = PerformanceValues & { key: string; brandId: number; month: string; channelId: number };

const performanceKey = (r: { brandId: number; month: string; channelId: number }) => [r.brandId, r.month, r.channelId].join("|");

export const performanceApplier: Applier<PerformanceItem> = {
  kind: "performance",

  resolve(rows, lk) {
    const items: PerformanceItem[] = [];
    const errors: RowError[] = [];
    const missing: Missing = { vendors: [], tvStations: [] };
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const channelName = str(v.channel);
      const brandId = brandName ? lk.brand(brandName) : undefined;
      const channelId = channelName ? lk.channel(channelName) : undefined;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      if (channelName && !channelId) errors.push({ row: r.rowNumber, column: "Channel", message: `Unknown channel "${channelName}"` });
      if (!brandId || !channelId || typeof v.month !== "string") continue;

      let values: PerformanceValues | null;
      try {
        const spend = num(v.spend);
        values = checkPerformanceRow({
          spend: spend === null ? null : Math.round(spend), peopleReached: num(v.peopleReached),
          ...Object.fromEntries(TV_FIELDS.map((k) => [k, num(v[k])])),
        }, lk.channelCode(channelId) ?? "");
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        errors.push({ row: r.rowNumber, column: "Numbers", message: e.message });
        continue;
      }
      if (!values) continue;
      const base = { brandId, month: v.month, channelId };
      const key = performanceKey(base);
      const first = seen.get(key);
      if (first) {
        errors.push({ row: r.rowNumber, column: "Channel", message: `Same brand, month and channel as row ${first}` });
        continue;
      }
      seen.set(key, r.rowNumber);
      items.push({ ...base, ...values, key });
    }
    return { items, errors, missing };
  },

  createMissing: createMissingRefs,

  async existingKeys(db, periods) {
    if (!periods.length) return [];
    const rows = await db.select().from(performanceEntries).where(inArray(performanceEntries.month, periods));
    return rows.map((r) => ({ key: performanceKey(r), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    await db.delete(performanceEntries).where(and(eq(performanceEntries.source, "upload"), inArray(performanceEntries.month, periods), inScope(performanceEntries.brandId, scope)));
    if (!items.length) return 0;
    await db.insert(performanceEntries).values(items.map((i) => ({
      brandId: i.brandId, month: i.month, channelId: i.channelId, spend: i.spend, peopleReached: i.peopleReached, grp: i.grp,
      shareOfVoice: i.shareOfVoice, shareOfSpend: i.shareOfSpend, reach1Plus: i.reach1Plus, cprp: i.cprp, source: "upload" as const, uploadId,
    })));
    return items.length;
  },
};
