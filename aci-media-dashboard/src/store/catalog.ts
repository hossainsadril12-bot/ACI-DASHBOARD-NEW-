import { and, eq } from "drizzle-orm";
import { normName } from "@/lib/names-normal";
import { ValidationError } from "@/server/errors";
import { atlCategory, brand, business, nameMatch } from "./schema";
import type { Store, StoreTx } from "./client";

export type CatalogBusiness = { slug: string; name: string; hidden: boolean; names: string[] };
export type CatalogBrand = { id: number; name: string; businessSlug: string; hidden: boolean; names: string[] };
export type CatalogAtl = { slug: string; name: string; businessSlug: string; ownBrands: string[]; hidden: boolean };
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
  | { op: "addAtl"; name: string; businessSlug: string; ownBrands: string[] };

type MatchKind = "business" | "brand";

const MAX_NAME = 120;
const MAX_SLUG = 60;
const MAX_OWN_BRANDS = 50;

export { normName };

/** Trims and collapses whitespace, keeping the case. Refuses empty or over-long names. */
export function cleanName(s: string): string {
  const name = s.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME) throw new ValidationError("Names must be 1 to 120 characters.");
  return name;
}

/** An ATL category's "our brands": 1 to 50 names, each cleaned, duplicates (by normName) dropped, order kept. */
function cleanOwnBrands(list: string[]): string[] {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_OWN_BRANDS) throw new ValidationError("Pick at least one of our brands.");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = cleanName(raw);
    const norm = normName(name);
    if (!seen.has(norm)) { seen.add(norm); out.push(name); }
  }
  return out;
}

/**
 * The one slug rule. ASCII only: lower-case, anything outside a-z and 0-9 becomes "-", runs collapsed,
 * "-" trimmed, max 60; empty becomes the fallback. If taken: "-2", "-3", ... still within 60.
 * Synchronous so a caller can predict the slug the store will give a new name.
 */
export function makeSlug(name: string, taken: (slug: string) => boolean, fallback: "business" | "atl"): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = ascii.slice(0, MAX_SLUG).replace(/-+$/, "") || fallback;
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const slug = base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, "") + suffix;
    if (!taken(slug)) return slug;
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

/** A rename back to a name it already matches: keep the new spelling. Only called for the caller's own match row. */
async function setMatchSpelling(db: StoreTx, kind: MatchKind, name: string) {
  await db.update(nameMatch).set({ name }).where(and(eq(nameMatch.kind, kind), eq(nameMatch.normName, normName(name))));
}

/** Saves a match name with its spelling. `name` must already be cleaned. */
async function insertMatch(db: StoreTx, kind: MatchKind, name: string, target: { businessSlug: string } | { brandId: number }) {
  await db.insert(nameMatch).values({ kind, normName: normName(name), name, ...target });
}

async function insertBusiness(db: StoreTx, name: string): Promise<string> {
  const taken = new Set((await db.select({ slug: business.slug }).from(business)).map((r) => r.slug));
  const slug = makeSlug(name, (s) => taken.has(s), "business");
  await db.insert(business).values({ slug, name });
  await insertMatch(db, "business", name, { businessSlug: slug });
  return slug;
}

async function insertAtl(db: StoreTx, name: string, businessSlug: string, ownBrands: string[]): Promise<string> {
  const taken = new Set((await db.select({ slug: atlCategory.slug }).from(atlCategory)).map((r) => r.slug));
  const slug = makeSlug(name, (s) => taken.has(s), "atl");
  await db.insert(atlCategory).values({ slug, name, normName: normName(name), businessSlug, ownBrands });
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
  await insertMatch(db, "brand", name, { brandId: row.id });
  return row.id;
}

/** The slugs this call created, keyed by the normalised name that was added. */
export type CatalogChangeResult = { businessSlugs: Record<string, string>; atlSlugs: Record<string, string> };

/**
 * Applies upload decisions in order, inside the caller's transaction. A change whose name already matches
 * adds nothing new, except that addBrand still attaches its aliases to the brand it matched.
 * An alias that already matches a brand is skipped (first one wins). Every other problem throws.
 */
