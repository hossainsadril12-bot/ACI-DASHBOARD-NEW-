import { describe, expect, it } from "vitest";
import type { BillboardRow } from "@/lib/ingest/readers/billboard";
import { BAD_AMOUNT, VENDOR_REQUIRED } from "@/lib/manual/rules";
import {
  ANY_MONTH, ANY_RANGE, BILL_COLUMNS, BILL_COLUMNS_KEY, CHANNEL_TABS, DEFAULT_BILL_COLUMNS, NEW_BRAND, QUARTER_TABS, addChannelRow, addFyBrand,
  amountText, billFilterActive, billForm, billInput, billMatches, billsCaption, billsCount, billsToShow, brandChoices, brandToAdd, channelDraft,
  channelInput, defaultQuarter, fyBrandGroups, fyDraft, fyInput, fyTable, inBillRange, isDirty, newBillForm, parseBillColumns, quarterMonths,
  readAmount, readStoredColumns, removeChannelRow, setChannelAmount, setChannelName, setFyAmount, submitMonthOptions, toggleBillColumn,
  withCurrent, writeBillColumns,
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

describe("view controls", () => {
  const bill = (sl: number, sb: string | null): BillboardRow => ({
    sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 1000, ba: 800, diff: 200, st: null, en: null, sb, pr: null,
    stR: null, enR: null, biz: "Salt", bz: "Salt", b: "ACI Salt", billc: null, chq: null, loc: "Gulshan", cm: "", show: "", status: "Payment Done", sl,
  });

  it("names the quarter buttons in FY order and maps each to its months (0 = Jul … 11 = Jun)", () => {
    expect(QUARTER_TABS.map((q) => [q.key, q.label])).toEqual([
      ["q1", "Q1 Jul–Sep"], ["q2", "Q2 Oct–Dec"], ["q3", "Q3 Jan–Mar"], ["q4", "Q4 Apr–Jun"], ["full", "Full year"],
    ]);
    expect(quarterMonths("q1")).toEqual([0, 1, 2]);
    expect(quarterMonths("q2")).toEqual([3, 4, 5]);
    expect(quarterMonths("q3")).toEqual([6, 7, 8]);
    expect(quarterMonths("q4")).toEqual([9, 10, 11]);
    expect(quarterMonths("full")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("opens on today's quarter in Dhaka when today is in the FY shown, else Full year", () => {
    expect(defaultQuarter(new Date("2026-11-22T06:00:00Z"), 2026)).toBe("q2");
    expect(defaultQuarter(new Date("2026-07-01T00:00:00Z"), 2026)).toBe("q1");
    expect(defaultQuarter(new Date("2027-02-10T06:00:00Z"), 2026)).toBe("q3");
    expect(defaultQuarter(new Date("2027-05-31T06:00:00Z"), 2026)).toBe("q4");
    // Dhaka is UTC+6: 30 Sep 17:59 UTC is still 30 Sep there, 18:00 UTC is 1 Oct.
    expect(defaultQuarter(new Date("2026-09-30T17:59:00Z"), 2026)).toBe("q1");
    expect(defaultQuarter(new Date("2026-09-30T18:00:00Z"), 2026)).toBe("q2");
    // Outside the FY the editor shows.
    expect(defaultQuarter(new Date("2026-11-22T06:00:00Z"), 2025)).toBe("full");
    expect(defaultQuarter(new Date("2027-06-30T17:59:00Z"), 2026)).toBe("q4");
    expect(defaultQuarter(new Date("2027-06-30T18:00:00Z"), 2026)).toBe("full"); // 1 Jul 2027 in Dhaka: FY 2027-28
  });

  it("keeps every month in the draft and in what Save sends, whichever quarter shows", () => {
    const data = { elec: { rows: [{ sl: 1, n: "ATN Bangla", m: months(100000) }], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } };
    // Aug (index 1) is outside Q2 Oct–Dec, the quarter on screen; its edit is still sent with all 12 months.
    expect(quarterMonths("q2")).not.toContain(1);
    const out = channelInput(setChannelAmount(channelDraft(data), "elec", "elec-0", 1, "4321"));
    expect(out.ok && out.data.elec[0].m).toEqual([100000, 4321, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Feb (index 7) is outside Q1 Jul–Sep; the FY row still sends 12 months and the Last FY total.
    expect(quarterMonths("q1")).not.toContain(7);
    const fy = fyInput(setFyAmount(fyDraft([]), { biz: "Salt", b: "ACI Salt" }, "TV", 7, "2"));
    expect(fy.ok && fy.rows[0]).toEqual({ biz: "Salt", b: "ACI Salt", med: "TV", m: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], py: 0 });
  });

  it("lists the Submit Date months after Any: blanks skipped, each month once, oldest first, as Mon'YY", () => {
    const rows = [bill(1, "2026-10-20"), bill(2, null), bill(3, "2026-08-15"), bill(4, "2026-10-01"), bill(5, ""), bill(6, "2027-01-05")];
    expect(submitMonthOptions(rows)).toEqual([
      { value: "2026-08", label: "Aug'26" }, { value: "2026-10", label: "Oct'26" }, { value: "2027-01", label: "Jan'27" },
    ]);
    // A month already chosen stays on its list after its last bill goes, so the select never shows a value it does not list.
    expect(submitMonthOptions([bill(1, "2026-10-20")], { from: "2026-07", to: ANY_MONTH }).map((o) => o.value)).toEqual(["2026-07", "2026-10"]);
  });

  it("filters on the Submit Date month: Any to Any, From only, To only, both, reversed, and a bill with no Submit Date", () => {
    const rows = [bill(1, "2026-08-15"), bill(2, "2026-10-20"), bill(3, "2027-01-05"), bill(4, null)];
    const keep = (from: string, to: string) => rows.filter((r) => inBillRange(r, { from, to })).map((r) => r.sl);
    expect(keep(ANY_MONTH, ANY_MONTH)).toEqual([1, 2, 3, 4]);
    expect(keep("2026-10", ANY_MONTH)).toEqual([2, 3]);
    expect(keep(ANY_MONTH, "2026-10")).toEqual([1, 2]);
    expect(keep("2026-08", "2026-10")).toEqual([1, 2]);
    expect(keep("2026-10", "2026-10")).toEqual([2]);
    expect(keep("2027-01", "2026-08")).toEqual([]);
  });

  it("works with the search and the first-40 rule, and says N of M bills only when a filter or search is on", () => {
    const rows = [...Array.from({ length: 45 }, (_, i) => bill(i + 1, "2026-10-20")), bill(46, "2026-08-15"), bill(47, null)];
    const oct = billsToShow(rows, "", false, { from: "2026-10", to: "2026-10" });
    expect([oct.shown.length, oct.matching, oct.shown[0].sl]).toEqual([40, 45, 45]);
    expect(billsToShow(rows, "", true, { from: "2026-10", to: "2026-10" }).shown).toHaveLength(45);
    expect(billsToShow(rows, "vendor 46", false, { from: "2026-08", to: ANY_MONTH }).shown.map((r) => r.sl)).toEqual([46]);
    expect(billsToShow(rows, "vendor 46", false, { from: "2026-10", to: ANY_MONTH }).matching).toBe(0);
    expect(billsToShow(rows, "", false).matching).toBe(47);
    expect(billsToShow(rows, "", false, ANY_RANGE).matching).toBe(47);
    expect(billFilterActive("", ANY_RANGE)).toBe(false);
    expect(billFilterActive("   ", ANY_RANGE)).toBe(false);
    expect(billFilterActive("gulshan", ANY_RANGE)).toBe(true);
    expect(billFilterActive("", { from: ANY_MONTH, to: "2026-10" })).toBe(true);
    expect(billsCount(2, 169)).toBe("2 of 169 bills");
  });

  it("lists the hideable bill columns in table order and opens with Bill No and Bill Amount", () => {
    expect(BILL_COLUMNS.map((c) => c.label)).toEqual(["PO", "Bill No", "PO Amount", "Bill Amount", "Brand", "Location"]);
    expect(DEFAULT_BILL_COLUMNS).toEqual(["bill", "ba"]);
    expect(toggleBillColumn(["bill", "ba"], "b", true)).toEqual(["bill", "ba", "b"]);
    expect(toggleBillColumn(["bill", "ba", "b"], "bill", false)).toEqual(["ba", "b"]);
    expect(toggleBillColumn(["loc"], "po", true)).toEqual(["po", "loc"]);
  });

  it("reads stored ticks, falling back to the default for a missing or bad value", () => {
    expect(parseBillColumns(null)).toEqual(["bill", "ba"]);
    expect(parseBillColumns('["loc","b"]')).toEqual(["b", "loc"]);
    expect(parseBillColumns("[]")).toEqual([]);
    for (const bad of ["not json", "{}", '"b"', '["b","sl"]', "[1]", "null"]) expect(parseBillColumns(bad), bad).toEqual(["bill", "ba"]);
  });

  it("reads and writes the browser's ticks without ever throwing", () => {
    const box = new Map<string, string>();
    const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
    expect(readStoredColumns(storage)).toBeNull();
    expect(writeBillColumns(storage, ["b", "loc"])).toBe(true);
    expect(box.get(BILL_COLUMNS_KEY)).toBe('["b","loc"]');
    expect(parseBillColumns(readStoredColumns(storage))).toEqual(["b", "loc"]);
    const blocked = {
      getItem: (): string | null => { throw new Error("blocked"); },
      setItem: (): void => { throw new Error("full"); },
    };
    expect(readStoredColumns(blocked)).toBeNull();
    expect(writeBillColumns(blocked, ["b"])).toBe(false);
    expect(readStoredColumns(null)).toBeNull();
    expect(writeBillColumns(null, ["b"])).toBe(false);
  });
});
