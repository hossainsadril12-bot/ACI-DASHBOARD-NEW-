import { describe, expect, it, vi } from "vitest";
import type { BillboardData, BillboardRow } from "../ingest/readers/billboard";
import type { FyRow } from "../ingest/readers/fy";
import {
  BAD_STATUS, NO_BILL, applyBillChange, billboardVersion, channelVersion, currentFyStart, dhakaDate, fyMonthLabels, fyMonths, fyName,
  fyStartOf, fyVersion, type BillInput,
} from "./rules";

const NOW = new Date("2026-11-19T06:00:00Z");
const months = (jul: number, aug = 0) => [jul, aug, ...Array.from({ length: 10 }, () => 0)];
const zeros = () => months(0);

describe("FY helpers", () => {
  it("reads the day and the FY in Dhaka time (UTC+6)", () => {
    expect(dhakaDate(new Date("2026-06-30T18:30:00Z"))).toBe("2026-07-01");
    expect(currentFyStart(new Date("2026-06-30T18:30:00Z"))).toBe(2026);
    expect(currentFyStart(new Date("2026-06-30T17:00:00Z"))).toBe(2025);
    expect(currentFyStart(NOW)).toBe(2026);
  });
  it("finds the FY of a version: its own fyStart, then 'FY yyyy-yy' in its label, then its first month, then today", () => {
    expect(fyStartOf({ label: "Channel Cost", summary: { fyStart: 2024, months: ["2026-07"] } }, NOW)).toBe(2024);
    expect(fyStartOf({ label: "FY spend, FY 2025-26", summary: { months: [] } }, NOW)).toBe(2025);
    expect(fyStartOf({ label: "Channel Cost, Jan'27 to Feb'27", summary: { months: ["2027-01", "2027-02"] } }, NOW)).toBe(2026);
    expect(fyStartOf({ label: "Channel Cost", summary: {} }, NOW)).toBe(2026);
    expect(fyStartOf(null, NOW)).toBe(2026);
  });
  it("lists an FY's months Jul to Jun", () => {
    expect(fyMonths(2026)).toHaveLength(12);
    expect([fyMonths(2026)[0], fyMonths(2026)[5], fyMonths(2026)[6], fyMonths(2026)[11]]).toEqual(["2026-07", "2026-12", "2027-01", "2027-06"]);
    expect([fyMonthLabels(2026)[0], fyMonthLabels(2026)[11]]).toEqual(["Jul'26", "Jun'27"]);
    expect(fyName(2026)).toBe("2026-27");
    expect(fyName(2099)).toBe("2099-00");
  });
});

describe("channelVersion", () => {
  it("drops nameless rows, trims names, renumbers SL per sheet, rounds to 2 decimals and clears the notes", () => {
    const v = channelVersion({
      elec: [{ n: "  ATN Bangla ", m: months(100000.456) }, { n: "   ", m: months(5) }, { n: "Channel i", m: months(0, 250000) }],
      dig: [{ n: "Facebook", m: months(1000000) }],
      press: [],
    }, 2026);
    expect(v.data).toEqual({
      elec: { rows: [{ sl: 1, n: "ATN Bangla", m: months(100000.46) }, { sl: 2, n: "Channel i", m: months(0, 250000) }], notes: [] },
      dig: { rows: [{ sl: 1, n: "Facebook", m: months(1000000) }], notes: [] },
      press: { rows: [], notes: [] },
    });
    expect(v).toMatchObject({ datasetKey: "channel", kind: "channel", label: "Channel Cost, Jul'26 to Aug'26" });
    expect(v.summary).toEqual({
      summary: "Electronic 0.35 Mn · Digital 1.00 Mn · Press & Radio 0.00 Mn", months: ["2026-07", "2026-08"], rowCount: 3, warnings: [], fyStart: 2026,
    });
  });
  it("labels a sheet set with no amounts 'Channel Cost' and still records its FY", () => {
    const v = channelVersion({ elec: [{ n: "ATN Bangla", m: zeros() }], dig: [], press: [] }, 2025);
    expect(v.label).toBe("Channel Cost");
    expect(v.summary).toMatchObject({ months: [], fyStart: 2025 });
  });
});

