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
  makeSlug,
  normName,
  renameBrand,
  renameBusiness,
  setAtlCategory,
  setAtlHidden,
  setBrandHidden,
  setBusinessHidden,
  type CatalogChange,
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
    expect(c.businessOf("HYGIENE")).toEqual({ slug: "hygiene", name: "Hygiene", hidden: false, names: ["Hygiene"] });
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
    expect(c.businessOf("hygiene care")).toEqual({ slug: "hygiene", name: "Hygiene Care", hidden: false, names: ["Hygiene Care", "Hygiene"] });
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
    await renameBusiness(store, "hygiene", "Hygiene Care"); // the old name keeps its latest spelling
    expect((await getCatalog(store)).businessOf("hygiene")?.names).toEqual(["Hygiene Care", "hygiene"]);
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
    expect(c.brandOf("savlon hw")).toEqual({ id, name: "Savlon Handwash", businessSlug: "hygiene", hidden: true, names: ["Savlon Handwash", "Savlon HW"] });
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
        { op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrands: ["Savlon Soap"] },
      ]),
    );
    const c = await getCatalog(store);
    expect(c.businessOf("scj")).toEqual({ slug: "scj", name: "SCJ", hidden: false, names: ["SCJ"] });
    expect(c.businessOf("aci salt")).toMatchObject({ slug: "salt", names: ["Salt", "ACI Salt"] });
    expect(c.brandOf("savlon hw")).toMatchObject({ name: "Savlon Handwash", businessSlug: "toiletries", names: ["Savlon Handwash", "Savlon HW"] });
    expect(c.atlOf("SAVLON SOAP")).toEqual({ slug: "savlon-soap", name: "Savlon Soap", businessSlug: "toiletries", ownBrands: ["Savlon Soap"], hidden: false });
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
    const batch: CatalogChange[] = [
      { op: "addBusiness", name: "SCJ" },
      { op: "addBusiness", name: "scj " },
      { op: "businessSameAs", name: "SCJ", slug: "toiletries" },
      { op: "addBrand", name: "Raid", businessSlug: "scj" },
      { op: "addBrand", name: "RAID", businessSlug: "toiletries" },
      { op: "addAtl", name: "Raid Spray", businessSlug: "scj", ownBrands: ["Raid"] },
      { op: "addAtl", name: "raid spray", businessSlug: "toiletries", ownBrands: ["X"] },
    ];
    await store.transaction((tx) => applyCatalogChanges(tx, batch));
    const c = await getCatalog(store);
    expect(c.businesses.map((b) => b.slug)).toEqual(["scj", "toiletries"]);
    expect(c.businessOf("scj")?.slug).toBe("scj");
    expect(c.brands).toHaveLength(1);
    expect(c.brandOf("raid")?.businessSlug).toBe("scj");
    expect(c.atl).toEqual([{ slug: "raid-spray", name: "Raid Spray", businessSlug: "scj", ownBrands: ["Raid"], hidden: false }]);
  });

  it("changes and hides an ATL category", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    await createBusiness(store, "Hygiene");
    await store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrands: ["Savlon"] }]));
    await setAtlCategory(store, "savlon-soap", { businessSlug: "hygiene", ownBrands: [" Savlon  Soap ", "Savlon Beauty"] });
    await setAtlHidden(store, "savlon-soap", true);
    expect((await getCatalog(store)).atlOf("savlon soap")).toEqual({ slug: "savlon-soap", name: "Savlon Soap", businessSlug: "hygiene", ownBrands: ["Savlon Soap", "Savlon Beauty"], hidden: true });
    await expect(setAtlCategory(store, "savlon-soap", { businessSlug: "nope", ownBrands: ["X"] })).rejects.toThrow("That business doesn't exist.");
    await expect(setAtlCategory(store, "nope", { businessSlug: "hygiene", ownBrands: ["X"] })).rejects.toThrow("That ATL category doesn't exist.");
    await expect(setAtlHidden(store, "nope", true)).rejects.toThrow("That ATL category doesn't exist.");
  });

  it("our brands: 1 to 50, each cleaned, duplicates dropped in order", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Others");
    const add = (ownBrands: string[]) =>
      store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "ACI Pure Spices", businessSlug: "others", ownBrands }]));
    const pick = "Pick at least one of our brands.";
    await expect(add([])).rejects.toThrow(new ValidationError(pick));
    await expect(add(Array.from({ length: 51 }, (_, i) => `Brand ${i}`))).rejects.toThrow(new ValidationError(pick));
    await expect(add(["ACI Pure Masala", "   "])).rejects.toThrow("Names must be 1 to 120 characters.");
    await expect(add(["x".repeat(121)])).rejects.toThrow(ValidationError);
    expect((await getCatalog(store)).atl).toEqual([]);
    await add(["ACI Pure Masala", " aci  pure MASALA ", "ACI Pure Halim Mix"]);
    expect((await getCatalog(store)).atlOf("aci pure spices")?.ownBrands).toEqual(["ACI Pure Masala", "ACI Pure Halim Mix"]);
    await expect(setAtlCategory(store, "aci-pure-spices", { businessSlug: "others", ownBrands: [] })).rejects.toThrow(new ValidationError(pick));
    await setAtlCategory(store, "aci-pure-spices", { businessSlug: "others", ownBrands: Array.from({ length: 50 }, (_, i) => `Brand ${i}`) });
    expect((await getCatalog(store)).atlOf("aci pure spices")?.ownBrands).toHaveLength(50);
  });

  it("the database refuses our brands that are not a JSON array", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Others");
    const insert = (slug: string, own: string) =>
      store.run(sql`INSERT INTO atl_category (slug, name, norm_name, business_slug, own_brands, created_at) VALUES (${slug}, ${slug}, ${slug}, 'others', ${own}, 0)`);
    await expect(insert("a", '"ACI Pure Masala"')).rejects.toThrow();
    await expect(insert("b", '{"x":1}')).rejects.toThrow();
    await expect(insert("c", "not json")).rejects.toThrow();
    await insert("ok", '["ACI Pure Masala"]'); // positive control
    expect((await getCatalog(store)).atlOf("ok")?.ownBrands).toEqual(["ACI Pure Masala"]);
  });

  it("the database refuses a name match that points at both or neither", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    const { id } = await createBrand(store, "hygiene", "Savlon");
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, name, business_slug, brand_id) VALUES ('business', 'x', 'X', 'hygiene', ${id})`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, name, business_slug, brand_id) VALUES ('brand', 'y', 'Y', 'hygiene', NULL)`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, name, business_slug, brand_id) VALUES ('other', 'z', 'Z', 'hygiene', NULL)`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, business_slug, brand_id) VALUES ('business', 'n', 'hygiene', NULL)`)).rejects.toThrow();
    await expect(store.run(sql`INSERT INTO name_match (kind, norm_name, name, business_slug, brand_id) VALUES ('business', 'e', '', 'hygiene', NULL)`)).rejects.toThrow();
    await store.run(sql`INSERT INTO name_match (kind, norm_name, name, business_slug, brand_id) VALUES ('business', 'ok', 'OK', 'hygiene', NULL)`); // positive control
  });
});

