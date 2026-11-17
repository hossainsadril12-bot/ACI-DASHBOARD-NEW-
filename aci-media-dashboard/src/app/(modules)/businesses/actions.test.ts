import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>(), revalidated: [] as string[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { h.revalidated.push(p); } }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const a = await import("./actions");
const { NOT_ADMIN_MESSAGE } = await import("@/auth/admin");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const { applyCatalogChanges, createBrand, createBusiness, getCatalog } = await import("@/store/catalog");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const idle = { error: null };

async function signInAdmin() {
  h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
}

/** What the page shows, without the lookup functions. */
async function snapshot() {
  const { businesses, brands, atl } = await getCatalog(h.store);
  return { businesses, brands, atl };
}

let brandId: number;

beforeEach(async () => {
  h.store = await createTestStore();
  h.jar.clear();
  h.revalidated = [];
  await createBusiness(h.store, "Toiletries");
  await createBusiness(h.store, "Hygiene");
  brandId = (await createBrand(h.store, "toiletries", "Savlon")).id;
  await h.store.transaction((tx) => applyCatalogChanges(tx, [{ op: "addAtl", name: "Savlon Soap", businessSlug: "toiletries", ownBrands: ["Savlon"] }]));
});

describe("Businesses & Brands actions, called by a viewer", () => {
  const calls = (): [string, () => Promise<{ error: string | null }>][] => [
    ["createBusinessAction", () => a.createBusinessAction(idle, form({ name: "Seeds" }))],
    ["renameBusinessAction", () => a.renameBusinessAction(idle, form({ slug: "toiletries", name: "Toiletry" }))],
    ["setBusinessHiddenAction", () => a.setBusinessHiddenAction(idle, form({ slug: "toiletries", hidden: "true" }))],
    ["createBrandAction", () => a.createBrandAction(idle, form({ businessSlug: "toiletries", name: "Neem" }))],
    ["renameBrandAction", () => a.renameBrandAction(idle, form({ id: String(brandId), name: "Savlon Plus" }))],
    ["setBrandHiddenAction", () => a.setBrandHiddenAction(idle, form({ id: String(brandId), hidden: "true" }))],
    ["setAtlCategoryAction", () => a.setAtlCategoryAction(idle, form({ slug: "savlon-soap", businessSlug: "hygiene", ownBrands: "Neem" }))],
    ["setAtlHiddenAction", () => a.setAtlHiddenAction(idle, form({ slug: "savlon-soap", hidden: "true" }))],
  ];

  it.each(calls().map(([name]) => name))("%s is refused and changes nothing", async (name) => {
    const before = await snapshot();
    const res = await calls().find(([n]) => n === name)![1]();
    expect(res.error).toBe(NOT_ADMIN_MESSAGE);
    expect(await snapshot()).toEqual(before);
    expect(h.revalidated).toEqual([]);
  });
});

describe("Businesses & Brands actions, called by the admin", () => {
  beforeEach(signInAdmin);

  it("creates, renames, hides and shows a business", async () => {
    expect(await a.createBusinessAction(idle, form({ name: "  Seeds  " }))).toEqual({ error: null, ok: true });
    expect(await a.renameBusinessAction(idle, form({ slug: "seeds", name: "ACI Seeds" }))).toEqual({ error: null, ok: true });
    expect(await a.setBusinessHiddenAction(idle, form({ slug: "seeds", hidden: "true" }))).toEqual({ error: null, ok: true });
    let seeds = (await snapshot()).businesses.find((b) => b.slug === "seeds");
    expect(seeds).toMatchObject({ name: "ACI Seeds", hidden: true, names: ["ACI Seeds", "Seeds"] });
    await a.setBusinessHiddenAction(idle, form({ slug: "seeds", hidden: "false" }));
    seeds = (await snapshot()).businesses.find((b) => b.slug === "seeds");
    expect(seeds?.hidden).toBe(false);
    expect(h.revalidated).toContain("/businesses");
  });

  it("creates, renames and hides a brand", async () => {
    expect(await a.createBrandAction(idle, form({ businessSlug: "hygiene", name: "Neem" }))).toEqual({ error: null, ok: true });
    const neem = (await snapshot()).brands.find((b) => b.name === "Neem")!;
    expect(neem.businessSlug).toBe("hygiene");
    expect(await a.renameBrandAction(idle, form({ id: String(neem.id), name: "Neem Soap" }))).toEqual({ error: null, ok: true });
    expect(await a.setBrandHiddenAction(idle, form({ id: String(neem.id), hidden: "true" }))).toEqual({ error: null, ok: true });
    expect((await snapshot()).brands.find((b) => b.id === neem.id)).toMatchObject({ name: "Neem Soap", hidden: true, names: ["Neem Soap", "Neem"] });
  });

  it("moves an ATL category and sets our brands from one name per line, then hides it", async () => {
    const res = await a.setAtlCategoryAction(idle, form({ slug: "savlon-soap", businessSlug: "hygiene", ownBrands: "Savlon\r\n\n  Neem  \n" }));
    expect(res).toEqual({ error: null, ok: true });
    expect(await a.setAtlHiddenAction(idle, form({ slug: "savlon-soap", hidden: "true" }))).toEqual({ error: null, ok: true });
    expect((await snapshot()).atl[0]).toMatchObject({ slug: "savlon-soap", businessSlug: "hygiene", ownBrands: ["Savlon", "Neem"], hidden: true });
  });

  it("returns the store's message for a duplicate name and changes nothing", async () => {
    const before = await snapshot();
    expect(await a.createBusinessAction(idle, form({ name: "toiletries" }))).toEqual({ error: '"toiletries" is already used by business "Toiletries".' });
    expect(await a.createBrandAction(idle, form({ businessSlug: "hygiene", name: "SAVLON" }))).toEqual({ error: '"SAVLON" is already used by brand "Savlon".' });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses slugs and ids that don't exist, and empty input, with plain messages", async () => {
    expect((await a.renameBusinessAction(idle, form({ slug: "nope", name: "X" }))).error).toBe("That business doesn't exist.");
    expect((await a.setBusinessHiddenAction(idle, form({ hidden: "true" }))).error).toBe("That business doesn't exist.");
    expect((await a.createBrandAction(idle, form({ businessSlug: "nope", name: "X" }))).error).toBe("That business doesn't exist.");
    expect((await a.renameBrandAction(idle, form({ id: "abc", name: "X" }))).error).toBe("That brand doesn't exist.");
    expect((await a.setBrandHiddenAction(idle, form({ id: "999", hidden: "true" }))).error).toBe("That brand doesn't exist.");
    expect((await a.setAtlCategoryAction(idle, form({ slug: "nope", businessSlug: "hygiene", ownBrands: "A" }))).error).toBe("That ATL category doesn't exist.");
    expect((await a.setAtlCategoryAction(idle, form({ slug: "savlon-soap", businessSlug: "hygiene", ownBrands: "\n \n" }))).error).toBe("Pick 1 to 50 of our brands.");
    expect((await a.setAtlHiddenAction(idle, form({ slug: "nope", hidden: "true" }))).error).toBe("That ATL category doesn't exist.");
    expect((await a.createBusinessAction(idle, form({}))).error).toBe("Names must be 1 to 120 characters.");
  });
});
