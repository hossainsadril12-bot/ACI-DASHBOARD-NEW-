import { and, eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { atlCategory, brand, business, nameMatch } from "./schema";
import type { Store, StoreTx } from "./client";

export type CatalogBusiness = { slug: string; name: string; hidden: boolean; names: string[] };
export type CatalogBrand = { id: number; name: string; businessSlug: string; hidden: boolean; names: string[] };
export type CatalogAtl = { slug: string; name: string; businessSlug: string; ownBrand: string; hidden: boolean };
export type Catalog = {
  businesses: CatalogBusiness[];
  brands: CatalogBrand[];
  atl: CatalogAtl[];
  /** Finds a business by any of its names (hidden ones included). */
  businessOf(name: string): CatalogBusiness | null;
  /** Finds a brand by any of its names (hidden ones included). */
  brandOf(name: string): CatalogBrand | null;
  /** Finds an ATL category by its name (hidden ones included). */
  atlOf(title: string): CatalogAtl | null;
};

export type CatalogChange =
  | { op: "addBusiness"; name: string }
  | { op: "businessSameAs"; name: string; slug: string }
  | { op: "addBrand"; name: string; businessSlug: string; alsoMatches?: string[] }
  | { op: "addAtl"; name: string; businessSlug: string; ownBrand: string };

type MatchKind = "business" | "brand";

const MAX_NAME = 120;
const MAX_SLUG = 60;

/** The one name normaliser: trim, collapse whitespace, lower-case. */
export function normName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Trims and collapses whitespace, keeping the case. Refuses empty or over-long names. */
export function cleanName(s: string): string {
  const name = s.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME) throw new ValidationError("Names must be 1 to 120 characters.");
  return name;
}

function slugBase(name: string, fallback: string): string {
  const base = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}

/** A slug that is not taken yet: "food-beverage", then "food-beverage-2", "-3", ... Never longer than 60. */
async function makeSlug(name: string, fallback: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugBase(name, fallback);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const slug = base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, "") + suffix;
    if (!(await taken(slug))) return slug;
  }
}

const noBusiness = () => new ValidationError("That business doesn't exist.");
const noBrand = () => new ValidationError("That brand doesn't exist.");
const noAtl = () => new ValidationError("That ATL category doesn't exist.");

async function findMatch(db: StoreTx, kind: MatchKind, name: string) {
  const [row] = await db
    .select({ businessSlug: nameMatch.businessSlug, brandId: nameMatch.brandId })
    .from(nameMatch)
    .where(and(eq(nameMatch.kind, kind), eq(nameMatch.normName, normName(name))))
    .limit(1);
  return row ?? null;
}

async function getBusiness(db: StoreTx, slug: string) {
  const [row] = await db.select().from(business).where(eq(business.slug, slug)).limit(1);
  return row ?? null;
}

async function getBrand(db: StoreTx, id: number) {
  const [row] = await db.select().from(brand).where(eq(brand.id, id)).limit(1);
  return row ?? null;
}

async function duplicate(db: StoreTx, kind: MatchKind, name: string, match: { businessSlug: string | null; brandId: number | null }) {
  const existing = kind === "business" ? (await getBusiness(db, match.businessSlug ?? ""))?.name : (await getBrand(db, match.brandId ?? 0))?.name;
  return new ValidationError(`"${name}" is already used by ${kind} "${existing ?? name}".`);
}

async function insertBusiness(db: StoreTx, name: string): Promise<string> {
  const slug = await makeSlug(name, "business", async (s) => (await getBusiness(db, s)) !== null);
  await db.insert(business).values({ slug, name });
  await db.insert(nameMatch).values({ kind: "business", normName: normName(name), businessSlug: slug });
  return slug;
}

async function openBusiness(db: StoreTx, slug: string) {
  const b = await getBusiness(db, slug);
  if (!b) throw noBusiness();
  if (b.hidden) throw new ValidationError("That business is hidden. Show it first.");
  return b;
}

