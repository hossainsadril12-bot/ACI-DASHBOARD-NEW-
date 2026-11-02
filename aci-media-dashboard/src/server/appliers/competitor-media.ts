import { and, eq, inArray } from "drizzle-orm";
import { competitorMedia } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RowError } from "@/lib/upload/parse";
import { ValidationError } from "../errors";
import { checkMediaNumbers, parseMediaType, touchSource, type CompetitorMediaType } from "../competitors";
import { normName } from "../lookups";
import type { Applier, Missing } from "./types";
import { createMissingRefs, inScope, num, str } from "./shared";

export type CompetitorMediaItem = {
  key: string;
  brandId: number;
  month: string;
  rivalId: number | null;
  media: CompetitorMediaType;
  spend: number | null;
  spots: number | null;
  shareOfVoice: number | null;
};

const mediaKey = (r: { brandId: number; month: string; rivalId: number | null; media: string }) =>
  [r.brandId, r.month, r.rivalId ?? "own", r.media].join("|");

export const competitorMediaApplier: Applier<CompetitorMediaItem> = {
  kind: "competitor_media",

  resolve(rows, lk) {
    const items: CompetitorMediaItem[] = [];
    const errors: RowError[] = [];
    const missing: Missing = { vendors: [], tvStations: [] };
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const subject = str(v.subject);
      const mediaName = str(v.media);
      const brandId = brandName ? lk.brand(brandName) : undefined;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      const media = mediaName ? parseMediaType(mediaName) : null;
      if (mediaName && !media) errors.push({ row: r.rowNumber, column: "Media (TV, Press, Radio)", message: `"${mediaName}" is not TV, Press or Radio` });
      if (!brandId || !subject || !media || typeof v.month !== "string") continue;

      // The subject is the brand itself, or one of the rivals set up for it in Settings.
      const own = brandName !== null && normName(subject) === normName(brandName);
      const rivalId = own ? null : lk.rival(brandId, subject);
      if (rivalId === undefined) {
        errors.push({ row: r.rowNumber, column: "Brand or rival name", message: `"${subject}" is not a rival of ${brandName}. Add it in Settings first.` });
        continue;
      }

      let values;
      try {
        const spend = num(v.spend);
        const spots = num(v.spots);
        values = checkMediaNumbers({
          spend: spend === null ? null : Math.round(spend), spots: spots === null ? null : Math.round(spots), shareOfVoice: num(v.shareOfVoice),
        });
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        errors.push({ row: r.rowNumber, column: "Numbers", message: e.message });
        continue;
      }
      const base = { brandId, month: v.month, rivalId, media };
      const key = mediaKey(base);
      const first = seen.get(key);
      if (first) {
        errors.push({ row: r.rowNumber, column: "Brand or rival name", message: `Same brand, name, media and month as row ${first}` });
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
    const rows = await db.select().from(competitorMedia).where(inArray(competitorMedia.month, periods));
    return rows.map((r) => ({ key: mediaKey(r), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    await db.delete(competitorMedia).where(and(eq(competitorMedia.source, "upload"), inArray(competitorMedia.month, periods), inScope(competitorMedia.brandId, scope)));
    if (items.length) {
      await db.insert(competitorMedia).values(items.map((i) => ({
        brandId: i.brandId, month: i.month, rivalId: i.rivalId, media: i.media, spend: i.spend, spots: i.spots,
        shareOfVoice: i.shareOfVoice, source: "upload" as const, uploadId,
      })));
    }
    await touchSource(db, "competitor_media");
    return items.length;
  },
};
