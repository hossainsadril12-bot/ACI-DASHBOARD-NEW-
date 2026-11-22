import { afterAll, describe, expect, it } from "vitest";
import { createBrand, createBusiness, setBrandHidden, setBusinessHidden } from "@/store/catalog";
import type { Store } from "@/store/client";
import { publishVersion } from "@/store/datasets";
import { createTestStore as openTestStore } from "@/store/test-store";
import { loadManualEntry } from "./manual-data";

const opened: Store[] = [];
const createTestStore = async () => { const s = await openTestStore(); opened.push(s); return s; };
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const NOW = new Date("2026-11-19T06:00:00Z");
const EMPTY_SHEET = { rows: [], notes: [] };

describe("loadManualEntry", () => {
  it("starts empty when nothing is published: today's FY and his five statuses", async () => {
    expect(await loadManualEntry(await createTestStore(), NOW)).toEqual({
      channel: { versionId: null, fyStart: 2026, data: { elec: EMPTY_SHEET, dig: EMPTY_SHEET, press: EMPTY_SHEET } },
      fy: { versionId: null, fyStart: 2026, rows: [] },
      billboard: { versionId: null, data: { legend: ["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"], rows: [] } },
      businesses: [],
    });
  });

  it("gives each active version with its FY, and the visible businesses with their visible brands", async () => {
    const store = await createTestStore();
    const channelData = { elec: { rows: [{ sl: 1, n: "NTV", m: Array.from({ length: 12 }, () => 0) }], notes: [] }, dig: EMPTY_SHEET, press: EMPTY_SHEET };
    const ch = await publishVersion(store, { datasetKey: "channel", kind: "channel", label: "Channel Cost, Aug'25 to Aug'25", source: "upload", summary: { months: ["2025-08"] }, data: channelData });
    const fy = await publishVersion(store, { datasetKey: "fy", kind: "fy", label: "FY spend, FY 2025-26", source: "upload", summary: {}, data: [] });
    const bb = await publishVersion(store, { datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 0 bills", source: "upload", summary: {}, data: { legend: ["Paid"], rows: [] } });
    await createBusiness(store, "Toiletries");
    await createBusiness(store, "Hygiene");
    await createBusiness(store, "Old Co");
    await setBusinessHidden(store, "old-co", true);
    await createBrand(store, "toiletries", "Savlon");
    const old = await createBrand(store, "toiletries", "Old Brand");
    await setBrandHidden(store, old.id, true);

    expect(await loadManualEntry(store, NOW)).toEqual({
      channel: { versionId: ch.versionId, fyStart: 2025, data: channelData },
      fy: { versionId: fy.versionId, fyStart: 2025, rows: [] },
      billboard: { versionId: bb.versionId, data: { legend: ["Paid"], rows: [] } },
      businesses: [{ slug: "hygiene", name: "Hygiene", brands: [] }, { slug: "toiletries", name: "Toiletries", brands: ["Savlon"] }],
    });
  });
});
