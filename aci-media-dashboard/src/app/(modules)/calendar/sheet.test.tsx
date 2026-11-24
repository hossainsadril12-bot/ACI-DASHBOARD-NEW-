import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarData, CalendarRow } from "@/lib/ingest/readers/calendar";
import { FY_MEDIA } from "@/lib/manual/rules";
import { calendarView, type CalendarParams } from "@/lib/pages/calendar";
import { Sheet } from "./sheet";

// The Sheet view only renders the builder's view; these check the markup contract the page and e2e rely on.

const row = (biz: string, b: string, ...v: number[]): CalendarRow => ({ biz, b, v, t: v.reduce((a, x) => a + x, 0) });
const month = (m: string, rows: CalendarRow[], notes: CalendarData["months"][number]["notes"] = {}) => ({ m, label: m, rows, notes });
const BIZ = [{ slug: "hygiene", name: "Hygiene" }, { slug: "toiletries", name: "Toiletries" }];
// v = [TV, Digital, Print, OOH]
const DATA: CalendarData = {
  months: [
    month("2026-09", [row("Toiletries", "Savlon", 3, 0, 0, 0), row("Toiletries", "Lux", 0, 0, 0.125, 0), row("Hygiene", "Angel", 1, 0, 0, 0)], { digital: "Facebook" }),
    month("2026-10", [row("Toiletries", "Savlon", 1234.5678, 1.5, 0, 0), row("Toiletries", "Lux", 0, 0, 0, 0), row("Hygiene", "Angel", 39.327, 0, 0, 0)], {
      tvCount: "Leona: 09 ; Twinkle Baby Diaper: 1",
      channels: "Channel i, NTV , ATN Bangla\nnot a channel",
      digital: "Facebook, <b>YouTube</b>",
    }),
  ],
};
const PARAMS: CalendarParams = { view: "sheet", media: [...FY_MEDIA], inactive: false, sheet: null };
const render = (params: Partial<CalendarParams> = {}) => {
  const p = { ...PARAMS, ...params };
  const view = calendarView({
    data: DATA, fyStart: 2026, today: "2026-10", params: p, business: null,
    businessOf: (n) => BIZ.find((b) => b.name === n) ?? null,
    brandOf: () => null,
  });
  return renderToStaticMarkup(<Sheet view={view} params={p} />);
};
const rows = (html: string, testId: string) => html.split("<tr").filter((r) => r.includes(`data-testid="${testId}"`));
const cells = (rowHtml: string) => rowHtml.split("<td").slice(1).map((c) => c.slice(c.indexOf(">") + 1, c.indexOf("</td>")));

describe("Sheet", () => {
  it("titles the card with the chosen month and has the sub line", () => {
    const html = render();
    expect(html).toContain('data-testid="calendar-sheet"');
    expect(html).toContain("CB Media Activity &amp; Spending Amount (Mn) · October 2026");
    expect(html).toContain("Same layout as the Excel sheet · blank = no activity");
    expect(render({ sheet: "fytd" })).toContain("CB Media Activity &amp; Spending Amount (Mn) · FY 2026-27 to date (Sep&#x27;26 to Oct&#x27;26)");
  });

  it("offers each uploaded month and FY to date as 40px links that keep the view", () => {
    const html = render({ inactive: true });
    const nav = html.slice(html.indexOf('aria-label="Sheet month"'));
    const links = [...nav.split("</nav>")[0].matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["/calendar?view=sheet&amp;inactive=1&amp;sheet=2026-09", "Sep&#x27;26"],
      ["/calendar?view=sheet&amp;inactive=1&amp;sheet=2026-10", "Oct&#x27;26"],
      ["/calendar?view=sheet&amp;inactive=1&amp;sheet=fytd", "FY to date"],
    ]);
    expect(nav).toMatch(/aria-current="page"[^>]*>Oct&#x27;26</);
    // The month choice scrolls on its own and has 40px targets.
    const wrap = html.slice(0, html.indexOf('aria-label="Sheet month"')).split("<div").pop()!;
    expect(wrap).toMatch(/overflow-x-auto/);
    expect(wrap).toMatch(/\[&amp;_a\]:h-10/);
  });

  it("has a green header row with the columns and a colour square per medium", () => {
    const html = render();
    const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(head).toMatch(/<tr[^>]*bg-emerald-700/);
    const labels = [...head.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
    expect(labels).toEqual(["Business", "Brand", "TV", "Digital", "Print", "OOH", "Total"]);
    for (const m of ["bg-teal-600", "bg-rose-600", "bg-amber-500", "bg-emerald-600"]) expect(head).toContain(m);
  });

  it("names the business once, on its first brand row, and lists every brand, zero ones too", () => {
    const html = render();
    const brands = rows(html, "sheet-brand-row").map(cells);
    expect(brands.map((c) => [c[0], c[1]])).toEqual([["Toiletries", "Savlon"], ["", "Lux"], ["Hygiene", "Angel"]]);
    expect(html.match(/>Toiletries</g)).toHaveLength(1);
  });

  it("shows numbers with 2 to 3 decimals and blank cells for 0", () => {
    const [savlon, lux] = rows(render(), "sheet-brand-row").map(cells);
    expect(savlon.slice(2)).toEqual(["1,234.568", "1.50", "", "", "1,236.068"]);
    expect(lux.slice(2)).toEqual(["", "", "", "", ""]);
  });

  it("ends each business with an amber Total row and the sheet with a green Grand Total", () => {
    const html = render();
    const totals = rows(html, "sheet-total-row");
    expect(totals).toHaveLength(2);
    for (const t of totals) expect(t).toMatch(/bg-amber-/);
    expect(cells(totals[1])).toEqual(["Total", "39.327", "", "", "", "39.327"]);
    const grand = rows(html, "sheet-grand-total");
    expect(grand).toHaveLength(1);
    expect(grand[0]).toMatch(/bg-emerald-/);
    expect(cells(grand[0])).toEqual(["Grand Total", "1,273.895", "1.50", "", "", "1,275.395"]);
  });

  it("shows the month's notes as chips, with the all-businesses sub line", () => {
    const html = render();
    const notes = html.slice(html.indexOf('data-testid="calendar-notes"'));
    expect(notes).toContain("Oct&#x27;26 media notes");
    expect(notes).toContain("From the bottom of the month&#x27;s sheet · all businesses");
    expect(notes).toContain(">TV channels used by brand<");
    expect(notes).toContain(">Leona · 9 channels<");
    expect(notes).toContain(">Twinkle Baby Diaper · 1 channel<");
    expect(notes).toContain(">TV channels on air (3)<");
    for (const c of ["Channel i", "NTV", "ATN Bangla"]) expect(notes).toContain(`>${c}<`);
    expect(notes).not.toContain("not a channel");
    expect(notes).toContain(">Digital platforms<");
    // Notes text from his file is plain text, never markup.
    expect(notes).toContain(">&lt;b&gt;YouTube&lt;/b&gt;<");
    expect(notes).not.toContain("<b>");
  });

  it("shows only the note groups that have entries", () => {
    const sep = render({ sheet: "2026-09" });
    expect(sep).toContain("Sep&#x27;26 media notes");
    expect(sep).toContain(">Digital platforms<");
    expect(sep).not.toContain("TV channels used by brand");
    expect(sep).not.toContain("TV channels on air");
  });

  it("has no notes card for FY to date", () => {
    expect(render({ sheet: "fytd" })).not.toContain('data-testid="calendar-notes"');
  });
});
