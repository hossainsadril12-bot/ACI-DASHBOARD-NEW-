import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { BAD_AMOUNT, BAD_DATE, BAD_STATUS, NO_BILL, VENDOR_REQUIRED, type BillInput } from "@/lib/manual/rules";
import { createBrand, createBusiness, getCatalog, setBusinessHidden } from "@/store/catalog";
import type { Store } from "@/store/client";
import * as datasets from "@/store/datasets";
import { STALE_MESSAGE, getActiveData, listHistory, publishVersion, restoreVersion } from "@/store/datasets";
import { createTestStore as openTestStore } from "@/store/test-store";
import { INVALID_INPUT, changeBillboard, saveChannel, saveFy } from "./manual-entry";

const opened: Store[] = [];
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const NOW = new Date("2026-11-19T06:00:00Z");
const months = (jul: number, aug = 0) => [jul, aug, ...Array.from({ length: 10 }, () => 0)];
const zeros = () => months(0);
const channel = (elec: { n: string; m: unknown[] }[] = [{ n: "ATN Bangla", m: months(100000) }]) => ({ elec, dig: [], press: [] });
const fyRow = (b: string, med: string, jul: number, biz = "Toiletries"): FyRow => ({ biz, b, med, m: months(jul), py: 0 });
const bill = (over: Partial<BillInput> = {}): BillInput => ({
  v: "Vendor A", po: "PO-1", bill: "B-1", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", poa: 1000, ba: 800, diff: null,
  st: "2026-07-01", en: "2026-07-31", sb: "2026-08-02", pr: "", biz: "Toiletries", status: "Finance/Audit", ...over,
});
const uploaded = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
  sl0: sl, v: `Vendor ${sl}`, po: "", bill: `U-${sl}`, poa: 0, ba: 0, diff: 0, st: null, en: null, sb: null, pr: null, stR: null, enR: null,
  biz: "AI", bz: "Others", b: "", billc: null, chq: null, loc: "", cm: "", show: "", status: "Payment Done", sl, ...over,
});

let store: Store;
const versions = async () => (await listHistory(store)).length;

beforeEach(async () => {
  store = await openTestStore();
  opened.push(store);
  await createBusiness(store, "Toiletries");
  await createBusiness(store, "Hygiene");
  await createBusiness(store, "Old Co");
  await setBusinessHidden(store, "old-co", true);
  await createBrand(store, "toiletries", "Savlon");
});

