import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarData, CalendarRow } from "@/lib/ingest/readers/calendar";
import { FY_MEDIA } from "@/lib/manual/rules";
import { calendarView, type CalendarParams } from "@/lib/pages/calendar";
import { Gantt } from "./gantt";

// The Gantt only renders the builder's view; these check the markup contract the page and e2e rely on.

const row = (biz: string, b: string, ...v: number[]): CalendarRow => ({ biz, b, v, t: v.reduce((a, x) => a + x, 0) });
const month = (m: string, rows: CalendarRow[]) => ({ m, label: m, rows, notes: {} });
const BIZ = [{ slug: "hygiene", name: "Hygiene" }, { slug: "toiletries", name: "Toiletries" }];
// v = [TV, Digital, Print, OOH]; Jul to Sep uploaded, Oct (today) uploaded, Aug has a TV gap for Angel.
const DATA: CalendarData = {
  months: [
    month("2026-07", [row("Toiletries", "Savlon", 1, 0.5, 0, 0), row("Hygiene", "Angel", 1, 0, 0, 1)]),
    month("2026-08", [row("Toiletries", "Savlon", 2, 0, 0, 0), row("Hygiene", "Angel", 0, 0, 0, 2), row("Hygiene", "Ghost", 0, 0, 0, 0)]),
    month("2026-09", [row("Toiletries", "Savlon", 3, 0, 0, 0), row("Hygiene", "Angel", 1, 0, 0, 0)]),
    month("2026-10", [row("Toiletries", "Savlon", 1234.5, 0, 0, 0), row("Hygiene", "Angel", 1, 0, 0, 0)]),
  ],
};
const PARAMS: CalendarParams = { view: "gantt", media: [...FY_MEDIA], inactive: false, sheet: null };
const render = (params: Partial<CalendarParams> = {}) => {
  const p = { ...PARAMS, ...params };
  const view = calendarView({
    data: DATA, fyStart: 2026, today: "2026-10", params: p, business: null,
    businessOf: (n) => BIZ.find((b) => b.name === n) ?? null,
    brandOf: () => null,
  });
  return renderToStaticMarkup(<Gantt view={view} params={p} />);
};
/** The markup of one row, found by its testid and the text of its first cell. */
const rowOf = (html: string, testId: string, name: string) =>
  html.split("<tr").find((r) => r.includes(`data-testid="${testId}"`) && r.includes(`>${name}<`)) ?? "";
/** One cell of a row, by its month. */
const cellOf = (rowHtml: string, m: string) => rowHtml.split("<td").find((c) => c.includes(`data-month="${m}"`)) ?? "";
const lanes = (cell: string) => [...cell.matchAll(/data-medium="(\w+)" data-on="(true|false)" class="([^"]*)"/g)].map((x) => ({ medium: x[1], on: x[2] === "true", cls: x[3] }));

