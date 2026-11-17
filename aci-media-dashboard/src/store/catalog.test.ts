import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/server/errors";
import { createTestStore } from "./test-store";
import {
  applyCatalogChanges,
  cleanName,
  createBrand,
  createBusiness,
  getCatalog,
  normName,
  renameBrand,
  renameBusiness,
  setAtlCategory,
  setAtlHidden,
  setBrandHidden,
  setBusinessHidden,
} from "./catalog";

describe("normName and cleanName", () => {
  it("trims, collapses spaces and lower-cases", () => {
    expect(normName("  Savlon \t  Hand\nWash ")).toBe("savlon hand wash");
  });

  it("cleanName keeps the case and refuses empty or long names", () => {
    expect(cleanName("  Savlon   Soap ")).toBe("Savlon Soap");
    expect(cleanName("a".repeat(120))).toHaveLength(120);
    expect(() => cleanName("   ")).toThrow("Names must be 1 to 120 characters.");
    expect(() => cleanName("a".repeat(121))).toThrow(ValidationError);
  });
});

describe("catalog", () => {
  it("starts empty", async () => {
    const c = await getCatalog(await createTestStore());
    expect(c.businesses).toEqual([]);
    expect(c.brands).toEqual([]);
    expect(c.atl).toEqual([]);
    expect(c.businessOf("Hygiene")).toBeNull();
    expect(c.brandOf("Savlon")).toBeNull();
    expect(c.atlOf("Savlon Soap")).toBeNull();
  });

  it("creates a business and finds it by any case; refuses a duplicate", async () => {
    const store = await createTestStore();
    expect(await createBusiness(store, " Hygiene ")).toEqual({ slug: "hygiene" });
    const c = await getCatalog(store);
    expect(c.businessOf("HYGIENE")).toEqual({ slug: "hygiene", name: "Hygiene", hidden: false, names: ["hygiene"] });
    await expect(createBusiness(store, "hygiene")).rejects.toThrow('"hygiene" is already used by business "Hygiene".');
  });

  it("makes a new slug when one is taken", async () => {
    const store = await createTestStore();
    expect(await createBusiness(store, "Food & Beverage")).toEqual({ slug: "food-beverage" });
    expect(await createBusiness(store, "Food Beverage")).toEqual({ slug: "food-beverage-2" });
    expect(await createBusiness(store, "Food -- Beverage!")).toEqual({ slug: "food-beverage-3" });
  });

  it("keeps the old name as a match after a rename; the slug does not change", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await renameBusiness(store, "hygiene", "Hygiene Care");
    const c = await getCatalog(store);
    expect(c.businessOf("Hygiene")?.slug).toBe("hygiene");
    expect(c.businessOf("hygiene care")).toEqual({ slug: "hygiene", name: "Hygiene Care", hidden: false, names: ["hygiene care", "hygiene"] });
  });

  it("refuses a rename to another business's name, and unknown slugs", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await createBusiness(store, "Salt");
    await expect(renameBusiness(store, "salt", "HYGIENE")).rejects.toThrow('"HYGIENE" is already used by business "Hygiene".');
    await expect(renameBusiness(store, "nope", "X")).rejects.toThrow("That business doesn't exist.");
    await expect(setBusinessHidden(store, "nope", true)).rejects.toThrow("That business doesn't exist.");
    await renameBusiness(store, "hygiene", "hygiene"); // its own name is fine
    expect((await getCatalog(store)).businessOf("hygiene")?.name).toBe("hygiene");
  });

  it("still finds a hidden business, and refuses a new brand under it", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await setBusinessHidden(store, "hygiene", true);
    expect((await getCatalog(store)).businessOf("hygiene")?.hidden).toBe(true);
    await expect(createBrand(store, "hygiene", "Savlon")).rejects.toThrow("That business is hidden. Show it first.");
    await setBusinessHidden(store, "hygiene", false);
    expect(await createBrand(store, "hygiene", "Savlon")).toEqual({ id: expect.any(Number) });
  });

  it("keeps brand names unique across businesses", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await createBusiness(store, "Salt");
    await createBrand(store, "hygiene", "Savlon");
    await expect(createBrand(store, "salt", " SAVLON ")).rejects.toThrow('"SAVLON" is already used by brand "Savlon".');
    await expect(createBrand(store, "nope", "Other")).rejects.toThrow("That business doesn't exist.");
  });

  it("renames and hides a brand; the old name still matches", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    const { id } = await createBrand(store, "hygiene", "Savlon HW");
    await createBrand(store, "hygiene", "Mortein");
    await renameBrand(store, id, "Savlon Handwash");
    await setBrandHidden(store, id, true);
    const c = await getCatalog(store);
    expect(c.brandOf("savlon hw")).toEqual({ id, name: "Savlon Handwash", businessSlug: "hygiene", hidden: true, names: ["savlon handwash", "savlon hw"] });
    await expect(renameBrand(store, id, "mortein")).rejects.toThrow('"mortein" is already used by brand "Mortein".');
    await expect(renameBrand(store, 999, "X")).rejects.toThrow("That brand doesn't exist.");
    await expect(setBrandHidden(store, 999, true)).rejects.toThrow("That brand doesn't exist.");
  });

  it("applies a batch of changes in one transaction", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Salt");
    await createBusiness(store, "Toiletries");
    await store.transaction((tx) =>
      applyCatalogChanges(tx, [
        { op: "addBusiness", name: "SCJ" },
        { op: "businessSameAs", name: "ACI Salt", slug: "salt" },
        { op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["Savlon HW"] },
        { op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrand: "Savlon Soap" },
      ]),
    );
    const c = await getCatalog(store);
    expect(c.businessOf("scj")).toEqual({ slug: "scj", name: "SCJ", hidden: false, names: ["scj"] });
    expect(c.businessOf("aci salt")?.slug).toBe("salt");
    expect(c.brandOf("savlon hw")).toMatchObject({ name: "Savlon Handwash", businessSlug: "toiletries", names: ["savlon handwash", "savlon hw"] });
    expect(c.atlOf("SAVLON SOAP")).toEqual({ slug: "savlon-soap", name: "Savlon Soap", businessSlug: "toiletries", ownBrand: "Savlon Soap", hidden: false });
  });

  it("rolls back the whole batch when one change fails", async () => {
    const store = await createTestStore();
    await expect(
      store.transaction((tx) =>
        applyCatalogChanges(tx, [
          { op: "addBusiness", name: "SCJ" },
          { op: "addBrand", name: "Raid", businessSlug: "missing" },
        ]),
      ),
    ).rejects.toThrow("That business doesn't exist.");
    const c = await getCatalog(store);
    expect(c.businesses).toEqual([]);
    expect(c.brands).toEqual([]);
  });

  it("skips a change whose name already matches", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    const batch = [
      { op: "addBusiness", name: "SCJ" },
      { op: "addBusiness", name: "scj " },
      { op: "businessSameAs", name: "SCJ", slug: "toiletries" },
      { op: "addBrand", name: "Raid", businessSlug: "scj" },
      { op: "addBrand", name: "RAID", businessSlug: "toiletries" },
      { op: "addAtl", name: "Raid Spray", businessSlug: "scj", ownBrand: "Raid" },
      { op: "addAtl", name: "raid spray", businessSlug: "toiletries", ownBrand: "X" },
    ] as const;
    await store.transaction((tx) => applyCatalogChanges(tx, [...batch]));
    const c = await getCatalog(store);
    expect(c.businesses.map((b) => b.slug)).toEqual(["scj", "toiletries"]);
    expect(c.businessOf("scj")?.slug).toBe("scj");
    expect(c.brands).toHaveLength(1);
    expect(c.brandOf("raid")?.businessSlug).toBe("scj");
    expect(c.atl).toEqual([{ slug: "raid-spray", name: "Raid Spray", businessSlug: "scj", ownBrand: "Raid", hidden: false }]);
  });

  it("changes and hides an ATL category", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    await createBusiness(store, "Hygiene");
    await store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrand: "Savlon" }]));
    await setAtlCategory(store, "savlon-soap", { businessSlug: "hygiene", ownBrand: " Savlon  Soap " });
    await setAtlHidden(store, "savlon-soap", true);
    expect((await getCatalog(store)).atlOf("savlon soap")).toEqual({ slug: "savlon-soap", name: "Savlon Soap", businessSlug: "hygiene", ownBrand: "Savlon Soap", hidden: true });
    await expect(setAtlCategory(store, "savlon-soap", { businessSlug: "nope", ownBrand: "X" })).rejects.toThrow("That business doesn't exist.");
    await expect(setAtlCategory(store, "nope", { businessSlug: "hygiene", ownBrand: "X" })).rejects.toThrow("That ATL category doesn't exist.");
    await expect(setAtlHidden(store, "nope", true)).rejects.toThrow("That ATL category doesn't exist.");
  });

  it("the database refuses a name match that points at both or neither", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    const { id } = await createBrand(store, "hygiene", "Savlon");
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, business_slug, brand_id) VALUES ('business', 'x', 'hygiene', ${id})`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, business_slug, brand_id) VALUES ('brand', 'y', 'hygiene', NULL)`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, business_slug, brand_id) VALUES ('other', 'z', 'hygiene', NULL)`)).rejects.toThrow();
    await store.run(sql`INSERT INTO name_match (kind, norm_name, business_slug, brand_id) VALUES ('business', 'ok', 'hygiene', NULL)`); // positive control
  });
});