async function insertBrand(db: StoreTx, businessSlug: string, name: string): Promise<number> {
  const [row] = await db.insert(brand).values({ businessSlug, name }).returning({ id: brand.id });
  await db.insert(nameMatch).values({ kind: "brand", normName: normName(name), brandId: row.id });
  return row.id;
}

/** Applies upload decisions in order, inside the caller's transaction. A change whose name already matches is skipped. */
export async function applyCatalogChanges(tx: StoreTx, changes: CatalogChange[]): Promise<void> {
  for (const change of changes) {
    const name = cleanName(change.name);
    switch (change.op) {
      case "addBusiness": {
        if (!(await findMatch(tx, "business", name))) await insertBusiness(tx, name);
        break;
      }
      case "businessSameAs": {
        if (!(await getBusiness(tx, change.slug))) throw noBusiness();
        if (!(await findMatch(tx, "business", name))) {
          await tx.insert(nameMatch).values({ kind: "business", normName: normName(name), businessSlug: change.slug });
        }
        break;
      }
      case "addBrand": {
        await openBusiness(tx, change.businessSlug);
        const aliases = (change.alsoMatches ?? []).map(cleanName);
        if (await findMatch(tx, "brand", name)) break;
        const id = await insertBrand(tx, change.businessSlug, name);
        for (const alias of aliases) {
          if (!(await findMatch(tx, "brand", alias))) await tx.insert(nameMatch).values({ kind: "brand", normName: normName(alias), brandId: id });
        }
        break;
      }
      case "addAtl": {
        if (!(await getBusiness(tx, change.businessSlug))) throw noBusiness();
        const ownBrand = cleanName(change.ownBrand);
        const norm = normName(name);
        const [existing] = await tx.select({ slug: atlCategory.slug }).from(atlCategory).where(eq(atlCategory.normName, norm)).limit(1);
        if (existing) break;
        const slug = await makeSlug(name, "atl", async (s) => (await tx.select({ slug: atlCategory.slug }).from(atlCategory).where(eq(atlCategory.slug, s)).limit(1)).length > 0);
        await tx.insert(atlCategory).values({ slug, name, normName: norm, businessSlug: change.businessSlug, ownBrand });
        break;
      }
    }
  }
}

/** Loads every business, brand and ATL category, with lookups by name. */
export async function getCatalog(store: Store | StoreTx): Promise<Catalog> {
  const db = store as StoreTx;
  // One after another: a transaction runs on one connection.
  const bizRows = await db.select().from(business);
  const brandRows = await db.select().from(brand);
  const atlRows = await db.select().from(atlCategory);
  const matchRows = await db.select().from(nameMatch);
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  const otherNames = (own: string, names: string[]) => [normName(own), ...names.filter((n) => n !== normName(own)).sort()];

  const businesses: CatalogBusiness[] = bizRows
    .map((b) => ({
      slug: b.slug,
      name: b.name,
      hidden: b.hidden,
      names: otherNames(b.name, matchRows.filter((m) => m.kind === "business" && m.businessSlug === b.slug).map((m) => m.normName)),
    }))
    .sort(byName);
  const brands: CatalogBrand[] = brandRows
    .map((b) => ({
      id: b.id,
      name: b.name,
      businessSlug: b.businessSlug,
      hidden: b.hidden,
      names: otherNames(b.name, matchRows.filter((m) => m.kind === "brand" && m.brandId === b.id).map((m) => m.normName)),
    }))
    .sort(byName);
  const atl: CatalogAtl[] = atlRows
    .map((a) => ({ slug: a.slug, name: a.name, businessSlug: a.businessSlug, ownBrand: a.ownBrand, hidden: a.hidden }))
    .sort(byName);

  const bizBySlug = new Map(businesses.map((b) => [b.slug, b]));
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const bizByName = new Map<string, CatalogBusiness>();
  const brandByName = new Map<string, CatalogBrand>();
  for (const m of matchRows) {
    const target = m.kind === "business" ? bizBySlug.get(m.businessSlug ?? "") : brandById.get(m.brandId ?? 0);
    if (!target) continue;
    if (m.kind === "business") bizByName.set(m.normName, target as CatalogBusiness);
    else brandByName.set(m.normName, target as CatalogBrand);
  }
  const atlByName = new Map(atlRows.map((a) => [a.normName, atl.find((x) => x.slug === a.slug)!]));

  return {
    businesses,
    brands,
    atl,
    businessOf: (name) => bizByName.get(normName(name)) ?? null,
    brandOf: (name) => brandByName.get(normName(name)) ?? null,
    atlOf: (title) => atlByName.get(normName(title)) ?? null,
  };
}

