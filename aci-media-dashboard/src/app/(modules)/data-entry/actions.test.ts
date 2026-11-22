import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>(), revalidated: [] as string[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => { h.revalidated.push(path); } }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const a = await import("./actions");
const { NOT_ADMIN_MESSAGE } = await import("@/auth/admin");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const { createBusiness, getCatalog } = await import("@/store/catalog");
const { STALE_MESSAGE, getActiveData, listHistory } = await import("@/store/datasets");
const { INVALID_INPUT } = await import("@/server/manual-entry");

const opened: Store[] = [];
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const months = (jul: number) => [jul, ...Array.from({ length: 11 }, () => 0)];
const channel = (base: number | null = null, n = "ATN Bangla") => ({ baseVersionId: base, data: { elec: [{ n, m: months(100000) }], dig: [], press: [] } });
const fy = { baseVersionId: null, rows: [{ biz: "Hygiene", b: "Neem", med: "TV", m: months(1.5), py: 0 }], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] };
const addBill = {
  baseVersionId: null, op: "add",
  bill: { v: "Vendor A", po: "", bill: "B-1", b: "", billc: "", chq: "", loc: "", cm: "", poa: 1000, ba: 800, diff: null, st: "", en: "", sb: "2026-11-19", pr: "", biz: "", status: "Finance/Audit" },
};
const counts = async () => ({ versions: (await listHistory(h.store)).length, brands: (await getCatalog(h.store)).brands.length });

beforeEach(async () => {
  h.store = await createTestStore();
  opened.push(h.store);
  h.jar.clear();
  h.revalidated = [];
  await createBusiness(h.store, "Hygiene");
});

describe("Manual Entry actions, called by a viewer", () => {
  it.each([
    ["saveChannelAction", () => a.saveChannelAction(channel())],
    ["saveFyAction", () => a.saveFyAction(fy)],
    ["changeBillboardAction", () => a.changeBillboardAction(addBill)],
  ])("%s is refused and changes nothing", async (_name, call) => {
    const before = await counts();
    expect(await call()).toEqual({ error: NOT_ADMIN_MESSAGE });
    expect(await counts()).toEqual(before);
    expect(h.revalidated).toEqual([]);
  });
});

describe("Manual Entry actions, called by the admin", () => {
  beforeEach(async () => { h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token); });

  it("saves channel cost as a manual version and refreshes Data Entry", async () => {
    const res = await a.saveChannelAction(channel());
    expect(res).toEqual({ error: null, ok: true, versionId: expect.any(Number), summary: "Electronic 0.10 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn" });
    expect((await listHistory(h.store))[0]).toMatchObject({ versionId: res.versionId, source: "manual" });
    expect(h.revalidated).toEqual(["/data-entry"]);
  });

  it("returns the data-changed message and refreshes nothing", async () => {
    await a.saveChannelAction(channel());
    h.revalidated = [];
    expect(await a.saveChannelAction(channel())).toEqual({ error: STALE_MESSAGE });
    expect(h.revalidated).toEqual([]);
  });

  it("saves FY spend and adds the new brand to the list", async () => {
    expect((await a.saveFyAction(fy)).ok).toBe(true);
    expect((await getCatalog(h.store)).brandOf("Neem")?.businessSlug).toBe("hygiene");
  });

  it("adds a bill and returns its summary", async () => {
    expect((await a.changeBillboardAction(addBill)).summary).toBe("Added bill B-1 · Vendor A · Finance/Audit");
  });

  it("restores an earlier manual version like any upload", async () => {
    const first = await a.saveChannelAction(channel());
    await a.saveChannelAction(channel(first.versionId ?? null, "NTV"));
    expect(await a.restoreVersionAction(first.versionId ?? 0)).toEqual({ error: null, ok: true });
    expect((await getActiveData(h.store, "channel"))?.versionId).toBe(first.versionId);
  });

  it("returns a plain message for input it cannot read", async () => {
    expect(await a.saveChannelAction({ nonsense: true })).toEqual({ error: INVALID_INPUT });
  });
});
