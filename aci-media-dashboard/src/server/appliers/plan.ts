import { and, eq, inArray, sql } from "drizzle-orm";
import { campaignLines, campaigns } from "@/db/schema";
import type { Db } from "@/db/types";
import type { RowError } from "@/lib/upload/parse";
import { normName } from "../lookups";
import { createMissingRefs, inScope, num, str } from "./shared";
import type { Applier } from "./types";

type Status = "planned" | "live" | "done";

export type PlanItem = {
  key: string;
  brandId: number;
  name: string;
  startDate: string;
  endDate: string;
  status: Status;
  notes: string | null;
  lines: { channelId: number; plannedAmount: number }[];
};

const STATUSES: Status[] = ["planned", "live", "done"];
const startMonth = sql<string>`to_char(${campaigns.startDate}, 'YYYY-MM')`;
export const planKey = (brandId: number, name: string, startDate: string) => `${brandId}|${normName(name)}|${startDate}`;

export const planApplier: Applier<PlanItem> = {
  kind: "plan",

  resolve(rows, lk) {
    const errors: RowError[] = [];
    const byKey = new Map<string, PlanItem>();
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const channelName = str(v.channel);
      const name = str(v.campaign);
      const brandId = brandName ? lk.brand(brandName) : undefined;
      const channelId = channelName ? lk.channel(channelName) : undefined;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      if (channelName && !channelId) errors.push({ row: r.rowNumber, column: "Channel", message: `Unknown channel "${channelName}"` });
      const status = (str(v.status)?.toLowerCase() ?? "planned") as Status;
      if (!STATUSES.includes(status)) errors.push({ row: r.rowNumber, column: "Status", message: "Use Planned, Live or Done" });
      const start = str(v.startDate);
      const end = str(v.endDate);
      if (start && end && end < start) errors.push({ row: r.rowNumber, column: "End date", message: "End date is before start date" });
      const amount = num(v.plannedAmount);
      if (amount !== null && amount < 0) errors.push({ row: r.rowNumber, column: "Planned amount (BDT, with VAT)", message: "Must be 0 or more" });

      if (!brandId || !channelId || !name || !start || !end || end < start || amount === null || amount < 0 || !STATUSES.includes(status)) continue;
      const key = planKey(brandId, name, start);
      const item = byKey.get(key) ?? { key, brandId, name, startDate: start, endDate: end, status, notes: str(v.notes), lines: [] };
      const line = item.lines.find((l) => l.channelId === channelId);
      if (line) line.plannedAmount += Math.round(amount);
      else item.lines.push({ channelId, plannedAmount: Math.round(amount) });
      byKey.set(key, item);
    }
    return { items: [...byKey.values()], errors, missing: { vendors: [], tvStations: [] } };
  },

  createMissing: createMissingRefs,

  async existingKeys(db, periods) {
    if (!periods.length) return [];
    const rows = await db
      .select({ brandId: campaigns.brandId, name: campaigns.name, startDate: campaigns.startDate, source: campaigns.source })
      .from(campaigns)
      .where(inArray(startMonth, periods));
    return rows.map((r) => ({ key: planKey(r.brandId, r.name, r.startDate), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    await db.delete(campaigns).where(and(eq(campaigns.source, "upload"), inArray(startMonth, periods), inScope(campaigns.brandId, scope)));
    for (const it of items) {
      const [row] = await db
        .insert(campaigns)
        .values({ brandId: it.brandId, name: it.name, startDate: it.startDate, endDate: it.endDate, status: it.status, notes: it.notes, source: "upload", uploadId })
        .returning({ id: campaigns.id });
      await db.insert(campaignLines).values(it.lines.map((l) => ({ campaignId: row.id, ...l })));
    }
    return items.length;
  },
};
