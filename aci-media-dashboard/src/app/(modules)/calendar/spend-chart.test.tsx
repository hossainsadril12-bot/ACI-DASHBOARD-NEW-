import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarData, CalendarRow } from "@/lib/ingest/readers/calendar";
import { calendarView, type CalendarParams } from "@/lib/pages/calendar";
import { SpendChart } from "./spend-chart";

// The chart only renders the builder's series; these check the markup contract.

const row = (biz: string, b: string, ...v: number[]): CalendarRow => ({ biz, b, v, t: v.reduce((a, x) => a + x, 0) });
const month = (m: string, rows: CalendarRow[]) => ({ m, label: m, rows, notes: {} });
// v = [TV, Digital, Print, OOH]; Jul and Sep uploaded, Aug not.
const DATA: CalendarData = {
  months: [
    month("2026-07", [row("Toiletries", "Savlon", 1, 0.5, 0, 0)]),
    month("2026-09", [row("Toiletries", "Savlon", 1234.5, 1, 1, 1), row("Hygiene", "Angel", 0, 0, 0.004, 0)]),
  ],
};
const PARAMS: CalendarParams = { view: "gantt", media: ["TV"], inactive: false, sheet: null };
const render = () => {
  const view = calendarView({ data: DATA, fyStart: 2026, today: "2026-10", params: PARAMS, business: null, businessOf: () => null, brandOf: () => null });
  return renderToStaticMarkup(<SpendChart chart={view.chart} />);
};
const columns = (html: string) => html.split('data-testid="chart-column"').slice(1);
const segments = (col: string) => [...col.matchAll(/<div data-medium="(\w+)" title="([^"]*)" class="([^"]*)" style="height:([^"]*)"/g)].map((m) => ({ medium: m[1], title: m[2], cls: m[3], height: m[4] }));

describe("SpendChart", () => {
  it("titles the card, with the unit as the sub line", () => {
    const html = render();
    expect(html).toContain('data-testid="calendar-chart"');
    expect(html).toContain("Month-on-month spend by media");
    expect(html).toContain(">BDT Mn<");
  });

  it("has one column per uploaded month, labelled below, in a 200px plot", () => {
    const html = render();
    const cols = columns(html);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toContain(">Jul&#x27;26<");
    expect(cols[1]).toContain(">Sep&#x27;26<");
    expect(cols[0].indexOf("Jul&#x27;26")).toBeGreaterThan(cols[0].indexOf("data-medium"));
    for (const c of cols) expect(c).toMatch(/\bh-\[200px\]/);
  });

  it("prints each column's total above it with 2 decimals", () => {
    const cols = columns(render());
    expect(cols[0]).toContain(">1.50<");
    expect(cols[1]).toContain(">1,237.50<");
    for (const c of cols) expect(c.indexOf('data-testid="chart-total"')).toBeLessThan(c.indexOf("data-medium"));
  });

  it("stacks the four media in their colours, sized to the biggest month, with a tooltip each, ignoring the Gantt toggles", () => {
    const [jul, sep] = columns(render()).map(segments);
    expect(sep.map((s) => s.medium)).toEqual(["TV", "Digital", "Print", "OOH"]);
    expect(sep[0].cls).toMatch(/\bbg-teal-600\b/);
    expect(sep[1].cls).toMatch(/\bbg-rose-600\b/);
    expect(sep[2].cls).toMatch(/\bbg-amber-500\b/);
    expect(sep[2].cls).toMatch(/\bring-amber-600\b/);
    expect(sep[3].cls).toMatch(/\bbg-sky-600\b/);
    expect(sep[0].title).toBe("TV: 1,234.50 BDT Mn");
    expect(sep[2].title).toBe("Print: 1.00 BDT Mn");
    // A medium with no spend that month draws no segment.
    expect(jul.map((s) => s.medium)).toEqual(["TV", "Digital"]);
    expect(jul[1].title).toBe("Digital: 0.50 BDT Mn");
    // Column heights are shares of the biggest month; segments are shares of their column.
    const html = render();
    expect(html).toMatch(/data-testid="chart-bar"[^>]*style="height:100%"/);
    expect(html).toMatch(/data-testid="chart-bar"[^>]*style="height:0\.121212%"/);
    expect(jul[0].height).toBe("66.666667%");
  });

  it("gives each column a screen-reader line with the media above 0 and the total", () => {
    const [jul, sep] = columns(render());
    expect(jul).toContain(`<span class="sr-only">Jul&#x27;26: TV 1.00, Digital 0.50, total 1.50 BDT Mn</span>`);
    expect(sep).toContain(`<span class="sr-only">Sep&#x27;26: TV 1,234.50, Digital 1.00, Print 1.00, OOH 1.00, total 1,237.50 BDT Mn</span>`);
  });

  it("scrolls inside its card on a phone", () => {
    const html = render();
    expect(html).toMatch(/overflow-x-auto/);
    expect(html).toMatch(/min-w-max/);
  });

  it("renders nothing with no uploaded month", () => {
    expect(renderToStaticMarkup(<SpendChart chart={[]} />)).toBe("");
  });
});