describe("Gantt", () => {
  it("titles the card with the FY, has brand rows and one Total row", () => {
    const html = render();
    expect(html).toContain('data-testid="calendar-gantt"');
    expect(html).toContain("Activity Gantt · FY 2026-27");
    expect(html).toContain("Each coloured lane is a medium; a continuous bar means the brand stayed on air month after month. Number = month spend (BDT Mn) for the media shown.");
    expect(html.match(/data-testid="gantt-brand-row"/g)).toHaveLength(2); // Ghost is inactive
    expect(html.match(/data-testid="gantt-total-row"/g)).toHaveLength(1);
    expect(html).toContain(">Brand<");
    expect(html).toContain(">FYTD<");
  });

  it("joins consecutive on months into one bar, rounded only at the run's start and end", () => {
    const savlon = rowOf(render(), "gantt-brand-row", "Savlon");
    const tv = ["2026-07", "2026-08", "2026-09", "2026-10"].map((m) => lanes(cellOf(savlon, m)).find((l) => l.medium === "TV")!);
    expect(tv.every((l) => l.on)).toBe(true);
    expect(tv[0].cls).toMatch(/\brounded-l-full\b/);
    expect(tv[0].cls).not.toMatch(/\brounded-r-full\b/);
    for (const mid of [tv[1], tv[2]]) expect(mid.cls).not.toMatch(/rounded/);
    expect(tv[3].cls).toMatch(/\brounded-r-full\b/);
    for (const l of tv) expect(l.cls).toMatch(/\bw-full\b/);
    for (const l of tv) expect(l.cls).not.toMatch(/\b(m|mx|ml|mr|px|pl|pr)-/);
    // The brand cell has no side padding, so lanes of neighbouring cells meet.
    expect(cellOf(savlon, "2026-08").split(">")[0]).toMatch(/\bpx-0\b|\bp-0\b/);
    // A one-month Digital run is rounded at both ends.
    const dig = lanes(cellOf(savlon, "2026-07")).find((l) => l.medium === "Digital")!;
    expect(dig.on).toBe(true);
    expect(dig.cls).toMatch(/rounded-full/);
    expect(lanes(cellOf(savlon, "2026-08")).find((l) => l.medium === "Digital")!.on).toBe(false);
  });

  it("gives one lane per medium shown, in FY_MEDIA order, and drops a medium switched off", () => {
    const all = rowOf(render(), "gantt-brand-row", "Savlon");
    expect(lanes(cellOf(all, "2026-07")).map((l) => l.medium)).toEqual(["TV", "Digital", "Print", "OOH"]);
    const noTv = rowOf(render({ media: ["Digital", "Print", "OOH"] }), "gantt-brand-row", "Savlon");
    expect(lanes(cellOf(noTv, "2026-07")).map((l) => l.medium)).toEqual(["Digital", "Print", "OOH"]);
  });

  it("hatches months not uploaded, with no number and no lanes", () => {
    const html = render();
    const nov = cellOf(rowOf(html, "gantt-brand-row", "Savlon"), "2026-11");
    expect(nov).toContain('data-uploaded="false"');
    expect(nov).toContain("repeating-linear-gradient");
    expect(lanes(nov)).toEqual([]);
    expect(nov).not.toMatch(/\d\.\d\d/);
    expect(cellOf(rowOf(html, "gantt-brand-row", "Savlon"), "2026-10")).not.toContain("repeating-linear-gradient");
  });

  it("outlines the current month's header and cells", () => {
    const html = render();
    const current = html.split(/<t[hd]/).filter((c) => c.includes('data-month="2026-10"'));
    expect(current.length).toBe(1 + 2 + 2 + 1); // header, 2 business rows, 2 brand rows, Total
    for (const c of current) expect(c).toContain('data-current="true"');
    expect(html.split(/<t[hd]/).filter((c) => c.includes('data-current="true"'))).toHaveLength(current.length);
  });

  it("shows brand numbers with 2 decimals and grouping, blank when 0; business rows with – for 0", () => {
    const html = render({ media: ["TV"] });
    const savlon = rowOf(html, "gantt-brand-row", "Savlon");
    expect(cellOf(savlon, "2026-10")).toContain(">1,234.50<");
    const angel = rowOf(html, "gantt-brand-row", "Angel");
    expect(cellOf(angel, "2026-08")).not.toMatch(/\d\.\d\d|–/); // TV 0 in Aug: blank
    const hygiene = rowOf(html, "gantt-business-row", "Hygiene");
    expect(cellOf(hygiene, "2026-08")).toContain(">–<");
    expect(cellOf(hygiene, "2026-07")).toContain(">1.00<");
    const total = html.split("<tr").find((r) => r.includes('data-testid="gantt-total-row"'))!;
    expect(cellOf(total, "2026-10")).toContain(">1,235.50<");
    expect(total).toContain(">Total<");
  });

  it("gives each uploaded brand cell a title tooltip", () => {
    const savlon = rowOf(render(), "gantt-brand-row", "Savlon");
    expect(cellOf(savlon, "2026-07")).toContain('title="Savlon · Jul&#x27;26\nTV: 1.00 BDT Mn\nDigital: 0.50 BDT Mn\nTotal: 1.50 BDT Mn"');
    const angelTv = rowOf(render({ media: ["TV"] }), "gantt-brand-row", "Angel");
    expect(cellOf(angelTv, "2026-08")).toContain('title="Angel · Aug&#x27;26\nNo activity"');
  });

  it("offers media toggle links that keep the other parameters, and never turns off the last medium", () => {
    const html = render({ inactive: true });
    const tv = html.match(/<a[^>]*data-toggle="TV"[^>]*>/)![0];
    expect(tv).toContain('aria-pressed="true"');
    expect(tv).toContain('href="/calendar?media=Digital,Print,OOH&amp;inactive=1"');
    expect(tv).toMatch(/\bh-10\b/);
    const one = render({ media: ["Print"] });
    const print = one.match(/<[a-z]+[^>]*data-toggle="Print"[^>]*>/)![0];
    expect(print).not.toContain("href=");
    expect(print).toContain('aria-disabled="true"');
    expect(print).toContain('aria-pressed="true"');
    const ooh = one.match(/<a[^>]*data-toggle="OOH"[^>]*>/)![0];
    expect(ooh).toContain('aria-pressed="false"');
    expect(ooh).toContain('href="/calendar?media=Print,OOH"');
  });

  it("has a Show inactive brands switch that shows inactive brands", () => {
    const off = render();
    const sw = off.match(/<a[^>]*role="switch"[^>]*>/)![0];
    expect(sw).toContain('aria-checked="false"');
    expect(sw).toContain('href="/calendar?inactive=1"');
    expect(sw).toMatch(/\bh-10\b/);
    expect(off).toContain("Show inactive brands");
    const on = render({ inactive: true });
    expect(on.match(/<a[^>]*role="switch"[^>]*>/)![0]).toContain('aria-checked="true"');
    expect(on.match(/<a[^>]*role="switch"[^>]*>/)![0]).toContain('href="/calendar"');
    expect(on.match(/data-testid="gantt-brand-row"/g)).toHaveLength(3);
  });

  it("has a legend of the media shown and the hatching", () => {
    const html = render({ media: ["TV", "OOH"] });
    const legend = html.slice(html.indexOf('data-testid="gantt-legend"'));
    expect(legend).toContain(">TV<");
    expect(legend).toContain(">OOH<");
    expect(legend).not.toContain(">Digital<");
    expect(legend).toContain("Not yet uploaded");
  });
});
