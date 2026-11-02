import { and, eq } from "drizzle-orm";
import { brands } from "@/db/schema";
import type { Db } from "@/db/types";
import { BILL_STATUSES, type BillStatus } from "@/lib/bill-status";
import { isMonth } from "@/lib/month";
import type { AgeFilter, BillFilter } from "./billing";
import { CHANNEL_GROUPS, type ChannelGroup } from "./spend";

/** Page search params or a route's URLSearchParams turned into a plain record. */
export type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const AGES: AgeFilter[] = ["fresh", "yellow", "red", "paid"];

export function parseMonth(sp: Params, today: string): string {
  const m = one(sp.month);
  return m && isMonth(m) ? m : today.slice(0, 7);
}

export function parseBrandId(sp: Params): number | undefined {
  const b = one(sp.brand);
  return b && /^\d+$/.test(b) ? Number(b) : undefined;
}

export function parseSpendQuery(sp: Params, today: string) {
  const g = one(sp.group);
  return { month: parseMonth(sp, today), brandId: parseBrandId(sp), group: g && g in CHANNEL_GROUPS ? (g as ChannelGroup) : undefined };
}

export function parseBillFilter(sp: Params): BillFilter {
  const status = one(sp.status);
  const age = one(sp.age);
  return {
    search: one(sp.q)?.trim() || undefined,
    status: status && BILL_STATUSES.includes(status as BillStatus) ? (status as BillStatus) : undefined,
    brandId: parseBrandId(sp),
    age: age && AGES.includes(age as AgeFilter) ? (age as AgeFilter) : undefined,
  };
}

/** The brand filter only applies to an active brand; anything else (deleted, inactive, stale) means "All brands". */
export async function activeBrandId(db: Db, id: number | undefined): Promise<number | undefined> {
  if (!id) return undefined;
  const [b] = await db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, id), eq(brands.active, true)));
  return b?.id;
}
