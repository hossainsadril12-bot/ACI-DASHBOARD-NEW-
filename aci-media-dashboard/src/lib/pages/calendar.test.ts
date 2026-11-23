import { describe, expect, it } from "vitest";
import { readCalendar, type CalendarData, type CalendarRow } from "@/lib/ingest/readers/calendar";
import { openWorkbook } from "@/lib/ingest/workbook";
import { clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { normName } from "@/lib/names-normal";
import { FY_MEDIA } from "@/lib/manual/rules";
import { calendarView, formatSheet, parseCalendarParams, type CalendarInput, type CalendarParams } from "./calendar";

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
});
