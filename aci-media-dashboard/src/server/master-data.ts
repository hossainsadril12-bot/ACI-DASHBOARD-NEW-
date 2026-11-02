import { asc, eq, count } from "drizzle-orm";
import { brands, businesses, rivals, vendors, tvStations, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/rules";
import { ValidationError, isUniqueViolation } from "./errors";
import { isSampleName, SAMPLE_TAG } from "@/lib/sample";

const MAX_RIVALS = 3;

function cleanName(name: string, label: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new ValidationError(`${label} name is required`);
  if (label !== "Rival" && isSampleName(n)) throw new ValidationError(`Names ending with "${SAMPLE_TAG}" are kept for sample data. Choose another name.`);
  return n;
}

async function insertUnique<T>(label: string, name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError(`${label} "${name}" already exists`);
    throw e;
  }
}

export async function listBusinesses(db: Db) {
  return db.select().from(businesses).orderBy(asc(businesses.name));
}

export async function listBrandsWithRivals(db: Db) {
  const rows = await db
    .select({ id: brands.id, name: brands.name, businessId: brands.businessId, businessName: businesses.name, active: brands.active })
    .from(brands)
    .innerJoin(businesses, eq(brands.businessId, businesses.id))
    .orderBy(asc(businesses.name), asc(brands.name));
  const allRivals = await db.select().from(rivals).orderBy(asc(rivals.sort), asc(rivals.id));
  return rows.map((b) => ({
    ...b,
    rivals: allRivals.filter((r) => r.brandId === b.id).map((r) => ({ id: r.id, name: r.name })),
  }));
}

export async function createBrand(db: Db, input: { name: string; businessId: number }) {
  const name = cleanName(input.name, "Brand");
  const [row] = await insertUnique("Brand", name, () =>
    db.insert(brands).values({ name, businessId: input.businessId }).returning(),
  );
  await logChange(db, { entity: "brand", entityId: row.id, action: "create", after: row });
  return row;
}

export async function renameBrand(db: Db, id: number, newName: string) {
  const name = cleanName(newName, "Brand");
  const [before] = await db.select().from(brands).where(eq(brands.id, id));
  if (!before) throw new ValidationError("Brand not found");
  const [row] = await insertUnique("Brand", name, () =>
    db.update(brands).set({ name }).where(eq(brands.id, id)).returning(),
  );
  await logChange(db, { entity: "brand", entityId: id, action: "update", before, after: row });
  return row;
}

export async function setBrandActive(db: Db, id: number, active: boolean) {
  const [before] = await db.select().from(brands).where(eq(brands.id, id));
  if (!before) throw new ValidationError("Brand not found");
  const [row] = await db.update(brands).set({ active }).where(eq(brands.id, id)).returning();
  await logChange(db, { entity: "brand", entityId: id, action: "update", before, after: row });
  return row;
}

export async function addRival(db: Db, input: { brandId: number; name: string }) {
  const name = cleanName(input.name, "Rival");
  const [{ n }] = await db.select({ n: count() }).from(rivals).where(eq(rivals.brandId, input.brandId));
  if (n >= MAX_RIVALS) throw new ValidationError(`A brand can have at most ${MAX_RIVALS} rivals`);
  const [row] = await insertUnique("Rival", name, () =>
    db.insert(rivals).values({ brandId: input.brandId, name, sort: n }).returning(),
  );
  await logChange(db, { entity: "rival", entityId: row.id, action: "create", after: row });
  return row;
}

export async function removeRival(db: Db, id: number) {
  const [before] = await db.delete(rivals).where(eq(rivals.id, id)).returning();
  if (!before) throw new ValidationError("Rival not found");
  await logChange(db, { entity: "rival", entityId: id, action: "delete", before });
}

export async function listVendors(db: Db) {
  return db.select().from(vendors).orderBy(asc(vendors.name));
}

export async function createVendor(db: Db, input: { name: string; kind: "agency" | "media" | "other" }) {
  const name = cleanName(input.name, "Vendor");
  const [row] = await insertUnique("Vendor", name, () => db.insert(vendors).values({ name, kind: input.kind }).returning());
  await logChange(db, { entity: "vendor", entityId: row.id, action: "create", after: row });
  return row;
}

export async function listTvStations(db: Db) {
  return db.select().from(tvStations).orderBy(asc(tvStations.name));
}

export async function createTvStation(db: Db, rawName: string) {
  const name = cleanName(rawName, "TV station");
  const [row] = await insertUnique("TV station", name, () => db.insert(tvStations).values({ name }).returning());
  await logChange(db, { entity: "tv_station", entityId: row.id, action: "create", after: row });
  return row;
}

export async function getThresholds(db: Db): Promise<Thresholds> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "thresholds"));
  return { ...DEFAULT_THRESHOLDS, ...((row?.value as Partial<Thresholds>) ?? {}) };
}

export async function setThresholds(db: Db, t: Thresholds) {
  const ints = [t.billYellowDays, t.billRedDays, t.budgetOrangePct, t.budgetRedPct];
  if (ints.some((v) => !Number.isInteger(v) || v <= 0)) throw new ValidationError("Thresholds must be whole numbers above 0");
  if (t.billYellowDays >= t.billRedDays) throw new ValidationError("Bill yellow days must be less than red days");
  if (t.budgetOrangePct >= t.budgetRedPct) throw new ValidationError("Budget orange % must be less than red %");
  if (t.budgetRedPct > 100) throw new ValidationError("Budget red % cannot be above 100");
  const before = await getThresholds(db);
  await db.insert(settings).values({ key: "thresholds", value: t }).onConflictDoUpdate({ target: settings.key, set: { value: t } });
  await logChange(db, { entity: "settings", entityId: "thresholds", action: "update", before, after: t });
}