describe("fyVersion", () => {
  it("drops rows with every value 0, rounds to 4 decimals and gives the short summary", () => {
    const rows: FyRow[] = [
      { biz: "Toiletries", b: " Savlon Soap ", med: "TV", m: months(1.23456), py: 0 },
      { biz: "Toiletries", b: "Savlon Soap", med: "Digital", m: zeros(), py: 0 },
      { biz: "Hygiene", b: "Septex", med: "OOH", m: zeros(), py: 2.5 },
    ];
    const v = fyVersion(rows, 2026);
    expect(v.data).toEqual([
      { biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.2346), py: 0 },
      { biz: "Hygiene", b: "Septex", med: "OOH", m: zeros(), py: 2.5 },
    ]);
    expect(v).toMatchObject({ datasetKey: "fy", kind: "fy", label: "FY spend, FY 2026-27" });
    expect(v.summary).toEqual({ summary: "2 brands · FY spend 1.23 Mn", months: ["2026-07"], rowCount: 2, warnings: [], fyStart: 2026 });
  });
});

const row = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
  sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 100, ba: 100, diff: 0, st: null, en: null, sb: null, pr: null,
  stR: "12..3.26", enR: null, biz: "Salt", bz: "Salt", b: "ACI Salt", billc: 123, chq: "", loc: "Dhaka", cm: "", show: "Show",
  status: "Payment Done", sl, ...over,
});
const input = (over: Partial<BillInput> = {}): BillInput => ({
  v: " Vendor C ", po: "PO-3", bill: "B-3", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", poa: 1000, ba: 800, diff: null,
  st: "2026-07-01", en: "", sb: "2026-08-02", pr: "", biz: "AI", status: "Finance/Audit", ...over,
});
const base = (): BillboardData => ({ legend: ["Payment Done", "Finance/Audit"], rows: [row(1), row(2)] });
const same = (raw: string) => raw.trim();