export async function applyCatalogChanges(tx: StoreTx, changes: CatalogChange[]): Promise<CatalogChangeResult> {
  const result: CatalogChangeResult = { businessSlugs: {}, atlSlugs: {} };
  for (const change of changes) {
    const name = cleanName(change.name);
    switch (change.op) {
      case "addBusiness": {
        if (!(await findMatch(tx, "business", name))) result.businessSlugs[normName(name)] = await insertBusiness(tx, name);
        break;
      }
      case "businessSameAs": {
        await openBusiness(tx, change.slug);
        if (!(await findMatch(tx, "business", name))) await insertMatch(tx, "business", name, { businessSlug: change.slug });
        break;
      }
      case "addBrand": {
        await openBusiness(tx, change.businessSlug);
        const aliases = (change.alsoMatches ?? []).map(cleanName);
        const match = await findMatch(tx, "brand", name);
        const id = match?.brandId ?? (await insertBrand(tx, change.businessSlug, name));
        for (const alias of aliases) {
          if (!(await findMatch(tx, "brand", alias))) await insertMatch(tx, "brand", alias, { brandId: id });
        }
        break;
      }
      case "addAtl": {
        await openBusiness(tx, change.businessSlug);
        const ownBrands = cleanOwnBrands(change.ownBrands);
        const norm = normName(name);
        const [existing] = await tx.select({ slug: atlCategory.slug }).from(atlCategory).where(eq(atlCategory.normName, norm)).limit(1);
        if (!existing) result.atlSlugs[norm] = await insertAtl(tx, name, change.businessSlug, ownBrands);
        break;
      }
    }
  }
  return result;
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

  // Group the match rows once: business slug -> rows, brand id -> rows.
  type MatchRow = (typeof matchRows)[number];
  const bizMatches = new Map<string, MatchRow[]>();
  const brandMatches = new Map<number, MatchRow[]>();
  const push = <K>(map: Map<K, MatchRow[]>, key: K, m: MatchRow) => {
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  };
  for (const m of matchRows) {
    if (m.kind === "business" && m.businessSlug !== null) push(bizMatches, m.businessSlug, m);
    else if (m.kind === "brand" && m.brandId !== null) push(brandMatches, m.brandId, m);
  }
  /** The shown name first, then the other stored spellings in alphabetical order. */
  const namesOf = (own: string, rows: MatchRow[]) => {
    const ownNorm = normName(own);
    const others = rows.filter((m) => m.normName !== ownNorm).map((m) => m.name);
    return [own, ...others.sort((a, b) => a.localeCompare(b))];
  };

  const bizByName = new Map<string, CatalogBusiness>();
  const businesses: CatalogBusiness[] = bizRows
    .map((b) => {
      const rows = bizMatches.get(b.slug) ?? [];
      const item: CatalogBusiness = { slug: b.slug, name: b.name, hidden: b.hidden, names: namesOf(b.name, rows) };
      for (const m of rows) bizByName.set(m.normName, item);
      return item;
    })
    .sort(byName);
  const brandByName = new Map<string, CatalogBrand>();
  const brands: CatalogBrand[] = brandRows
    .map((b) => {
      const rows = brandMatches.get(b.id) ?? [];
      const item: CatalogBrand = { id: b.id, name: b.name, businessSlug: b.businessSlug, hidden: b.hidden, names: namesOf(b.name, rows) };
      for (const m of rows) brandByName.set(m.normName, item);
      return item;
    })
    .sort(byName);
  const atlByName = new Map<string, CatalogAtl>();
  const atl: CatalogAtl[] = atlRows
    .map((a) => {
      const item: CatalogAtl = { slug: a.slug, name: a.name, businessSlug: a.businessSlug, ownBrands: a.ownBrands, hidden: a.hidden };
      atlByName.set(a.normName, item);
      return item;
    })
    .sort(byName);

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
    if (match) await setMatchSpelling(tx, "business", clean);
    else await insertMatch(tx, "business", clean, { businessSlug: slug });
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
    if (match) await setMatchSpelling(tx, "brand", clean);
    else await insertMatch(tx, "brand", clean, { brandId: id });
  });
}

export async function setBrandHidden(store: Store, id: number, hidden: boolean): Promise<void> {
  const rows = await store.update(brand).set({ hidden }).where(eq(brand.id, id)).returning({ id: brand.id });
  if (rows.length === 0) throw noBrand();
}

/** Moves an ATL category to another business and sets which brands are "ours" in it. */
export async function setAtlCategory(store: Store, slug: string, input: { businessSlug: string; ownBrands: string[] }): Promise<void> {
  const ownBrands = cleanOwnBrands(input.ownBrands);
  await store.transaction(async (tx) => {
    const [atl] = await tx.select({ slug: atlCategory.slug }).from(atlCategory).where(eq(atlCategory.slug, slug)).limit(1);
    if (!atl) throw noAtl();
    await openBusiness(tx, input.businessSlug);
    await tx.update(atlCategory).set({ businessSlug: input.businessSlug, ownBrands }).where(eq(atlCategory.slug, slug));
  });
}

export async function setAtlHidden(store: Store, slug: string, hidden: boolean): Promise<void> {
  const rows = await store.update(atlCategory).set({ hidden }).where(eq(atlCategory.slug, slug)).returning({ slug: atlCategory.slug });
  if (rows.length === 0) throw noAtl();
}