describe("saveChannel", () => {
  it("publishes the three sheets as one manual channel version with the upload's summary line", async () => {
    const res = await saveChannel(store, { baseVersionId: null, data: channel([{ n: " ATN Bangla ", m: months(100000) }, { n: "", m: months(5) }]) }, NOW);
    expect(res.summary).toBe("Electronic 0.10 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn");
    const [h0] = await listHistory(store);
    expect(h0).toMatchObject({ versionId: res.versionId, datasetKey: "channel", kind: "channel", source: "manual", fileId: null, label: "Channel Cost, Jul'26 to Jul'26" });
    expect(h0.summary).toMatchObject({ summary: res.summary, months: ["2026-07"], rowCount: 1, fyStart: 2026 });
    expect((await getActiveData<ChannelData>(store, "channel"))?.data.elec).toEqual({ rows: [{ sl: 1, n: "ATN Bangla", m: months(100000) }], notes: [] });
  });

  it("keeps the FY of the version it edits", async () => {
    const up = await publishVersion(store, {
      datasetKey: "channel", kind: "channel", label: "Channel Cost, Aug'25 to Aug'25", source: "upload", summary: { months: ["2025-08"] },
      data: { elec: { rows: [], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } },
    });
    await saveChannel(store, { baseVersionId: up.versionId, data: channel() }, NOW);
    const [h0] = await listHistory(store);
    expect(h0.label).toBe("Channel Cost, Jul'25 to Jul'25");
    expect(h0.summary).toMatchObject({ months: ["2025-07"], fyStart: 2025 });
  });

  it("refuses with the stale message when a version was published after opening, and writes nothing", async () => {
    await saveChannel(store, { baseVersionId: null, data: channel() }, NOW);
    await expect(saveChannel(store, { baseVersionId: null, data: channel() }, NOW)).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it("refuses when a restore moved the dataset after opening", async () => {
    const a = await saveChannel(store, { baseVersionId: null, data: channel() }, NOW);
    const b = await saveChannel(store, { baseVersionId: a.versionId, data: channel([{ n: "NTV", m: months(1) }]) }, NOW);
    await restoreVersion(store, a.versionId);
    await expect(saveChannel(store, { baseVersionId: b.versionId, data: channel() }, NOW)).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(2);
  });

  it("lets exactly one of two saves from the same version through (race)", async () => {
    const results = await Promise.allSettled([
      saveChannel(store, { baseVersionId: null, data: channel() }, NOW),
      saveChannel(store, { baseVersionId: null, data: channel([{ n: "NTV", m: months(1) }]) }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // The loser is refused by the write lock while the winner holds it (an in-memory store has one connection, so
    // libSQL says TRANSACTION_ACTIVE; a file store says "database is locked"). Not by the stale check, so not its message.
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await versions()).toBe(1);
    // The same save retried once the winner committed is refused by the stale check.
    await expect(saveChannel(store, { baseVersionId: null, data: channel() }, NOW)).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it.each([
    ["13 months", { baseVersionId: null, data: channel([{ n: "A", m: [...zeros(), 0] }]) }, INVALID_INPUT],
    ["a name over 120 characters", { baseVersionId: null, data: channel([{ n: "x".repeat(121), m: zeros() }]) }, INVALID_INPUT],
    ["text in an amount", { baseVersionId: null, data: channel([{ n: "A", m: ["12", ...zeros().slice(1)] }]) }, BAD_AMOUNT],
    ["an amount over 1e12", { baseVersionId: null, data: channel([{ n: "A", m: months(1e12 + 1) }]) }, BAD_AMOUNT],
    ["an endless amount", { baseVersionId: null, data: channel([{ n: "A", m: months(Infinity) }]) }, BAD_AMOUNT],
    ["501 rows in a sheet", { baseVersionId: null, data: channel(Array.from({ length: 501 }, () => ({ n: "A", m: zeros() }))) }, INVALID_INPUT],
    ["version id 0", { baseVersionId: 0, data: channel() }, INVALID_INPUT],
    ["a form instead of an object", new FormData(), INVALID_INPUT],
  ])("refuses %s with a plain message and writes nothing", async (_name, payload, message) => {
    await expect(saveChannel(store, payload, NOW)).rejects.toThrow(message);
    expect(await versions()).toBe(0);
  });
});

describe("saveFy", () => {
  it("adds a new brand to Businesses & Brands with the version, under the business picked", async () => {
    const res = await saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1.5, "anything")], newBrands: [{ name: " Neem ", businessSlug: "hygiene" }] }, NOW);
    expect(res.summary).toBe("1 brands · FY spend 1.50 Mn");
    expect((await getCatalog(store)).brandOf("Neem")).toMatchObject({ name: "Neem", businessSlug: "hygiene" });
    expect((await getActiveData<FyRow[]>(store, "fy"))?.data).toEqual([{ biz: "Hygiene", b: "Neem", med: "TV", m: months(1.5), py: 0 }]);
    expect((await listHistory(store))[0]).toMatchObject({ source: "manual", label: "FY spend, FY 2026-27" });
  });

  it("does not add a brand that is already on the list", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("SAVLON", "TV", 1)], newBrands: [{ name: "SAVLON", businessSlug: "hygiene" }] }, NOW);
    const cat = await getCatalog(store);
    expect(cat.brands.map((b) => [b.name, b.businessSlug])).toEqual([["Savlon", "toiletries"]]);
  });

  it("does not add a new brand whose rows are all 0 (they are dropped)", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 0), fyRow("Savlon", "TV", 2)], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] }, NOW);
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
  });

  it.each([["a hidden business", "old-co"], ["an unknown business", "nope"]])("refuses a new brand under %s and writes nothing", async (_n, slug) => {
    await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1)], newBrands: [{ name: "Neem", businessSlug: slug }] }, NOW))
      .rejects.toThrow("That business doesn't exist.");
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
    expect(await versions()).toBe(0);
  });

  it("rolls the new brand back when the version cannot be saved (one transaction)", async () => {
    const spy = vi.spyOn(datasets, "publishVersionsTx").mockRejectedValue(new Error("disk full"));
    try {
      await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1)], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] }, NOW)).rejects.toThrow("disk full");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
    expect(await versions()).toBe(0);
  });

  it("refuses with the stale message", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("Savlon", "TV", 1)], newBrands: [] }, NOW);
    await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Savlon", "TV", 2)], newBrands: [] }, NOW)).rejects.toThrow(STALE_MESSAGE);
  });

  it.each([
    ["11 months", { baseVersionId: null, rows: [{ ...fyRow("A", "TV", 1), m: zeros().slice(1) }], newBrands: [] }, INVALID_INPUT],
    ["text as last FY", { baseVersionId: null, rows: [{ ...fyRow("A", "TV", 1), py: "x" }], newBrands: [] }, BAD_AMOUNT],
    ["a blank medium", { baseVersionId: null, rows: [fyRow("A", " ", 1)], newBrands: [] }, INVALID_INPUT],
    ["a blank brand", { baseVersionId: null, rows: [fyRow("", "TV", 1)], newBrands: [] }, INVALID_INPUT],
    ["51 new brands", { baseVersionId: null, rows: [], newBrands: Array.from({ length: 51 }, (_, i) => ({ name: `B${i}`, businessSlug: "hygiene" })) }, INVALID_INPUT],
  ])("refuses %s", async (_n, payload, message) => {
    await expect(saveFy(store, payload, NOW)).rejects.toThrow(message);
  });
});

