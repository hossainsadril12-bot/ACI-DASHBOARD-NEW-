import { describe, expect, it } from "vitest";
import { FILE_TYPES } from "./file-types";
import { OOH_MASTER_MESSAGE, UPLOAD_CARDS, cardForType, notThisFileMessage, wrongCardMessage, type CardKey } from "./cards";

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
    expect(card("atl").fileText).toBe('A "2026 Dash Board" file, one per TV category. The category is read from its "Brand Name:" line. You can choose several files at once.');
    expect(card("digital").fileText).toBe("The business's digital data file, with sheets Meta, YouTube and TikTok.");
    expect(card("fy").fileText).toBe('The CB Media Spent Report (its "Final Report" sheet).');
    expect(card("channel").fileText).toBe("The Channel Cost file, with sheets Electronic, Digital and Press & Radio.");
    expect(card("billing").fileText).toBe('Dashboard Media Final, sheet "Master".');
    expect(card("calendar").fileText).toBe("The All Activity Calendar file, one sheet per month.");
    expect(card("billboard").fileText).toBe("The Billboard Billing Status file.");
    expect(UPLOAD_CARDS.map((c) => c.updates)).toEqual([
      "ATL Media Performance, Home",
      "Digital Media Performance, Influencer, Activity Calendar, Home",
      "Home, FY Media Spend, Activity Calendar, OOH",
      "Channel Wise Spend",
      "Billing Overview, Vendor Statement, Billing Data Sheet",
      "Monthly Activity Calendar",
      "OOH Media Bill Details",
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
    expect(notThisFileMessage(card("calendar"))).toBe("This is not an Activity Calendar file. Expected: The All Activity Calendar file, one sheet per month.");
    expect(notThisFileMessage(card("fy"))).toBe('This is not an FY spend file. Expected: The CB Media Spent Report (its "Final Report" sheet).');
  });
});