describe("makeSlug", () => {
  const free = () => false;

  it("keeps ASCII letters and digits only", () => {
    expect(makeSlug("Food & Beverage", free, "business")).toBe("food-beverage");
    expect(makeSlug("  Café  Crème 2 ", free, "atl")).toBe("caf-cr-me-2");
  });

  it("falls back when nothing is left", () => {
    expect(makeSlug("সাবলন সাবান", free, "business")).toBe("business");
    expect(makeSlug("সাবলন সাবান", free, "atl")).toBe("atl");
    expect(makeSlug("!!!", free, "business")).toBe("business");
    expect(makeSlug("!!!", (s) => s === "atl", "atl")).toBe("atl-2");
  });

  it("fits the -N suffix inside 60 characters", () => {
    const long = "x".repeat(70);
    expect(makeSlug(long, free, "business")).toBe("x".repeat(60));
    const slug = makeSlug(long, (s) => s === "x".repeat(60), "business");
    expect(slug).toHaveLength(60);
    expect(slug).toBe(`${"x".repeat(58)}-2`);
  });

  it("gives a Bengali-only business the fallback slug in the store", async () => {
    const store = await createTestStore();
    expect(await createBusiness(store, "সাবলন")).toEqual({ slug: "business" });
    expect(await createBusiness(store, "হাইজিন")).toEqual({ slug: "business-2" });
  });

  it("predicts exactly the slugs applyCatalogChanges stores", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Savlon Soap", businessSlug: "hygiene", ownBrands: ["Savlon"] }]));
    const before = await getCatalog(store);
    const bizTaken = new Set(before.businesses.map((b) => b.slug));
    const atlTaken = new Set(before.atl.map((a) => a.slug));
    const predict = (name: string, taken: Set<string>, fallback: "business" | "atl") => {
      const slug = makeSlug(name, (s) => taken.has(s), fallback);
      taken.add(slug);
      return slug;
    };
    const expected = {
      businessSlugs: {
        "food & beverage": predict("Food & Beverage", bizTaken, "business"),
        "food beverage": predict("Food Beverage", bizTaken, "business"),
        "hygiene!": predict("Hygiene!", bizTaken, "business"),
      },
      atlSlugs: { "savlon soap!": predict("Savlon Soap!", atlTaken, "atl") },
    };
    expect(expected).toEqual({
      businessSlugs: { "food & beverage": "food-beverage", "food beverage": "food-beverage-2", "hygiene!": "hygiene-2" },
      atlSlugs: { "savlon soap!": "savlon-soap-2" },
    });
    const result = await store.transaction((tx) =>
      applyCatalogChanges(tx, [
        { op: "addBusiness", name: "Food & Beverage" },
        { op: "addBusiness", name: "Food Beverage" },
        { op: "addBusiness", name: "Hygiene!" },
        { op: "addAtl", name: "Savlon Soap!", businessSlug: "hygiene", ownBrands: ["Savlon"] },
      ]),
    );
    expect(result).toEqual(expected);
    const after = await getCatalog(store);
    expect(after.businessOf("food beverage")?.slug).toBe("food-beverage-2");
    expect(after.atlOf("savlon soap!")?.slug).toBe("savlon-soap-2");
  });
});