export async function createBusiness(store: Store, name: string): Promise<{ slug: string }> {
  const clean = cleanName(name);
  return store.transaction(async (tx) => {
    const match = await findMatch(tx, "business", clean);
    if (match) throw await duplicate(tx, "business", clean, match);
    return { slug: await insertBusiness(tx, clean) };
  });
}

/** Changes the shown name. The old name keeps matching; the slug never changes. */
export async function renameBusiness(store: Store, slug: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await store.transaction(async (tx) => {
    if (!(await getBusiness(tx, slug))) throw noBusiness();
    const match = await findMatch(tx, "business", clean);
    if (match && match.businessSlug !== slug) throw await duplicate(tx, "business", clean, match);
    await tx.update(business).set({ name: clean }).where(eq(business.slug, slug));
    if (!match) await tx.insert(nameMatch).values({ kind: "business", normName: normName(clean), businessSlug: slug });
  });
}

export async function setBusinessHidden(store: Store, slug: string, hidden: boolean): Promise<void> {
  const rows = await store.update(business).set({ hidden }).where(eq(business.slug, slug)).returning({ slug: business.slug });
  if (rows.length === 0) throw noBusiness();
}

export async function createBrand(store: Store, businessSlug: string, name: string): Promise<{ id: number }> {
  const clean = cleanName(name);
  return store.transaction(async (tx) => {
    await openBusiness(tx, businessSlug);
    const match = await findMatch(tx, "brand", clean);
    if (match) throw await duplicate(tx, "brand", clean, match);
    return { id: await insertBrand(tx, businessSlug, clean) };
  });
}

/** Changes the shown name. The old name keeps matching. */
export async function renameBrand(store: Store, id: number, name: string): Promise<void> {
  const clean = cleanName(name);
  await store.transaction(async (tx) => {
    if (!(await getBrand(tx, id))) throw noBrand();
    const match = await findMatch(tx, "brand", clean);
    if (match && match.brandId !== id) throw await duplicate(tx, "brand", clean, match);
    await tx.update(brand).set({ name: clean }).where(eq(brand.id, id));
    if (!match) await tx.insert(nameMatch).values({ kind: "brand", normName: normName(clean), brandId: id });
  });
}

export async function setBrandHidden(store: Store, id: number, hidden: boolean): Promise<void> {
  const rows = await store.update(brand).set({ hidden }).where(eq(brand.id, id)).returning({ id: brand.id });
  if (rows.length === 0) throw noBrand();
}

/** Moves an ATL category to another business and sets which brand is "ours" in it. */
export async function setAtlCategory(store: Store, slug: string, input: { businessSlug: string; ownBrand: string }): Promise<void> {
  const ownBrand = cleanName(input.ownBrand);
  await store.transaction(async (tx) => {
    const [atl] = await tx.select({ slug: atlCategory.slug }).from(atlCategory).where(eq(atlCategory.slug, slug)).limit(1);
    if (!atl) throw noAtl();
    if (!(await getBusiness(tx, input.businessSlug))) throw noBusiness();
    await tx.update(atlCategory).set({ businessSlug: input.businessSlug, ownBrand }).where(eq(atlCategory.slug, slug));
  });
}

export async function setAtlHidden(store: Store, slug: string, hidden: boolean): Promise<void> {
  const rows = await store.update(atlCategory).set({ hidden }).where(eq(atlCategory.slug, slug)).returning({ slug: atlCategory.slug });
  if (rows.length === 0) throw noAtl();
}
