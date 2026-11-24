import { describe, expect, it } from "vitest";
import { readCalendar, type CalendarData, type CalendarRow } from "@/lib/ingest/readers/calendar";
import { openWorkbook } from "@/lib/ingest/workbook";
import { clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { normName } from "@/lib/names-normal";
import { FY_MEDIA } from "@/lib/manual/rules";
import { xstr } from "@/lib/ingest/cells";
import { calendarHref, calendarQuery, calendarView, carriedParams, cellMedia, chartScale, cellTitle, changeNote, columnText, formatSheet, monthsNote, parseCalendarParams, parseNotes, toggleMedium, type CalendarInput, type CalendarParams } from "./calendar";

const row = (biz: string, b: string, ...v: number[]): CalendarRow => ({ biz, b, v, t: v.reduce((a, x) => a + x, 0) });
const month = (m: string, rows: CalendarRow[]) => ({ m, label: m, rows, notes: {} });
// The list order is Hygiene first; the data has Toiletries first, so groups must follow the data.
const BIZ = [{ slug: "hygiene", name: "Hygiene" }, { slug: "toiletries", name: "Toiletries" }];
const PARAMS: CalendarParams = { view: "gantt", media: [...FY_MEDIA], inactive: false, sheet: null };
const base = (data: CalendarData, over: Partial<CalendarInput> = {}, params: Partial<CalendarParams> = {}): CalendarInput => ({
  data, fyStart: 2026, today: "2026-10",
  businessOf: (n) => BIZ.find((b) => b.name.toLowerCase() === n.toLowerCase()) ?? (n === "Toilet" ? BIZ[1] : null),
  brandOf: (n) => (/^savlon h(w|andwash)$/i.test(n) ? { name: "Savlon Handwash" } : null),
  business: null, ...over, params: { ...PARAMS, ...params },
});
// v = [TV, Digital, Print, OOH]
const DATA: CalendarData = {
  months: [
    month("2026-07", [row("Toiletries", "Savlon HW", 1, 0.5, 0, 0), row("Toiletries", "Lux", 0, 0, 2, 0), row("Hygiene", "Angel", 0, 0, 0, 1)]),
    month("2026-08", [row("Toiletries", "Savlon Handwash", 2, 0, 0, 0), row("Toilet", "Savlon HW", 0, 1, 0, 0), row("Toiletries", "Lux", 0, 0, 0, 0), row("Hygiene", "Angel", 0, 0, 0, 2), row("Hygiene", "Ghost", 0, 0, 0, 0)]),
    month("2026-09", [row("Toiletries", "Lux", 0, 0, 3, 0), row("Toiletries", "Savlon HW", 3, 0, 0, 0), row("Hygiene", "Angel", 1, 0, 0, 0), row("Hygiene", "TvOnly", 0.5, 0, 0, 0)]),
    month("2026-10", [row("Toiletries", "Savlon HW", 4, 1, 0, 1), row("Toiletries", "Lux", 0, 0, 1, 0), row("Hygiene", "Angel", 1, 0, 0, 0)]),
  ],
};
const NULL8 = Array(8).fill(null);

describe("parseCalendarParams", () => {
  it("defaults to the Gantt, all four media, active brands only, latest sheet month", () => {
    expect(parseCalendarParams({})).toEqual({ view: "gantt", media: ["TV", "Digital", "Print", "OOH"], inactive: false, sheet: null });
  });
  it("keeps only the four media, in FY_MEDIA order; empty or invalid means all four", () => {
    expect(parseCalendarParams({ media: "OOH,TV,bogus" }).media).toEqual(["TV", "OOH"]);
    expect(parseCalendarParams({ media: "" }).media).toEqual([...FY_MEDIA]);
    expect(parseCalendarParams({ media: "bogus" }).media).toEqual([...FY_MEDIA]);
    expect(parseCalendarParams({ media: ["TV"] }).media).toEqual([...FY_MEDIA]);
  });
  it("reads view=sheet and inactive=1 exactly", () => {
    expect(parseCalendarParams({ view: "sheet" }).view).toBe("sheet");
    expect(parseCalendarParams({ view: "SHEET" }).view).toBe("gantt");
    expect(parseCalendarParams({ inactive: "1" }).inactive).toBe(true);
    expect(parseCalendarParams({ inactive: "true" }).inactive).toBe(false);
  });
  it("keeps a month-shaped or fytd sheet choice, drops junk", () => {
    expect(parseCalendarParams({ sheet: "fytd" }).sheet).toBe("fytd");
    expect(parseCalendarParams({ sheet: "2026-09" }).sheet).toBe("2026-09");
    expect(parseCalendarParams({ sheet: "<script>" }).sheet).toBeNull();
    expect(parseCalendarParams({ sheet: ["fytd"] }).sheet).toBeNull();
  });
});

describe("formatSheet", () => {
  it("shows 2 to 3 decimals with grouping, blank for 0", () => {
    expect(formatSheet(0)).toBe("");
    expect(formatSheet(39.327)).toBe("39.327");
    expect(formatSheet(1.5)).toBe("1.50");
    expect(formatSheet(1234.5678)).toBe("1,234.568");
  });
});

describe("calendarView: months and the sheet choice", () => {
  it("labels the FY and marks uploaded months and the current month", () => {
    const v = calendarView(base(DATA));
    expect(v.fyLabel).toBe("2026-27");
    expect(v.monthKeys[0]).toBe("2026-07");
    expect(v.monthKeys[11]).toBe("2027-06");
    expect(v.monthLabels[3]).toBe("Oct'26");
    expect(v.uploaded).toEqual([true, true, true, true, ...Array(8).fill(false)]);
    expect(v.currentIndex).toBe(3);
    expect(calendarView(base(DATA, { today: "2027-08" })).currentIndex).toBe(-1);
    expect(calendarView(base(DATA, { today: "2026-06" })).currentIndex).toBe(-1);
  });
  it("ignores months outside the FY", () => {
    const v = calendarView(base({ months: [...DATA.months, month("2027-07", [row("Toiletries", "Lux", 9, 0, 0, 0)])] }));
    expect(v.cards!.fytd).toBe(25);
    expect(v.chart).toHaveLength(4);
  });
  it("chooses the sheet month from uploaded months, and falls back to the latest", () => {
    const sheet = (s: string | null) => calendarView(base(DATA, {}, { sheet: s })).sheet;
    expect(sheet(null).choice).toBe("2026-10");
    expect(sheet("fytd").choice).toBe("fytd");
    expect(sheet("2026-08").choice).toBe("2026-08");
    expect(sheet("2026-12").choice).toBe("2026-10"); // not uploaded
    expect(sheet(null).choices).toEqual([
      { key: "2026-07", label: "Jul'26" }, { key: "2026-08", label: "Aug'26" }, { key: "2026-09", label: "Sep'26" }, { key: "2026-10", label: "Oct'26" },
      { key: "fytd", label: "FY to date" },
    ]);
    expect(sheet(null).title).toBe("October 2026");
    expect(sheet("fytd").title).toBe("FY 2026-27 to date (Jul'26 to Oct'26)");
  });
});

describe("calendarView: cards", () => {
  it("totals the FY so far, the latest month and its change", () => {
    const c = calendarView(base(DATA)).cards!;
    expect(c.fytd).toBe(25);
    expect(c.uploadedCount).toBe(4);
    expect(c.firstLabel).toBe("Jul'26");
    expect(c.lastLabel).toBe("Oct'26");
    expect(c.last).toEqual({ label: "Oct'26", total: 8, prevLabel: "Sep'26", changePct: 6.7 }); // 7.5 -> 8
  });
  it("gives a rise and a fall to 1 decimal", () => {
    const t = calendarView(base(DATA, { business: BIZ[1] })).cards!;
    expect(t.last.changePct).toBe(16.7); // 6 -> 7
    const h = calendarView(base(DATA, { business: BIZ[0] })).cards!;
    expect(h.last.changePct).toBe(-33.3); // 1.5 -> 1
  });
  it("has no change for a single month, or when the previous month was 0", () => {
    const one = calendarView(base({ months: [DATA.months[0]] })).cards!;
    expect(one.uploadedCount).toBe(1);
    expect(one.firstLabel).toBe("Jul'26");
    expect(one.lastLabel).toBe("Jul'26");
    expect(one.last).toEqual({ label: "Jul'26", total: 4.5, prevLabel: null, changePct: null });
    const zeroPrev = calendarView(base({ months: [month("2026-07", [row("Hygiene", "Angel", 0, 0, 0, 0)]), month("2026-08", [row("Hygiene", "Angel", 1, 0, 0, 0)])] })).cards!;
    expect(zeroPrev.last.prevLabel).toBe("Jul'26");
    expect(zeroPrev.last.changePct).toBeNull();
  });
  it("counts active brands in the latest month and in the FY", () => {
    const c = calendarView(base(DATA)).cards!;
    expect(c.activeLast).toBe(3); // Savlon Handwash, Lux, Angel
    expect(c.activeFy).toBe(4); // plus TvOnly; Ghost never spent
  });
  it("rounds each mix share on its own, and gives 0s for a zero latest month", () => {
    expect(calendarView(base(DATA)).cards!.mix).toEqual([
      { medium: "TV", pct: 63 }, { medium: "Digital", pct: 13 }, { medium: "Print", pct: 13 }, { medium: "OOH", pct: 13 },
    ]); // 5, 1, 1, 1 of 8
    const zero = calendarView(base({ months: [month("2026-07", [row("Hygiene", "Angel", 1, 0, 0, 0)]), month("2026-08", [row("Hygiene", "Angel", 0, 0, 0, 0)])] })).cards!;
    expect(zero.mix.map((m) => m.pct)).toEqual([0, 0, 0, 0]);
    expect(zero.last.changePct).toBe(-100);
  });
  it("ignores the media toggles", () => {
    expect(calendarView(base(DATA, {}, { media: ["Print"] })).cards).toEqual(calendarView(base(DATA)).cards);
  });
  it("compares with the previous uploaded month when a month in between is missing", () => {
    const gap = calendarView(base({ months: [DATA.months[0], DATA.months[2]] })).cards!;
    expect(gap.last.label).toBe("Sep'26");
    expect(gap.last.prevLabel).toBe("Jul'26");
    expect(gap.last.changePct).toBe(66.7); // 4.5 -> 7.5
  });
  it("rounds the change half away from zero, and never shows -0", () => {
    const pct = (prev: number, last: number) =>
      calendarView(base({ months: [month("2026-07", [row("Hygiene", "Angel", prev, 0, 0, 0)]), month("2026-08", [row("Hygiene", "Angel", last, 0, 0, 0)])] })).cards!.last.changePct;
    expect(pct(1000, 876.5)).toBe(-12.4); // -12.35
    expect(pct(1000, 1123.5)).toBe(12.4); // +12.35
    expect(pct(1000, 999.99)).toBe(0); // a tiny fall, not -0
  });
  it("counts a brand listed under two businesses once", () => {
    const two: CalendarData = { months: [month("2026-07", [row("Toiletries", "Lux", 1, 0, 0, 0), row("Hygiene", "Lux", 0, 1, 0, 0), row("Hygiene", "Angel", 1, 0, 0, 0)])] };
    const c = calendarView(base(two)).cards!;
    expect(c.activeLast).toBe(2);
    expect(c.activeFy).toBe(2);
  });
});

describe("calendarView: Gantt", () => {
  it("orders groups by first appearance and merges raw names of one brand", () => {
    const g = calendarView(base(DATA)).gantt;
    expect(g.media).toEqual([...FY_MEDIA]);
    expect(g.groups.map((x) => x.name)).toEqual(["Toiletries", "Hygiene"]);
    expect(g.groups[0].brands.map((b) => b.name)).toEqual(["Savlon Handwash", "Lux"]);
    const savlon = g.groups[0].brands[0];
    expect(savlon.cells.slice(0, 4).map((c) => c!.media)).toEqual([[1, 0.5, 0, 0], [2, 1, 0, 0], [3, 0, 0, 0], [4, 1, 0, 1]]);
    expect(savlon.cells.slice(0, 4).map((c) => c!.total)).toEqual([1.5, 3, 3, 6]);
    expect(savlon.fytd).toBe(13.5);
  });
  it("gives null cells for months not uploaded", () => {
    const lux = calendarView(base(DATA)).gantt.groups[0].brands[1];
    expect(lux.cells.slice(4)).toEqual(NULL8);
  });
  it("starts and ends a lane run where the medium turns on and off", () => {
    const lux = calendarView(base(DATA)).gantt.groups[0].brands[1];
    const print = (i: number) => lux.cells[i]!.lanes.find((l) => l.medium === "Print")!;
    expect(lux.cells[0]!.lanes.map((l) => l.medium)).toEqual([...FY_MEDIA]);
    expect(print(0)).toEqual({ medium: "Print", on: true, start: true, end: true }); // first month; Aug off
    expect(print(1)).toEqual({ medium: "Print", on: false, start: false, end: false });
    expect(print(2)).toEqual({ medium: "Print", on: true, start: true, end: false }); // Oct on
    expect(print(3)).toEqual({ medium: "Print", on: true, start: false, end: true }); // Nov not uploaded
    const savlonTv = calendarView(base(DATA)).gantt.groups[0].brands[0].cells.slice(0, 4).map((c) => c!.lanes[0]);
    expect(savlonTv.map((l) => [l.start, l.end])).toEqual([[true, false], [false, false], [false, false], [false, true]]);
  });
  it("breaks a run at a month that is not uploaded", () => {
    const gap: CalendarData = { months: [month("2026-07", [row("Hygiene", "Angel", 1, 0, 0, 0)]), month("2026-09", [row("Hygiene", "Angel", 1, 0, 0, 0)])] };
    const cells = calendarView(base(gap)).gantt.groups[0].brands[0].cells;
    expect(cells[0]!.lanes[0]).toEqual({ medium: "TV", on: true, start: true, end: true });
    expect(cells[1]).toBeNull();
    expect(cells[2]!.lanes[0]).toEqual({ medium: "TV", on: true, start: true, end: true });
  });
  it("sums business rows and the Total row over the shown brands", () => {
    const g = calendarView(base(DATA)).gantt;
    expect(g.groups[0].months).toEqual([3.5, 3, 6, 7, ...NULL8]);
    expect(g.groups[0].fytd).toBe(19.5);
    expect(g.groups[1].months).toEqual([1, 2, 1.5, 1, ...NULL8]);
    expect(g.groups[1].fytd).toBe(5.5);
    expect(g.total).toEqual({ months: [4.5, 5, 7.5, 8, ...NULL8], fytd: 25 });
  });
  it("hides inactive brands unless asked; a brand missing from a month is 0 there", () => {
    expect(calendarView(base(DATA)).gantt.groups[1].brands.map((b) => b.name)).toEqual(["Angel", "TvOnly"]);
    const all = calendarView(base(DATA, {}, { inactive: true })).gantt.groups[1].brands;
    expect(all.map((b) => b.name)).toEqual(["Angel", "Ghost", "TvOnly"]);
    const ghost = all[1];
    expect(ghost.cells[0]).toEqual({ total: 0, media: [0, 0, 0, 0], lanes: FY_MEDIA.map((medium) => ({ medium, on: false, start: false, end: false })) });
    expect(ghost.fytd).toBe(0);
  });
  it("turning TV off changes totals, removes TV lanes and hides TV-only brands", () => {
    const g = calendarView(base(DATA, {}, { media: ["Digital", "Print", "OOH"] })).gantt;
    expect(g.media).toEqual(["Digital", "Print", "OOH"]);
    const savlon = g.groups[0].brands[0];
    expect(savlon.cells.slice(0, 4).map((c) => c!.total)).toEqual([0.5, 1, 0, 2]);
    expect(savlon.cells[0]!.media).toEqual([1, 0.5, 0, 0]); // the four values stay
    expect(g.groups.flatMap((x) => x.brands.flatMap((b) => b.cells.flatMap((c) => c?.lanes.map((l) => l.medium) ?? [])))).not.toContain("TV");
    expect(g.groups[1].brands.map((b) => b.name)).toEqual(["Angel"]);
    expect(g.total).toEqual({ months: [3.5, 3, 3, 3, ...NULL8], fytd: 12.5 });
    expect(calendarView(base(DATA, {}, { media: ["Digital", "Print", "OOH"], inactive: true })).gantt.groups[1].brands.map((b) => b.name)).toEqual(["Angel", "Ghost", "TvOnly"]);
  });
  it("drops a group with no brands left", () => {
    expect(calendarView(base(DATA, {}, { media: ["Print"] })).gantt.groups.map((x) => x.name)).toEqual(["Toiletries"]);
  });
  it("shows only the chosen business with inactive brands on, no other business leaking in", () => {
    const h = calendarView(base(DATA, { business: BIZ[0] }, { inactive: true })).gantt;
    expect(h.groups.map((x) => x.name)).toEqual(["Hygiene"]);
    expect(h.groups[0].brands.map((b) => b.name)).toEqual(["Angel", "Ghost", "TvOnly"]);
    const t = calendarView(base(DATA, { business: BIZ[1] }, { inactive: true })).gantt;
    expect(t.groups.map((x) => x.name)).toEqual(["Toiletries"]);
    expect(t.groups[0].brands.map((b) => b.name)).toEqual(["Savlon Handwash", "Lux"]);
  });
  it("normalises the media it is given: repeats dropped, FY_MEDIA order, empty means all four", () => {
    const all = calendarView(base(DATA)).gantt;
    expect(calendarView(base(DATA, {}, { media: [] })).gantt).toEqual(all);
    const rep = calendarView(base(DATA, {}, { media: ["OOH", "TV", "TV"] })).gantt;
    expect(rep.media).toEqual(["TV", "OOH"]);
    expect(rep.groups[0].brands[0].cells[0]!.lanes.map((l) => l.medium)).toEqual(["TV", "OOH"]);
    expect(rep.groups[0].brands[0].cells[3]!.total).toBe(5); // TV 4 + OOH 1, TV once
  });
});

describe("calendarView: Business filter, chart and empty", () => {
  it("narrows cards, Gantt and chart to the chosen business", () => {
    const v = calendarView(base(DATA, { business: BIZ[0] }));
    expect(v.cards!.fytd).toBe(5.5);
    expect(v.cards!.activeFy).toBe(2);
    expect(v.gantt.groups.map((x) => x.name)).toEqual(["Hygiene"]);
    expect(v.chart.map((c) => c.total)).toEqual([1, 2, 1.5, 1]);
    expect(v.empty).toBe(false);
    const t = calendarView(base(DATA, { business: BIZ[1] }));
    expect(t.gantt.groups[0].brands[0].fytd).toBe(13.5); // the "Toilet" row is in Toiletries
  });
  it("charts uploaded months only, with the four media and the total, ignoring the media toggles", () => {
    const v = calendarView(base(DATA, {}, { media: ["Print"] }));
    expect(v.chart).toEqual([
      { label: "Jul'26", v: [1, 0.5, 2, 1], total: 4.5 },
      { label: "Aug'26", v: [2, 1, 0, 2], total: 5 },
      { label: "Sep'26", v: [4.5, 0, 3, 0], total: 7.5 },
      { label: "Oct'26", v: [5, 1, 1, 1], total: 8 },
    ]);
  });
  it("is empty with no months, and when the chosen business has no rows", () => {
    const none = calendarView(base({ months: [] }));
    expect(none.empty).toBe(true);
    expect(none.cards).toBeNull();
    expect(none.uploaded.every((u) => !u)).toBe(true);
    expect(none.chart).toEqual([]);
    expect(none.gantt.groups).toEqual([]);
    expect(none.gantt.total).toEqual({ months: Array(12).fill(null), fytd: 0 });
    const foods = calendarView(base(DATA, { business: { slug: "foods", name: "Foods" } }));
    expect(foods.empty).toBe(true);
    expect(foods.gantt.groups).toEqual([]);
    expect(foods.cards!.fytd).toBe(0);
  });
});

describe("chartScale", () => {
  it("gives each column's height as a % of the biggest month total, and each medium's share of its column", () => {
    const s = chartScale(calendarView(base(DATA)).chart); // totals 4.5, 5, 7.5, 8
    expect(s.map((c) => c.height)).toEqual([56.25, 62.5, 93.75, 100]);
    expect(s[3].parts).toEqual([62.5, 12.5, 12.5, 12.5]);
    expect(s[0].parts).toEqual([22.222222, 11.111111, 44.444444, 22.222222]);
  });
  it("gives 0 heights and shares for a month with no spend, and when every month is 0", () => {
    const zero = [{ label: "Jul'26", v: [0, 0, 0, 0], total: 0 }];
    expect(chartScale(zero)).toEqual([{ height: 0, parts: [0, 0, 0, 0] }]);
    expect(chartScale([...zero, { label: "Aug'26", v: [2, 0, 0, 0], total: 2 }])).toEqual([{ height: 0, parts: [0, 0, 0, 0] }, { height: 100, parts: [100, 0, 0, 0] }]);
    expect(chartScale([])).toEqual([]);
  });
});

describe("calendarView: Sheet view", () => {
  const sheetOf = (s: string | null, over: Partial<CalendarInput> = {}, params: Partial<CalendarParams> = {}) => calendarView(base(DATA, over, { sheet: s, ...params })).sheet;
  it("lists every brand of a month, zero ones and ones missing that month too, with group totals and the grand total", () => {
    const s = sheetOf("2026-10");
    expect(s.groups).toEqual([
      { name: "Toiletries", brands: [{ name: "Savlon Handwash", v: [4, 1, 0, 1], t: 6 }, { name: "Lux", v: [0, 0, 1, 0], t: 1 }], total: { v: [4, 1, 1, 1], t: 7 } },
      { name: "Hygiene", brands: [{ name: "Angel", v: [1, 0, 0, 0], t: 1 }, { name: "Ghost", v: [0, 0, 0, 0], t: 0 }, { name: "TvOnly", v: [0, 0, 0, 0], t: 0 }], total: { v: [1, 0, 0, 0], t: 1 } },
    ]);
    expect(s.grand).toEqual({ v: [5, 1, 1, 1], t: 8 });
  });
  it("adds the raw names of one brand in a month", () => {
    const s = sheetOf("2026-08");
    expect(s.groups[0].brands[0]).toEqual({ name: "Savlon Handwash", v: [2, 1, 0, 0], t: 3 }); // "Savlon Handwash" + the "Toilet" row's "Savlon HW"
    expect(s.grand).toEqual({ v: [2, 1, 0, 2], t: 5 });
  });
  it("sums the uploaded months for FY to date", () => {
    const s = sheetOf("fytd");
    expect(s.groups.map((g) => g.brands.map((b) => [b.name, b.v, b.t]))).toEqual([
      [["Savlon Handwash", [10, 2.5, 0, 1], 13.5], ["Lux", [0, 0, 6, 0], 6]],
      [["Angel", [2, 0, 0, 3], 5], ["Ghost", [0, 0, 0, 0], 0], ["TvOnly", [0.5, 0, 0, 0], 0.5]],
    ]);
    expect(s.groups.map((g) => g.total)).toEqual([{ v: [10, 2.5, 6, 1], t: 19.5 }, { v: [2.5, 0, 0, 3], t: 5.5 }]);
    expect(s.grand).toEqual({ v: [12.5, 2.5, 6, 4], t: 25 });
  });
  it("sums exactly the uploaded months for FY to date when a month in between is missing", () => {
    const julSep: CalendarData = { months: DATA.months.filter((m) => m.m === "2026-07" || m.m === "2026-09") };
    const s = calendarView(base(julSep, {}, { sheet: "fytd" })).sheet;
    expect(s.title).toBe("FY 2026-27 to date (Jul'26 to Sep'26)");
    expect(s.groups.map((g) => g.brands.map((b) => [b.name, b.v, b.t]))).toEqual([
      [["Savlon Handwash", [4, 0.5, 0, 0], 4.5], ["Lux", [0, 0, 5, 0], 5]],
      [["Angel", [1, 0, 0, 1], 2], ["TvOnly", [0.5, 0, 0, 0], 0.5]],
    ]);
    expect(s.grand).toEqual({ v: [5.5, 0.5, 5, 1], t: 12 });
  });
  it("falls back to the latest month for a choice that is not uploaded", () => {
    expect(sheetOf("2027-01").choice).toBe("2026-10");
    expect(sheetOf("2027-01").grand).toEqual(sheetOf("2026-10").grand);
    expect(sheetOf(parseCalendarParams({ sheet: "junk" }).sheet).choice).toBe("2026-10");
  });
  it("follows the Business filter", () => {
    const s = sheetOf("2026-10", { business: BIZ[0] });
    expect(s.groups.map((g) => g.name)).toEqual(["Hygiene"]);
    expect(s.grand).toEqual({ v: [1, 0, 0, 0], t: 1 });
    expect(sheetOf("fytd", { business: BIZ[1] }).grand).toEqual({ v: [10, 2.5, 6, 1], t: 19.5 });
    expect(sheetOf("2026-10", { business: { slug: "foods", name: "Foods" } }).groups).toEqual([]);
    expect(sheetOf("2026-10", { business: { slug: "foods", name: "Foods" } }).grand).toEqual({ v: [0, 0, 0, 0], t: 0 });
  });
  it("ignores the media toggles and the inactive switch", () => {
    for (const s of ["2026-10", "fytd"]) {
      expect(sheetOf(s, {}, { media: ["Print"] })).toEqual(sheetOf(s));
      expect(sheetOf(s, {}, { inactive: true })).toEqual(sheetOf(s));
    }
  });
  it("has empty groups and a zero grand total with no months", () => {
    const s = calendarView(base({ months: [] })).sheet;
    expect(s.choice).toBe("fytd");
    expect(s.choices).toEqual([{ key: "fytd", label: "FY to date" }]);
    expect(s.groups).toEqual([]);
    expect(s.grand).toEqual({ v: [0, 0, 0, 0], t: 0 });
    expect(s.notes).toBeNull();
    expect(s.notesLabel).toBeNull();
  });
  it("gives the chosen month's notes and label, and none for FY to date", () => {
    const withNotes: CalendarData = { months: DATA.months.map((m) => (m.m === "2026-10"
      ? { ...m, notes: { tvCount: "Leona: 09 ; Twinkle Baby Diaper: 12", channels: "Asian TV, ATN Bangla\nTotal TV Channel: 2", digital: "Facebook, YouTube" } }
      : m)) };
    const oct = calendarView(base(withNotes)).sheet;
    expect(oct.notesLabel).toBe("Oct'26");
    expect(oct.notes).toEqual({ tvByBrand: [{ brand: "Leona", count: 9 }, { brand: "Twinkle Baby Diaper", count: 12 }], channels: ["Asian TV", "ATN Bangla"], digital: ["Facebook", "YouTube"] });
    const aug = calendarView(base(withNotes, {}, { sheet: "2026-08" })).sheet;
    expect(aug.notesLabel).toBe("Aug'26");
    expect(aug.notes).toEqual({ tvByBrand: [], channels: [], digital: [] });
    const fytd = calendarView(base(withNotes, {}, { sheet: "fytd" })).sheet;
    expect(fytd.notes).toBeNull();
    expect(fytd.notesLabel).toBeNull();
  });
});

describe("calendarHref", () => {
  it("leaves the defaults out, so the plain page is /calendar", () => {
    expect(calendarHref(PARAMS)).toBe("/calendar");
    expect(calendarHref(parseCalendarParams({ media: "TV,Digital,Print,OOH" }))).toBe("/calendar");
  });
  it("keeps every other parameter, media in FY_MEDIA order", () => {
    expect(calendarHref({ view: "sheet", media: ["OOH", "TV"], inactive: true, sheet: "2026-09" })).toBe("/calendar?view=sheet&media=TV,OOH&inactive=1&sheet=2026-09");
    expect(calendarHref({ ...PARAMS, sheet: "fytd" })).toBe("/calendar?sheet=fytd");
  });
  it("round-trips through parseCalendarParams", () => {
    const p: CalendarParams = { view: "sheet", media: ["Digital", "Print"], inactive: true, sheet: "fytd" };
    const sp = Object.fromEntries(new URLSearchParams(calendarHref(p).split("?")[1]));
    expect(parseCalendarParams(sp)).toEqual(p);
  });
});

describe("calendarQuery", () => {
  it("gives the address pairs calendarHref writes, defaults left out", () => {
    expect(calendarQuery(PARAMS)).toEqual([]);
    expect(calendarQuery({ view: "sheet", media: ["OOH", "TV"], inactive: true, sheet: "2026-09" })).toEqual([["view", "sheet"], ["media", "TV,OOH"], ["inactive", "1"], ["sheet", "2026-09"]]);
  });
  it("matches calendarHref, so a form built from it lands on the same page as the link", () => {
    for (const p of [PARAMS, { ...PARAMS, media: ["Print" as const], inactive: true }, { view: "sheet" as const, media: ["Digital" as const], inactive: false, sheet: "fytd" }]) {
      const q = calendarQuery(p);
      expect(q.length ? `/calendar?${q.map(([k, v]) => `${k}=${v}`).join("&")}` : "/calendar").toBe(calendarHref(p));
    }
  });
});

describe("toggleMedium", () => {
  it("switches one medium off or back on, in FY_MEDIA order", () => {
    expect(toggleMedium([...FY_MEDIA], "TV")).toEqual(["Digital", "Print", "OOH"]);
    expect(toggleMedium(["OOH"], "TV")).toEqual(["TV", "OOH"]);
  });
  it("never switches off the last one", () => {
    expect(toggleMedium(["Print"], "Print")).toBeNull();
  });
});

describe("card sub lines", () => {
  it("names the months so far", () => {
    expect(monthsNote(calendarView(base(DATA)).cards!)).toBe("4 months: Jul'26 to Oct'26");
    expect(monthsNote(calendarView(base({ months: [DATA.months[0]] })).cards!)).toBe("1 month: Jul'26");
  });
  it("gives the change with an arrow and 1 decimal, or Latest month", () => {
    const last = (changePct: number | null, prevLabel: string | null = "Sep'26") => ({ label: "Oct'26", total: 1, prevLabel, changePct });
    expect(changeNote(last(12.3))).toBe("▲ 12.3% vs Sep'26");
    expect(changeNote(last(-4))).toBe("▼ 4.0% vs Sep'26");
    expect(changeNote(last(0))).toBe("0.0% vs Sep'26");
    expect(changeNote(last(null))).toBe("Latest month");
    expect(changeNote(last(null, null))).toBe("Latest month");
  });
});

describe("cellTitle", () => {
  const v = calendarView(base(DATA));
  const savlon = v.gantt.groups[0].brands[0];
  it("names the brand and month, one line per active medium shown, then the total", () => {
    expect(cellTitle(savlon.name, "Oct'26", savlon.cells[3]!)).toBe("Savlon Handwash · Oct'26\nTV: 4.00 BDT Mn\nDigital: 1.00 BDT Mn\nOOH: 1.00 BDT Mn\nTotal: 6.00 BDT Mn");
  });
  it("lists only the media switched on", () => {
    const tv = calendarView(base(DATA, {}, { media: ["TV"] })).gantt.groups[0].brands[0];
    expect(cellTitle(tv.name, "Oct'26", tv.cells[3]!)).toBe("Savlon Handwash · Oct'26\nTV: 4.00 BDT Mn\nTotal: 4.00 BDT Mn");
  });
  it("says No activity for a cell with nothing on", () => {
    const lux = v.gantt.groups[0].brands[1];
    expect(cellTitle(lux.name, "Aug'26", lux.cells[1]!)).toBe("Lux · Aug'26\nNo activity");
  });
});

describe("cellMedia", () => {
  const v = calendarView(base(DATA));
  it("names the media on in a cell, for screen readers", () => {
    expect(cellMedia(v.gantt.groups[0].brands[0].cells[3]!)).toBe("TV, Digital, OOH");
    const tv = calendarView(base(DATA, {}, { media: ["TV"] })).gantt.groups[0].brands[0];
    expect(cellMedia(tv.cells[3]!)).toBe("TV");
  });
  it("says No activity when nothing is on", () => {
    expect(cellMedia(v.gantt.groups[0].brands[1].cells[1]!)).toBe("No activity");
  });
});

describe("columnText", () => {
  const chart = calendarView(base(DATA)).chart;
  it("reads a chart column for screen readers: the month, each medium above 0, then the total", () => {
    expect(columnText(chart[3])).toBe("Oct'26: TV 5.00, Digital 1.00, Print 1.00, OOH 1.00, total 8.00 BDT Mn");
    expect(columnText(chart[0])).toBe("Jul'26: TV 1.00, Digital 0.50, Print 2.00, OOH 1.00, total 4.50 BDT Mn");
  });
  it("leaves out the media at 0", () => {
    expect(columnText(chart[2])).toBe("Sep'26: TV 4.50, Print 3.00, total 7.50 BDT Mn");
    expect(columnText({ label: "Nov'26", v: [0, 0, 0, 0], total: 0 })).toBe("Nov'26: total 0.00 BDT Mn");
  });
});

describe("carriedParams", () => {
  const carried = (sheet: string | null) => carriedParams({ ...PARAMS, sheet }, calendarView(base(DATA, {}, { sheet }))).sheet;
  it("carries the resolved sheet choice, so an unknown month is not passed along", () => {
    expect(carried("2025-01")).toBe("2026-10");
    expect(carried("2026-09")).toBe("2026-09");
    expect(carried("fytd")).toBe("fytd");
  });
  it("leaves the sheet out when none was asked for, so the plain page stays /calendar", () => {
    expect(carried(null)).toBeNull();
  });
  it("keeps every other parameter", () => {
    const p: CalendarParams = { view: "sheet", media: ["TV"], inactive: true, sheet: "2025-01" };
    expect(carriedParams(p, calendarView(base(DATA, {}, p)))).toEqual({ ...p, sheet: "2026-10" });
  });
});

describe("parseNotes", () => {
  it("reads brand counts split on ';', using the last ':' of each part", () => {
    expect(parseNotes({ tvCount: "Leona: 09 ; Twinkle Baby Diaper: 12" }).tvByBrand).toEqual([{ brand: "Leona", count: 9 }, { brand: "Twinkle Baby Diaper", count: 12 }]);
    expect(parseNotes({ tvCount: "A: B: 7" }).tvByBrand).toEqual([{ brand: "A: B", count: 7 }]);
  });
  it("also splits on ',', as his July sheet mixes both", () => {
    // His July'26 cell: "Leona: 09 ; Freedom Sanitary Napkin : 19, Twinkle Baby Diaper: 12, ACI Electrolyte: "
    expect(parseNotes({ tvCount: "Leona: 09 ; Freedom Sanitary Napkin : 19, Twinkle Baby Diaper: 12, ACI Electrolyte: " }).tvByBrand).toEqual([
      { brand: "Leona", count: 9 }, { brand: "Freedom Sanitary Napkin", count: 19 }, { brand: "Twinkle Baby Diaper", count: 12 },
    ]);
  });
  it("skips parts without a number or without a brand", () => {
    expect(parseNotes({ tvCount: "Leona ; Savlon: n/a ; : 4 ; Septex: 06 ;" }).tvByBrand).toEqual([{ brand: "Septex", count: 6 }]);
  });
  it("takes the first line of channels, and trims and drops empties in both lists", () => {
    const n = parseNotes({ channels: " Asian TV ,, ATN News ,\nTotal TV Channel: 2", digital: "Facebook , ,YouTube," });
    expect(n.channels).toEqual(["Asian TV", "ATN News"]);
    expect(n.digital).toEqual(["Facebook", "YouTube"]);
  });
  it("gives empty lists for missing or empty fields", () => {
    expect(parseNotes({})).toEqual({ tvByBrand: [], channels: [], digital: [] });
    expect(parseNotes({ tvCount: "", channels: "", digital: " " })).toEqual({ tvByBrand: [], channels: [], digital: [] });
  });
});

describe.skipIf(!hasClientFiles)("calendarView with his real Activity Calendar file", () => {
  const data = hasClientFiles ? readCalendar(openWorkbook(new Uint8Array(clientFile("All_Activity_Calender_FY_26-27.xlsx")))).data : { months: [] };
  const identity = (): CalendarInput => ({
    data, fyStart: 2026, today: "2026-10",
    businessOf: (n) => ({ slug: normName(n), name: n }), brandOf: (n) => ({ name: n }),
    business: null, params: PARAMS,
  });
  it("Oct'26 chart total is 39.327 (PRD acceptance check)", () => {
    const oct = calendarView(identity()).chart.find((c) => c.label === "Oct'26")!;
    expect(formatSheet(oct.total)).toBe("39.327");
  });
  it("counts four uploaded months", () => {
    expect(calendarView(identity()).cards!.uploadedCount).toBe(4);
  });

  // Expected numbers come straight from his cells: every business "Total" row and the "Grand Total" row of each month sheet.
  // Checked on 23 Nov 2026: in all four sheets (Jul'26 to Oct'26) his own Total and Grand Total rows agree with the sum
  // of his brand rows at 3 decimals, so no disagreement needed recording; the page follows the rows either way.
  type Line = { v: number[]; t: number };
  const hisSheets = () => {
    const wb = openWorkbook(new Uint8Array(clientFile("All_Activity_Calender_FY_26-27.xlsx")));
    return wb.visibleSheets().map((ws) => {
      let hr = 0;
      for (let r = 1; r <= 8; r++) if (/^business$/i.test(xstr(ws.v(r, 1))) && /^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; break; }
      const col: Record<string, number> = {};
      for (let c = 3; c <= 12; c++) for (const r of [hr, hr + 1]) { const h = xstr(ws.v(r, c)).toLowerCase(); if (!col[h]) col[h] = c; }
      const cell = (r: number, k: string) => { const x = ws.v(r, col[k]); return typeof x === "number" ? x : 0; };
      const line = (r: number): Line => ({ v: ["tv", "digital", "print", "ooh"].map((k) => cell(r, k)), t: cell(r, "total") });
      const totals: { biz: string; line: Line }[] = [];
      let grand: Line | null = null;
      let biz = "";
      for (let r = hr + 2; r <= ws.maxRow; r++) {
        const a = xstr(ws.v(r, 1)), b = xstr(ws.v(r, 2));
        if (/^grand total$/i.test(a)) { grand = line(r); break; }
        if (a) biz = a;
        if (/^total$/i.test(b)) totals.push({ biz, line: line(r) });
      }
      return { m: data.months.find((x) => x.label === ws.name.trim())!.m, totals, grand: grand! };
    });
  };
  const text = (l: Line) => [...l.v, l.t].map(formatSheet);

  it("matches every business Total row and the Grand Total row of each month sheet", () => {
    const sheets = hisSheets();
    expect(sheets.map((s) => s.m)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    for (const his of sheets) {
      const s = calendarView({ ...identity(), params: { ...PARAMS, sheet: his.m } }).sheet;
      expect(s.choice).toBe(his.m);
      expect(his.totals).toHaveLength(4);
      expect(s.groups.map((g) => g.name), his.m).toEqual(his.totals.map((x) => x.biz));
      his.totals.forEach((x, i) => expect(text(s.groups[i].total), `${his.m} ${x.biz}`).toEqual(text(x.line)));
      expect(text(s.grand), `${his.m} Grand Total`).toEqual(text(his.grand));
    }
  });
  it("Oct'26 sheet Grand Total is 39.327 (PRD acceptance check)", () => {
    expect(formatSheet(calendarView({ ...identity(), params: { ...PARAMS, sheet: "2026-10" } }).sheet.grand.t)).toBe("39.327");
  });
  it("FY to date grand total is the sum of his four Grand Total rows", () => {
    const sheets = hisSheets();
    const his = { v: FY_MEDIA.map((_, n) => sheets.reduce((a, s) => a + s.grand.v[n], 0)), t: sheets.reduce((a, s) => a + s.grand.t, 0) };
    expect(text(calendarView({ ...identity(), params: { ...PARAMS, sheet: "fytd" } }).sheet.grand)).toEqual(text(his));
  });
  it("reads Oct'26 notes from the bottom of his sheet", () => {
    // His cell: "Leona: 14 ; Savlon All Brand : 25, Septex : 08, ACI Neem Original: 10 ; Twinkle Baby Dipaer: 09" (his spelling kept).
    const s = calendarView({ ...identity(), params: { ...PARAMS, sheet: "2026-10" } }).sheet;
    expect(s.notesLabel).toBe("Oct'26");
    expect(s.notes!.tvByBrand).toEqual([
      { brand: "Leona", count: 14 }, { brand: "Savlon All Brand", count: 25 }, { brand: "Septex", count: 8 },
      { brand: "ACI Neem Original", count: 10 }, { brand: "Twinkle Baby Dipaer", count: 9 },
    ]);
    // His list names 26 channels, while his own footnote line says "Total TV Channel: 25"; the page shows the list.
    expect(s.notes!.channels).toHaveLength(26);
    expect(s.notes!.channels[0]).toBe("Asian TV");
    expect(s.notes!.channels[25]).toBe("Somoy TV");
  });
});
