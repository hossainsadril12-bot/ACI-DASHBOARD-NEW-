import { describe, expect, it } from "vitest";
import { readFy, type FyRow } from "@/lib/ingest/readers/fy";
import { openWorkbook } from "@/lib/ingest/workbook";
import { clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { fySpendView, formatMn, parseMedia, type FySpendInput } from "./fy-spend";

const z = (...v: number[]) => [...v, ...Array(12 - v.length).fill(0)];
const BIZ = [{ slug: "toiletries", name: "Toiletries" }, { slug: "hygiene", name: "Hygiene" }];
const base = (rows: FyRow[], over: Partial<FySpendInput> = {}): FySpendInput => ({
  rows, fyStart: 2026, businesses: BIZ,
  businessOf: (n) => BIZ.find((b) => b.name.toLowerCase() === n.toLowerCase()) ?? (n === "Toilet" ? BIZ[0] : null),
  brandOf: (n) => (n === "Savlon HW" ? { name: "Savlon Handwash" } : null),
  business: null, media: "All", ...over,
});
const ROWS: FyRow[] = [
  { biz: "Toiletries", b: "Savlon HW", med: "TV", m: z(1, 2, 0, 3), py: 10 },
  { biz: "Toilet", b: "Savlon HW", med: "Digital", m: z(0.5, 0, 0, 0.5), py: 0 },
  { biz: "Toiletries", b: "Lux", med: "Print", m: z(4), py: 0 },
  { biz: "Hygiene", b: "Angel", med: "OOH", m: z(0, 1), py: 2 },
  { biz: "Foods", b: "Pure Salt", med: "TV", m: z(0, 0, 2), py: 0 },
  { biz: "Hygiene", b: "Ghost", med: "TV", m: z(), py: 0 },
];

describe("parseMedia and formatMn", () => {
  it("accepts only the four media", () => {
    expect(parseMedia("TV")).toBe("TV");
    expect(parseMedia("tv")).toBe("All");
    expect(parseMedia(["TV"])).toBe("All");
    expect(parseMedia(undefined)).toBe("All");
  });
  it("formats BDT Mn with 2 decimals and no negative zero", () => {
    expect(formatMn(12.3456)).toBe("12.35 BDT Mn");
    expect(formatMn(1234.5)).toBe("1,234.50 BDT Mn");
    expect(formatMn(-0.001)).toBe("0.00 BDT Mn");
  });
});

describe("fySpendView", () => {
  it("labels the FY from fyStart and finds the reported months from all rows", () => {
    const v = fySpendView(base(ROWS));
    expect(v.fyLabel).toBe("2026-27");
    expect(v.lastFyLabel).toBe("2025-26");
    expect(v.monthLabels[0]).toBe("Jul'26");
    expect(v.monthLabels[11]).toBe("Jun'27");
    expect(v.reported).toBe(4);
    expect(v.lastReportedLabel).toBe("Oct'26");
  });

  it("groups by list business in list order, unknown businesses after, full brand names, media added together", () => {
    const v = fySpendView(base(ROWS));
    expect(v.groups.map((g) => g.name)).toEqual(["Toiletries", "Hygiene", "Foods"]);
    const t = v.groups[0];
    expect(t.lines.map((l) => l.name)).toEqual(["Savlon Handwash", "Lux"]); // 7 before 4: biggest first
    expect(t.lines[0].m.slice(0, 5)).toEqual([1.5, 2, 0, 3.5, null]);
    expect(t.lines[0].fytd).toBe(7);
    expect(t.lines[0].py).toBe(10);
    expect(t.lines[0].pct).toBe(70);
    expect(t.lines[1].pct).toBeNull();
    expect(t.total.name).toBe("Toiletries total");
    expect(t.total.fytd).toBe(11);
  });

  it("leaves out brands with no spend and no last year", () => {
    const v = fySpendView(base(ROWS));
    expect(v.groups[1].lines.map((l) => l.name)).toEqual(["Angel"]);
  });

  it("keeps future months empty in every line, totals included", () => {
    const v = fySpendView(base(ROWS));
    for (const line of [...v.groups.flatMap((g) => [...g.lines, g.total]), v.grandTotal]) {
      expect(line.m.slice(4).every((x) => x === null)).toBe(true);
    }
    expect(v.grandTotal.m.slice(0, 4)).toEqual([5.5, 3, 2, 3.5]);
    expect(v.grandTotal.fytd).toBe(14);
    expect(v.grandTotal.py).toBe(12);
  });

  it("filters the table by medium; the cards ignore the medium", () => {
    const v = fySpendView(base(ROWS, { media: "TV" }));
    expect(v.groups.map((g) => g.name)).toEqual(["Toiletries", "Foods"]);
    expect(v.groups[0].lines[0].fytd).toBe(6);
    expect(v.cards.map((c) => [c.medium, c.fytd, c.py])).toEqual([["TV", 8, 10], ["Digital", 1, 0], ["Print", 4, 0], ["OOH", 1, 2]]);
  });

  it("filters cards and table by the chosen business", () => {
    const v = fySpendView(base(ROWS, { business: { slug: "hygiene", name: "Hygiene" } }));
    expect(v.groups.map((g) => g.name)).toEqual(["Hygiene"]);
    expect(v.cards.find((c) => c.medium === "TV")!.fytd).toBe(0);
    expect(v.cards.find((c) => c.medium === "OOH")!.fytd).toBe(1);
    expect(v.reported).toBe(4); // still from all rows
  });

  it("reports empty when nothing matches, and handles no rows at all", () => {
    expect(fySpendView(base(ROWS, { business: { slug: "hygiene", name: "Hygiene" }, media: "Print" })).empty).toBe(true);
    const none = fySpendView(base([]));
    expect(none.empty).toBe(true);
    expect(none.reported).toBe(0);
    expect(none.lastReportedLabel).toBeNull();
    expect(none.maxCell).toBe(0);
  });

  it("finds the biggest brand month cell on screen for the tint", () => {
    expect(fySpendView(base(ROWS)).maxCell).toBe(4);
    expect(fySpendView(base(ROWS, { media: "TV" })).maxCell).toBe(3);
  });
});

const FILE = "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx";
describe.skipIf(!hasClientFiles)("fySpendView with his real FY file", () => {
  it("matches the Grand Total row of his Final Report sheet, month by month", () => {
    const wb = openWorkbook(new Uint8Array(clientFile(FILE)));
    const rows = readFy(wb).data;
    const v = fySpendView({ rows, fyStart: 2026, businesses: [], businessOf: () => null, brandOf: () => null, business: null, media: "All" });
    const sheet = wb.sheet(wb.sheets.findIndex((s) => /final report/i.test(s.name) && s.visible))!;
    let gt = 0;
    for (let r = 1; r <= sheet.maxRow; r++) if (/^grand total$/i.test(String(sheet.v(r, 1) ?? "").trim())) { gt = r; break; }
    expect(gt).toBeGreaterThan(0);
    for (let i = 0; i < v.reported; i++) {
      const cell = sheet.v(gt, 3 + i);
      expect(v.grandTotal.m[i]).toBeCloseTo(typeof cell === "number" ? cell : 0, 2);
    }
    const tv = rows.filter((r) => r.med === "TV").reduce((t, r) => t + r.m.reduce((a, c) => a + c, 0), 0);
    expect(v.cards[0].fytd).toBeCloseTo(tv, 4);
  });
});