describe("changeBillboard", () => {
  it("adds the first bill, with his five standard statuses as the legend", async () => {
    const res = await changeBillboard(store, { baseVersionId: null, op: "add", bill: bill() });
    expect(res.summary).toBe("Added bill B-1 · Vendor A · Finance/Audit");
    const data = (await getActiveData<BillboardData>(store, "billboard"))?.data;
    expect(data?.legend).toEqual(["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"]);
    expect(data?.rows).toEqual([expect.objectContaining({ sl: 1, v: "Vendor A", diff: 200, biz: "Toiletries", bz: "Toiletries", sb: "2026-08-02", pr: null })]);
    expect((await listHistory(store))[0]).toMatchObject({ source: "manual", label: "Billboard billing, 1 bills", summary: expect.objectContaining({ rowCount: 1 }) });
  });

  it("edits and deletes by SL on top of the uploaded bills, keeping a business the bill already had", async () => {
    const up = await publishVersion(store, {
      datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 2 bills", source: "upload", summary: {},
      data: { legend: ["Payment Done", "Finance/Audit"], rows: [uploaded(1), uploaded(2)] },
    });
    const edited = await changeBillboard(store, { baseVersionId: up.versionId, op: "edit", sl: 1, bill: bill({ biz: "ai", status: "Payment Done" }) });
    expect((await getActiveData<BillboardData>(store, "billboard"))?.data.rows[0]).toMatchObject({ sl: 1, sl0: 1, biz: "AI", status: "Payment Done" });
    const del = await changeBillboard(store, { baseVersionId: edited.versionId, op: "delete", sl: 1 });
    expect(del.summary).toBe("Deleted bill B-1 · Vendor A · Payment Done");
    expect((await getActiveData<BillboardData>(store, "billboard"))?.data.rows).toEqual([{ ...uploaded(2), sl: 1 }]);
  });

  it("refuses a business that is not a visible one on the list", async () => {
    await expect(changeBillboard(store, { baseVersionId: null, op: "add", bill: bill({ biz: "AI" }) })).rejects.toThrow("That business doesn't exist.");
    await expect(changeBillboard(store, { baseVersionId: null, op: "add", bill: bill({ biz: "Old Co" }) })).rejects.toThrow("That business doesn't exist.");
    expect(await versions()).toBe(0);
  });

  it("refuses an SL that is not in the data, and a stale version", async () => {
    const a = await changeBillboard(store, { baseVersionId: null, op: "add", bill: bill() });
    await expect(changeBillboard(store, { baseVersionId: a.versionId, op: "delete", sl: 2 })).rejects.toThrow(NO_BILL);
    await expect(changeBillboard(store, { baseVersionId: null, op: "delete", sl: 1 })).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it.each([
    ["a blank vendor", { baseVersionId: null, op: "add", bill: bill({ v: "  " }) }, VENDOR_REQUIRED],
    ["a date that does not exist", { baseVersionId: null, op: "add", bill: bill({ st: "2026-02-30" }) }, BAD_DATE],
    ["a status not in the legend", { baseVersionId: null, op: "add", bill: bill({ status: "Paid?" }) }, BAD_STATUS],
    ["text as PO Amount", { baseVersionId: null, op: "add", bill: { ...bill(), poa: "1000" } }, BAD_AMOUNT],
    ["comments over 2000 characters", { baseVersionId: null, op: "add", bill: bill({ cm: "x".repeat(2001) }) }, INVALID_INPUT],
    ["an unknown operation", { baseVersionId: null, op: "move", sl: 1 }, INVALID_INPUT],
    ["SL 0", { baseVersionId: null, op: "delete", sl: 0 }, INVALID_INPUT],
  ])("refuses %s", async (_n, payload, message) => {
    await expect(changeBillboard(store, payload)).rejects.toThrow(message);
    expect(await versions()).toBe(0);
  });
});