describe("applyBillChange", () => {
  it("adds a bill at the end with the next SL, Bill Difference = PO - Bill when blank, and the business group", () => {
    const { data, summary } = applyBillChange(base(), { op: "add", bill: input() }, same);
    expect(data.rows.map((r) => r.sl)).toEqual([1, 2, 3]);
    expect(data.rows[2]).toEqual({
      sl0: null, v: "Vendor C", po: "PO-3", bill: "B-3", poa: 1000, ba: 800, diff: 200, st: "2026-07-01", en: null, sb: "2026-08-02", pr: null,
      stR: null, enR: null, biz: "AI", bz: "Others", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", show: "", status: "Finance/Audit", sl: 3,
    });
    expect(summary).toBe("Added bill B-3 · Vendor C · Finance/Audit");
    expect(data.legend).toEqual(["Payment Done", "Finance/Audit"]);
  });
  it("makes blank PO and Bill amounts 0, and keeps a typed Bill Difference", () => {
    expect(applyBillChange(null, { op: "add", bill: input({ poa: null, ba: null }) }, same).data.rows[0]).toMatchObject({ poa: 0, ba: 0, diff: 0 });
    expect(applyBillChange(null, { op: "add", bill: input({ diff: 50 }) }, same).data.rows[0].diff).toBe(50);
  });
  it("starts from his five standard statuses when nothing was uploaded", () => {
    const { data } = applyBillChange(null, { op: "add", bill: input() }, same);
    expect(data.legend).toEqual(["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"]);
    expect(data.rows[0].sl).toBe(1);
  });
  it("edits a bill by SL: keeps its sheet SL and Show flag, clears unreadable-date text, asks for the business", () => {
    const businessOf = vi.fn((raw: string) => `${raw}!`);
    const { data, summary } = applyBillChange(base(), { op: "edit", sl: 1, bill: input({ status: "Payment Done", biz: "Salt" }) }, businessOf);
    expect(businessOf).toHaveBeenCalledWith("Salt", row(1));
    expect(data.rows[0]).toMatchObject({ sl: 1, sl0: 1, show: "Show", stR: null, v: "Vendor C", biz: "Salt!", status: "Payment Done" });
    expect(data.rows[1]).toEqual(row(2));
    expect(summary).toBe("Edited bill B-3 · Vendor C · Payment Done");
  });
  it("recomputes Bill Difference on edit when it is left blank, even if the stored one was different", () => {
    const stored = base();
    stored.rows[0] = row(1, { poa: 1000, ba: 800, diff: 200 });
    const { data } = applyBillChange(stored, { op: "edit", sl: 1, bill: input({ poa: 1000, ba: 900, diff: null }) }, same);
    expect(data.rows[0].diff).toBe(100);
  });
  it("rounds PO, Bill and the default difference to 2 decimals", () => {
    const r = applyBillChange(null, { op: "add", bill: input({ poa: 1000.005, ba: 800.004, diff: null }) }, same).data.rows[0];
    expect(r.poa).toBe(1000.01);
    expect(r.ba).toBe(800);
    expect(r.diff).toBe(200.01);
    const s = applyBillChange(null, { op: "add", bill: input({ poa: 1000.1, ba: 800.05, diff: null }) }, same).data.rows[0];
    expect(s.diff).toBe(200.05);
  });
  it("keeps the unreadable date text on an edit that leaves the date blank, and clears it when a real date is typed", () => {
    const kept = applyBillChange(base(), { op: "edit", sl: 1, bill: input({ st: "", en: "", status: "Payment Done" }) }, same).data.rows[0];
    expect(kept.stR).toBe("12..3.26");
    const typed = applyBillChange(base(), { op: "edit", sl: 1, bill: input({ st: "2026-07-01" }) }, same).data.rows[0];
    expect(typed.stR).toBeNull();
  });
  it("deletes a bill by SL and renumbers the rest from 1", () => {
    const { data, summary } = applyBillChange(base(), { op: "delete", sl: 1 }, same);
    expect(data.rows).toEqual([{ ...row(2), sl: 1 }]);
    expect(summary).toBe("Deleted bill B-1 · Vendor 1 · Payment Done");
  });
  it("leaves the bill number out of the summary when it is blank", () => {
    expect(applyBillChange(null, { op: "add", bill: input({ bill: "" }) }, same).summary).toBe("Added bill · Vendor C · Finance/Audit");
  });
  it("refuses an SL that is not there", () => {
    expect(() => applyBillChange(base(), { op: "edit", sl: 9, bill: input() }, same)).toThrow(NO_BILL);
    expect(() => applyBillChange(base(), { op: "delete", sl: 9 }, same)).toThrow(NO_BILL);
  });
  it("takes only legend statuses, plus the edited bill's own status", () => {
    expect(() => applyBillChange(base(), { op: "add", bill: input({ status: "Paid?" }) }, same)).toThrow(BAD_STATUS);
    const unmarked = { legend: ["Payment Done"], rows: [row(1, { status: "Unmarked" })] };
    expect(applyBillChange(unmarked, { op: "edit", sl: 1, bill: input({ status: "Unmarked" }) }, same).data.rows[0].status).toBe("Unmarked");
  });
});

describe("billboardVersion", () => {
  it("labels and summarises the whole dataset like an upload", () => {
    const { data, summary } = applyBillChange(base(), { op: "add", bill: input() }, same);
    expect(billboardVersion(data, summary)).toEqual({
      datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 3 bills",
      summary: { summary: "Added bill B-3 · Vendor C · Finance/Audit", months: [], rowCount: 3, warnings: [] }, data,
    });
  });
});
