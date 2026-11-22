import { describe, expect, it } from "vitest";
import type { BillboardRow } from "@/lib/ingest/readers/billboard";
import { BAD_AMOUNT, VENDOR_REQUIRED } from "@/lib/manual/rules";
import {
  CHANNEL_TABS, NEW_BRAND, billForm, billInput, billMatches, billsCaption, billsToShow, newBillForm, withCurrent, addChannelRow, addFyBrand, amountText, brandChoices, brandToAdd, channelDraft, channelInput, fyBrandGroups, fyDraft, fyInput, fyTable,
  isDirty, readAmount, removeChannelRow, setChannelAmount, setChannelName, setFyAmount,
} from "./manual-drafts";

const months = (jul: number) => [jul, ...Array.from({ length: 11 }, () => 0)];
const blank11 = () => Array.from({ length: 11 }, () => "");

describe("amounts", () => {
  it("reads blank as null, allows commas, refuses text", () => {
    expect(readAmount("")).toEqual({ ok: true, value: null });
    expect(readAmount(" 1,250.5 ")).toEqual({ ok: true, value: 1250.5 });
    expect(readAmount("-3")).toEqual({ ok: true, value: -3 });
    expect(readAmount("12a")).toEqual({ ok: false });
    expect(readAmount("Infinity")).toEqual({ ok: false });
  });
  it("shows 0 as a blank box", () => {
    expect([amountText(0), amountText(1500), amountText(0.25)]).toEqual(["", "1500", "0.25"]);
  });
});

describe("channel draft", () => {
  const data = {
    elec: { rows: [{ sl: 7, n: "ATN Bangla", m: months(100000) }], notes: [] },
    dig: { rows: [], notes: [] },
    press: { rows: [{ sl: "x", n: "Prothom Alo", m: months(0) }], notes: [["Prothom Alo", 1, 2]] },
  };
  it("names its three sheets, columns and add buttons as the design does", () => {
    expect(CHANNEL_TABS.map((t) => [t.key, t.label, t.column, t.add])).toEqual([
      ["elec", "Electronic", "Channel", "+ Add channel"],
      ["dig", "Digital", "Platform", "+ Add platform"],
      ["press", "Press & Radio", "Newspaper / station", "+ Add newspaper / station"],
    ]);
  });
  it("makes boxes from the data, 0 as blank", () => {
    expect(channelDraft(data)).toEqual({
      elec: [{ key: "elec-0", n: "ATN Bangla", m: ["100000", ...blank11()] }],
      dig: [],
      press: [{ key: "press-0", n: "Prothom Alo", m: ["", ...blank11()] }],
    });
  });
  it("adds, renames, types and removes rows on one sheet only, and knows when it is back to what was loaded", () => {
    const start = channelDraft(data);
    let d = addChannelRow(start, "dig", "k1");
    d = setChannelName(d, "dig", "k1", "Facebook");
    d = setChannelAmount(d, "dig", "k1", 1, "2,000");
    expect(d.dig).toEqual([{ key: "k1", n: "Facebook", m: ["", "2,000", ...blank11().slice(1)] }]);
    expect(d.elec).toBe(start.elec);
    expect(isDirty(d, start)).toBe(true);
    expect(isDirty(removeChannelRow(d, "dig", "k1"), start)).toBe(false);
  });
  it("sends blank as 0 and refuses a box that is not a number", () => {
    const d = setChannelAmount(channelDraft(data), "elec", "elec-0", 2, "");
    expect(channelInput(d)).toEqual({ ok: true, data: { elec: [{ n: "ATN Bangla", m: months(100000) }], dig: [], press: [{ n: "Prothom Alo", m: months(0) }] } });
    expect(channelInput(setChannelAmount(d, "press", "press-0", 0, "abc"))).toEqual({ ok: false, error: BAD_AMOUNT });
  });
});

