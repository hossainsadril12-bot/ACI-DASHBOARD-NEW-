import { inArray, isNull, notInArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { tvStations, vendors } from "@/db/schema";
import type { Db } from "@/db/types";
import type { BrandScope, Missing } from "./types";

export async function createMissingRefs(db: Db, missing: Missing) {
  if (missing.vendors.length) {
    await db.insert(vendors).values(missing.vendors.map((name) => ({ name, kind: "agency" as const }))).onConflictDoNothing();
  }
  if (missing.tvStations.length) {
    await db.insert(tvStations).values(missing.tvStations.map((name) => ({ name }))).onConflictDoNothing();
  }
}

export const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export const num = (v: unknown) => (typeof v === "number" ? v : null);

/** SQL condition limiting a delete to the upload's brand scope (undefined = no limit). */
export function inScope(brandCol: AnyColumn, scope: BrandScope, nullable = false): SQL | undefined {
  if (scope.only) return scope.ids.length ? inArray(brandCol, scope.ids) : sql`false`;
  if (!scope.ids.length) return undefined;
  return nullable ? or(isNull(brandCol), notInArray(brandCol, scope.ids)) : notInArray(brandCol, scope.ids);
}
