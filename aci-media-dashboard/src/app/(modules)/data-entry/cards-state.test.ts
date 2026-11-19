import { describe, expect, it } from "vitest";
import type { ActiveVersion } from "@/store/datasets";
import { cardStates, startDraft } from "./cards-state";
import { emptyDraft, toDecisions } from "./logic";

const v = (datasetKey: string, fileName: string | null, iso: string, source: ActiveVersion["source"] = "upload"): ActiveVersion => ({
  datasetKey, kind: datasetKey.split(":")[0], label: datasetKey, fileName, createdAt: new Date(iso), source,
});
const BIZ = [{ slug: "salt", name: "Salt" }, { slug: "hygiene", name: "Hygiene" }, { slug: "toiletries", name: "Toiletries", hidden: true }];
const nowOf = (states: ReturnType<typeof cardStates>) => Object.fromEntries(states.map((c) => [c.id, c.nowShowing]));

describe("cardStates", () => {
  it("shows the seven cards in order, with nothing uploaded yet, on an empty store", () => {
    expect(cardStates([], BIZ).map((c) => [c.id, c.title, c.business, c.nowShowing])).toEqual([
      ["atl", "ATL (TV) performance", null, "nothing uploaded yet"],
      ["digital", "Digital performance", null, "nothing uploaded yet"],
      ["fy", "FY media spend", null, "nothing uploaded yet"],
      ["channel", "Channel cost", null, "nothing uploaded yet"],
      ["billing", "Media billing", null, "nothing uploaded yet"],
      ["calendar", "Monthly activity calendar", null, "nothing uploaded yet"],
      ["billboard", "OOH / billboard bill status", null, "nothing uploaded yet"],
    ]);
  });

  it("gives each visible business with Digital data its own card in the Digital slot, then the card for another business", () => {
    const states = cardStates([
      v("digital:salt", "Salt.xlsx", "2026-11-16T08:05:00Z"),
      v("digital:hygiene", "Hygiene.xlsx", "2026-11-17T04:30:00Z"),
      v("digital:toiletries", "Toiletries.xlsx", "2026-11-17T04:30:00Z"), // hidden business: no card
      v("digital:gone", "Gone.xlsx", "2026-11-17T04:30:00Z"), // not on the list: no card
    ], BIZ);
    expect(states.filter((c) => c.card.key === "digital").map((c) => [c.id, c.title, c.business, c.nowShowing])).toEqual([
      ["digital:hygiene", "Digital · Hygiene", { slug: "hygiene", name: "Hygiene" }, "Hygiene.xlsx · 17 Nov 2026, 10:30"],
      ["digital:salt", "Digital · Salt", { slug: "salt", name: "Salt" }, "Salt.xlsx · 16 Nov 2026, 14:05"],
      ["digital", "Digital · another business", null, "nothing uploaded yet"],
    ]);
    expect(states.map((c) => c.id)).toEqual(["atl", "digital:hygiene", "digital:salt", "digital", "fy", "channel", "billing", "calendar", "billboard"]);
  });

  it("counts the ATL categories and names the last upload", () => {
    const two = cardStates([
      v("atl:lux-soap", "lux.xlsx", "2026-11-16T08:05:00Z"),
      v("atl:septex", "septex.xlsx", "2026-11-17T04:30:00Z"),
      v("calendar", "cal.xlsx", "2026-11-18T00:00:00Z"),
    ], []);
    expect(two[0].nowShowing).toBe("2 categories · last upload septex.xlsx · 17 Nov 2026, 10:30");
    expect(cardStates([v("atl:lux-soap", "lux.xlsx", "2026-11-16T08:05:00Z")], [])[0].nowShowing).toBe("1 category · last upload lux.xlsx · 16 Nov 2026, 14:05");
  });

  it("shows the file and time on the other cards, and Manual edit for a typed version", () => {
    const states = cardStates([
      v("billing", "billing.xlsx", "2026-11-16T08:05:00Z"),
      v("calendar", null, "2026-11-17T04:30:00Z", "manual"),
      v("atl:septex", null, "2026-11-17T04:30:00Z", "manual"),
    ], []);
    expect(nowOf(states)).toEqual({
      atl: "1 category · Manual edit · 17 Nov 2026, 10:30",
      digital: "nothing uploaded yet",
      fy: "nothing uploaded yet",
      channel: "nothing uploaded yet",
      billing: "billing.xlsx · 16 Nov 2026, 14:05",
      calendar: "Manual edit · 17 Nov 2026, 10:30",
      billboard: "nothing uploaded yet",
    });
  });
});

describe("startDraft", () => {
  it("sends the business of a business's own Digital card, and nothing on the other cards", () => {
    const [atl, hygiene, other] = cardStates([v("digital:hygiene", "h.xlsx", "2026-11-17T04:30:00Z")], BIZ);
    expect(hygiene.id).toBe("digital:hygiene");
    expect(startDraft(hygiene).business).toEqual({ value: "hygiene", newName: "" });
    expect(toDecisions(startDraft(hygiene), BIZ)).toEqual({ business: "hygiene", businesses: [], brands: [] });
    expect(startDraft(other)).toEqual(emptyDraft());
    expect(startDraft(atl)).toEqual(emptyDraft());
  });
});