describe("FY draft", () => {
  const fyRows = [
    { biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.5), py: 2 },
    { biz: "Hygiene", b: "Septex", med: "Digital", m: months(0), py: 0.5 },
    { biz: "Toiletries", b: "Savlon Soap", med: "Radio", m: months(0.1), py: 0 },
    { biz: "Toiletries", b: "Meril", med: "OOH", m: months(0.2), py: 0 },
  ];
  const savlon = { biz: "Toiletries", b: "Savlon Soap" };
  const businesses = [{ slug: "hygiene", name: "Hygiene", brands: ["Septex", "Neem"] }, { slug: "toiletries", name: "Toiletries", brands: ["Savlon Soap"] }];

  it("groups the brands by business in the order they first appear", () => {
    expect(fyBrandGroups(fyDraft(fyRows))).toEqual([
      { biz: "Toiletries", brands: [savlon, { biz: "Toiletries", b: "Meril" }] },
      { biz: "Hygiene", brands: [{ biz: "Hygiene", b: "Septex" }] },
    ]);
  });
  it("shows TV, Digital, Print and OOH for a brand (blank when missing), then any other medium it has", () => {
    expect(fyTable(fyDraft(fyRows), savlon).map((r) => [r.med, r.m[0], r.py])).toEqual([
      ["TV", "1.5", "2"], ["Digital", "", ""], ["Print", "", ""], ["OOH", "", ""], ["Radio", "0.1", ""],
    ]);
  });
  it("types into an existing row, or makes the row for a missing medium", () => {
    let d = setFyAmount(fyDraft(fyRows), savlon, "TV", 0, "3");
    d = setFyAmount(d, savlon, "Print", "py", "4");
    expect(fyTable(d, savlon).find((r) => r.med === "TV")?.m[0]).toBe("3");
    expect(d.rows.at(-1)).toEqual({ biz: "Toiletries", b: "Savlon Soap", med: "Print", m: Array.from({ length: 12 }, () => ""), py: "4" });
  });
  it("adds a brand with its four media rows, and remembers only a new name for the list", () => {
    const d = addFyBrand(fyDraft(fyRows), { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: true });
    expect(d.rows.slice(-4).map((r) => [r.biz, r.b, r.med])).toEqual([["Hygiene", "Neem", "TV"], ["Hygiene", "Neem", "Digital"], ["Hygiene", "Neem", "Print"], ["Hygiene", "Neem", "OOH"]]);
    expect(d.newBrands).toEqual([{ name: "Neem", businessSlug: "hygiene" }]);
    expect(addFyBrand(fyDraft(fyRows), { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false }).newBrands).toEqual([]);
  });
  it("sends blank as 0 and refuses a box that is not a number", () => {
    const out = fyInput(fyDraft(fyRows));
    expect(out.ok && out.rows[0]).toEqual({ biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.5), py: 2 });
    expect(fyInput(setFyAmount(fyDraft(fyRows), savlon, "TV", 3, "x"))).toEqual({ ok: false, error: BAD_AMOUNT });
  });
  it("offers a business's list brands that are not in the FY data yet", () => {
    expect(brandChoices(fyDraft(fyRows), businesses[0])).toEqual(["Neem"]);
  });
  it("decides the brand to add: the list's spelling when it is on the list, a new name otherwise", () => {
    const d = fyDraft(fyRows);
    expect(brandToAdd(d, businesses, { businessSlug: "", brand: "", newName: "" })).toEqual({ ok: false, error: "Pick the business." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: "  " })).toEqual({ ok: false, error: "Pick a brand or type a new name." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: "septex" })).toEqual({ ok: false, error: "septex is already in the FY data." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: "Neem", newName: "" }))
      .toEqual({ ok: true, brand: { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false } });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: " NEEM " }))
      .toEqual({ ok: true, brand: { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false } });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: " Lizol  Pro " }))
      .toEqual({ ok: true, brand: { name: "Lizol Pro", businessSlug: "hygiene", businessName: "Hygiene", isNew: true } });
  });
});

describe("bills", () => {
  const row = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
    sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 1000, ba: 800, diff: 200, st: "2026-07-01", en: null, sb: null, pr: null,
    stR: null, enR: "bad", biz: "Salt", bz: "Salt", b: "ACI Salt", billc: 123, chq: null, loc: "Gulshan", cm: "", show: "", status: "Payment Done", sl, ...over,
  });

  it("fills the Edit form from a bill, and a new bill with Finance/Audit and today's Submit Date", () => {
    expect(billForm(row(3))).toEqual({
      v: "Vendor 3", po: "PO-3", bill: "B-3", b: "ACI Salt", billc: "123", chq: "", loc: "Gulshan", cm: "", poa: "1000", ba: "800", diff: "",
      st: "2026-07-01", en: "", sb: "", pr: "", biz: "Salt", status: "Payment Done",
    });
    expect(newBillForm(["Payment Done", "Finance/Audit"], "2026-11-19")).toMatchObject({ status: "Finance/Audit", sb: "2026-11-19", v: "", poa: "" });
    expect(newBillForm(["Paid", "Open"], "2026-11-19").status).toBe("Paid");
  });
  it("prefills Bill Difference blank when it is PO - Bill, else its own value", () => {
    expect(billForm(row(3, { poa: 1000, ba: 800, diff: 200 })).diff).toBe("");
    expect(billForm(row(3, { poa: 1000.1, ba: 800.2, diff: 199.9 })).diff).toBe("");
    expect(billForm(row(3, { poa: 1000, ba: 800, diff: 50 })).diff).toBe("50");
    expect(billForm(row(3, { poa: 100, ba: 100, diff: 0 })).diff).toBe("");
  });
  it("sends blank amounts as null (the server makes PO and Bill 0 and Bill Difference PO - Bill) and needs a vendor", () => {
    const f = { ...newBillForm(["Finance/Audit"], "2026-11-19"), v: "Vendor", poa: "1,000" };
    expect(billInput(f)).toEqual({ ok: true, bill: expect.objectContaining({ v: "Vendor", poa: 1000, ba: null, diff: null, sb: "2026-11-19" }) });
    expect(billInput({ ...f, v: "  " })).toEqual({ ok: false, error: VENDOR_REQUIRED });
    expect(billInput({ ...f, ba: "eight" })).toEqual({ ok: false, error: BAD_AMOUNT });
  });
  it("searches vendor, PO, bill no, brand and location, newest first, the first 40", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i + 1));
    const all = billsToShow(rows, "", false);
    expect([all.shown.length, all.matching, all.shown[0].sl]).toEqual([40, 45, 45]);
    expect(billsToShow(rows, "", true).shown).toHaveLength(45);
    expect(billsToShow(rows, "po-7", false).shown.map((r) => r.sl)).toEqual([7]);
    expect(billMatches(row(1), "gulshan")).toBe(true);
    expect(billMatches(row(1), "aci salt")).toBe(true);
    expect(billMatches(row(1), "payment")).toBe(false);
  });
  it("keeps a bill's own status or business in its select when the list does not have it", () => {
    expect(withCurrent(["Payment Done"], "Unmarked")).toEqual(["Payment Done", "Unmarked"]);
    expect(withCurrent(["Salt", "Hygiene"], "salt")).toEqual(["Salt", "Hygiene"]);
    expect(withCurrent(["Salt"], "")).toEqual(["Salt"]);
  });
  it("counts the bills in the caption", () => {
    expect(billsCaption(1)).toBe("1 bill · add a bill or change a status. Each save publishes.");
    expect(billsCaption(169)).toBe("169 bills · add a bill or change a status. Each save publishes.");
  });
});
