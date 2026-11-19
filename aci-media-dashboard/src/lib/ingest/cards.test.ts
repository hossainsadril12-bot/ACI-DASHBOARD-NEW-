import { describe, expect, it } from "vitest";
import { FILE_TYPES } from "./file-types";
import { ANOTHER_BUSINESS, OOH_MASTER_MESSAGE, UPLOAD_CARDS, cardForType, digitalCardSlugs, digitalCardTitle, notThisFileMessage, wrongBusinessMessage, wrongCardMessage, type CardKey } from "./cards";

const card = (key: CardKey) => UPLOAD_CARDS.find((c) => c.key === key)!;

describe("UPLOAD_CARDS", () => {
  it("has one card per Data Entry file, in the order of his app", () => {
    expect(UPLOAD_CARDS.map((c) => c.key)).toEqual(["atl", "digital", "fy", "channel", "billing", "calendar", "billboard"]);
    expect(UPLOAD_CARDS.map((c) => c.title)).toEqual([
      "ATL (TV) performance", "Digital performance", "FY media spend", "Channel cost", "Media billing", "Monthly activity calendar", "OOH / billboard bill status",
    ]);
  });
  it("gives every file type except the OOH master sheet exactly one card, keyed by its type", () => {
    for (const t of FILE_TYPES) expect(UPLOAD_CARDS.filter((c) => c.type === t), t).toHaveLength(t === "ooh-sites" ? 0 : 1);
    expect(UPLOAD_CARDS.every((c) => c.key === c.type)).toBe(true);
  });
  it("has unique titles, and only the ATL card takes several files", () => {
    expect(new Set(UPLOAD_CARDS.map((c) => c.title)).size).toBe(UPLOAD_CARDS.length);
    expect(UPLOAD_CARDS.filter((c) => c.multiple).map((c) => c.key)).toEqual(["atl"]);
  });
  it("says which file each card expects and which pages it updates", () => {
    expect(UPLOAD_CARDS.map((c) => c.fileText)).toEqual([
      "2026 Dash Board files, one per TV category.",
      "Digital file with Meta, YouTube and TikTok sheets.",
      "CB Media Spent Report.",
      "Channel Cost file.",
      "Dashboard Media Final file.",
      "All Activity Calendar file.",
      "Billboard Billing Status file.",
    ]);
    expect(UPLOAD_CARDS.map((c) => c.updates)).toEqual([
      "ATL and Home",
      "Digital, Influencer, Activity Calendar and Home",
      "Home, FY Spend, Activity Calendar and OOH",
      "Channel Spend",
      "Billing and Vendor Statement",
      "Activity Calendar",
      "OOH Bills",
    ]);
  });
});

describe("cardForType", () => {
  it("finds the card for each type, and none for the OOH master sheet", () => {
    expect(cardForType("billing")?.title).toBe("Media billing");
    expect(cardForType("digital")?.title).toBe("Digital performance");
    expect(cardForType("ooh-sites")).toBeNull();
  });
});

describe("safety messages", () => {
  it("names the card to use for a file of another type", () => {
    expect(wrongCardMessage(card("channel"), "calendar")).toBe(
      "This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.",
    );
    expect(wrongCardMessage(card("atl"), "billing")).toBe("This looks like a Billing master file, not ATL (TV). Close this and use the Media billing card.");
  });
  it("points a Digital file at a Digital card, since there is one per business", () => {
    expect(wrongCardMessage(card("billing"), "digital")).toBe("This looks like a Digital file, not Billing master. Close this and use a Digital card.");
  });
  it("sends the OOH master sheet to the OOH page", () => {
    expect(OOH_MASTER_MESSAGE).toBe("This is the OOH master sheet. It is uploaded on the OOH page.");
    expect(wrongCardMessage(card("billboard"), "ooh-sites")).toBe(OOH_MASTER_MESSAGE);
  });
  it("says what the card expects for a file that is none of his", () => {
    expect(notThisFileMessage(card("calendar"))).toBe("This is not an Activity Calendar file. Expected: All Activity Calendar file.");
    expect(notThisFileMessage(card("fy"))).toBe("This is not an FY spend file. Expected: CB Media Spent Report.");
  });
});

describe("wrongBusinessMessage", () => {
  it("names the Digital card the page shows for the brands' business", () => {
    expect(wrongBusinessMessage("Salt", "Hygiene", { ownerHasCard: true, anyHasCard: true })).toBe("This file's brands belong to Salt, not Hygiene. Use the Digital · Salt card.");
    expect(wrongBusinessMessage("Salt", "Hygiene", { ownerHasCard: false, anyHasCard: true })).toBe(
      "This file's brands belong to Salt, not Hygiene. Use the Digital · another business card and pick Salt.",
    );
    expect(wrongBusinessMessage("Salt", "Hygiene", { ownerHasCard: false, anyHasCard: false })).toBe(
      "This file's brands belong to Salt, not Hygiene. Use the Digital performance card and pick Salt.",
    );
  });
  it("uses the same titles as the cards", () => {
    expect(digitalCardTitle("Salt")).toBe("Digital · Salt");
    expect(ANOTHER_BUSINESS).toBe("Digital · another business");
  });
});

describe("digitalCardSlugs", () => {
  const businesses = [{ slug: "salt", name: "Salt" }, { slug: "hygiene", hidden: true }, { slug: "lux" }].map((b) => ({ slug: b.slug, hidden: (b as { hidden?: boolean }).hidden }));
  it("returns the visible businesses with an active digital:<slug> key", () => {
    expect([...digitalCardSlugs(["digital:salt", "digital:hygiene", "digital:ghost", "atl:soap", "fy"], businesses)]).toEqual(["salt"]);
  });
  it("is empty when no business has Digital data", () => {
    expect(digitalCardSlugs(["atl:soap", "digital"], businesses).size).toBe(0);
  });
});
