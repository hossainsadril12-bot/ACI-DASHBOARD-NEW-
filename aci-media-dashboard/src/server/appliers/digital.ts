import { and, eq, inArray } from "drizzle-orm";
import { digitalEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RowError } from "@/lib/upload/parse";
import { ValidationError } from "../errors";
import { checkDigitalNumbers, DIGITAL_COUNTS, DIGITAL_RATES, type DigitalValues } from "../digital";
import type { Applier, Missing } from "./types";
import { createMissingRefs, inScope, num, str } from "./shared";

export type DigitalItem = DigitalValues & { key: string; brandId: number; month: string; platformId: number };

const PLATFORMS = ["META", "YOUTUBE", "TIKTOK"];
const digitalKey = (r: { brandId: number; month: string; platformId: number }) => [r.brandId, r.month, r.platformId].join("|");

export const digitalApplier: Applier<DigitalItem> = {
  kind: "digital",

  resolve(rows, lk) {
    const items: DigitalItem[] = [];
    const errors: RowError[] = [];
    const missing: Missing = { vendors: [], tvStations: [] };
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const platformName = str(v.platform);
      const brandId = brandName ? lk.brand(brandName) : undefined;
      const channelId = platformName ? lk.channel(platformName) : undefined;
      const platformId = channelId && PLATFORMS.includes(lk.channelCode(channelId) ?? "") ? channelId : undefined;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      if (platformName && !platformId) errors.push({ row: r.rowNumber, column: "Platform", message: `"${platformName}" is not Meta, YouTube or TikTok` });
      if (!brandId || !platformId || typeof v.month !== "string") continue;

      let values: DigitalValues;
      try {
        const raw = Object.fromEntries([...DIGITAL_COUNTS, ...DIGITAL_RATES].map((k) => [k, num(v[k])]));
        for (const k of DIGITAL_COUNTS) if (raw[k] !== null) raw[k] = Math.round(raw[k] as number);
        values = checkDigitalNumbers(raw);
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        errors.push({ row: r.rowNumber, column: "Numbers", message: e.message });
        continue;
      }
      const base = { brandId, month: v.month, platformId };
      const key = digitalKey(base);
      const first = seen.get(key);
      if (first) {
        errors.push({ row: r.rowNumber, column: "Platform", message: `Same brand, month and platform as row ${first}` });
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
    const rows = await db.select().from(digitalEntries).where(inArray(digitalEntries.month, periods));
    return rows.map((r) => ({ key: digitalKey(r), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    await db.delete(digitalEntries).where(and(eq(digitalEntries.source, "upload"), inArray(digitalEntries.month, periods), inScope(digitalEntries.brandId, scope)));
    if (!items.length) return 0;
    await db.insert(digitalEntries).values(items.map((i) => ({
      brandId: i.brandId, month: i.month, platformId: i.platformId, spend: i.spend, reach: i.reach, impressions: i.impressions,
      cpm: i.cpm, thruplays: i.thruplays, costPerView: i.costPerView, engagement: i.engagement, source: "upload" as const, uploadId,
    })));
    return items.length;
  },
};