describe("catalog name spellings and aliases", () => {
  it("returns stored spellings: own name first, then the others alphabetically", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await renameBusiness(store, "hygiene", "Hygiene Care");
    expect((await getCatalog(store)).businessOf("hygiene")?.names).toEqual(["Hygiene Care", "Hygiene"]);
    await store.transaction((tx) => applyCatalogChanges(tx, [{ op: "businessSameAs", name: "ACI Hygiene", slug: "hygiene" }]));
    expect((await getCatalog(store)).businessOf("hygiene")?.names).toEqual(["Hygiene Care", "ACI Hygiene", "Hygiene"]);
  });

  it("keeps the alias spelling", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    await store.transaction((tx) =>
      applyCatalogChanges(tx, [{ op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["Savlon HW"] }]),
    );
    expect((await getCatalog(store)).brandOf("SAVLON HW")?.names).toEqual(["Savlon Handwash", "Savlon HW"]);
  });

  it("adds the aliases to a brand that already exists", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    const { id } = await createBrand(store, "toiletries", "Savlon Handwash");
    await store.transaction((tx) =>
      applyCatalogChanges(tx, [{ op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["Savlon HW"] }]),
    );
    const c = await getCatalog(store);
    expect(c.brands).toHaveLength(1);
    expect(c.brandOf("savlon hw")).toEqual({ id, name: "Savlon Handwash", businessSlug: "toiletries", hidden: false, names: ["Savlon Handwash", "Savlon HW"] });
  });

  it("keeps the aliases of two changes that map to the same full name; an alias of another brand stays there", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    await createBrand(store, "toiletries", "Mortein");
    await store.transaction((tx) =>
      applyCatalogChanges(tx, [
        { op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["Savlon HW"] },
        { op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["SHW", "mortein"] },
      ]),
    );
    const c = await getCatalog(store);
    expect(c.brands).toHaveLength(2);
    expect(c.brandOf("shw")?.names).toEqual(["Savlon Handwash", "Savlon HW", "SHW"]);
    expect(c.brandOf("mortein")?.name).toBe("Mortein");
  });

  it("refuses a bad alias even when the brand already exists", async () => {
    const store = await createTestStore();
    await createBusiness(store, "Toiletries");
    await createBrand(store, "toiletries", "Savlon Handwash");
    await expect(
      store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["   "] }])),
    ).rejects.toThrow("Names must be 1 to 120 characters.");
  });
});

describe("hidden businesses refuse new names", () => {
  const hiddenStore = async () => {
    const store = await createTestStore();
    await createBusiness(store, "Hygiene");
    await createBusiness(store, "Toiletries");
    await store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrands: ["Savlon"] }]));
    await setBusinessHidden(store, "hygiene", true);
    return store;
  };
  const hiddenMsg = "That business is hidden. Show it first.";

  it("addBrand", async () => {
    const store = await hiddenStore();
    await expect(store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addBrand", name: "Raid", businessSlug: "hygiene" }]))).rejects.toThrow(hiddenMsg);
    expect((await getCatalog(store)).brands).toEqual([]);
  });

  it("businessSameAs", async () => {
    const store = await hiddenStore();
    await expect(store.transaction((tx) => applyCatalogChanges(tx, [{ op: "businessSameAs", name: "ACI Hygiene", slug: "hygiene" }]))).rejects.toThrow(hiddenMsg);
    expect((await getCatalog(store)).businessOf("aci hygiene")).toBeNull();
  });

  it("addAtl", async () => {
    const store = await hiddenStore();
    await expect(
      store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Mortein", businessSlug: "hygiene", ownBrands: ["Mortein"] }])),
    ).rejects.toThrow(hiddenMsg);
    expect((await getCatalog(store)).atlOf("mortein")).toBeNull();
  });

  it("setAtlCategory", async () => {
    const store = await hiddenStore();
    await expect(setAtlCategory(store, "savlon-soap", { businessSlug: "hygiene", ownBrands: ["Savlon"] })).rejects.toThrow(hiddenMsg);
    expect((await getCatalog(store)).atlOf("savlon soap")?.businessSlug).toBe("toiletries");
  });
});
