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

  it("adds an Other card for media outside the four, so the cards add up to the Grand total", () => {
    const rows: FyRow[] = [...ROWS, { biz: "Toiletries", b: "Lux", med: "Radio", m: z(2, 1), py: 3 }];
    const v = fySpendView(base(rows));
    expect(v.cards.map((c) => c.medium)).toEqual(["TV", "Digital", "Print", "OOH", "Other"]);
    expect(v.cards[4]).toEqual({ medium: "Other", fytd: 3, py: 3 });
    expect(Math.round(v.cards.reduce((t, c) => t + c.fytd, 0) * 100) / 100).toBe(v.grandTotal.fytd);
    expect(fySpendView(base(rows, { media: "TV" })).groups.flatMap((g) => g.lines).some((l) => l.name === "Lux")).toBe(false);
    expect(fySpendView(base(rows, { business: { slug: "hygiene", name: "Hygiene" } })).cards.map((c) => c.medium)).toHaveLength(4);
    expect(fySpendView(base(ROWS)).cards).toHaveLength(4);
  });

  it("merges unknown business and brand names that differ only by case or spaces", () => {
    const rows: FyRow[] = [
      { biz: "Others", b: "Lux", med: "TV", m: z(1), py: 0 },
      { biz: "others ", b: "LUX", med: "TV", m: z(2), py: 0 },
      { biz: "Others", b: "Zed  Co", med: "TV", m: z(1), py: 0 },
      { biz: "Others", b: "zed co", med: "TV", m: z(1), py: 0 },
    ];
    const v = fySpendView(base(rows));
    expect(v.groups.map((g) => g.name)).toEqual(["Others"]);
    expect(v.groups[0].lines.map((l) => [l.name, l.fytd])).toEqual([["Lux", 3], ["Zed  Co", 2]]);
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
    // The reader keeps 6 decimals per row, so each reported month matches his Grand Total cell as 2-decimal text.
    const t2 = (n: number) => n.toFixed(2);
    const num = (c: number) => { const x = sheet.v(gt, c); return typeof x === "number" ? x : 0; };
    expect(v.reported).toBe(4);
    expect(v.lastReportedLabel).toBe("Oct'26");
    for (let i = 0; i < v.reported; i++) expect(t2(v.grandTotal.m[i]!)).toBe(t2(num(3 + i)));
    for (let c = 3 + v.reported; c <= 14; c++) expect(num(c)).toBe(0); // months 5 to 12 are empty in his file
    // Header row 3: column 15 is "Total 2026-27" (FY to date), column 16 is "Total 2025-26" (last FY), as the reader takes py from column 16.
    expect(t2(v.grandTotal.fytd)).toBe(t2(num(15)));
    expect(t2(v.grandTotal.py)).toBe(t2(num(16)));
    // His Business x Media summary table (rows 121-128) says Press 4.13 Mn; his own Press rows and Grand Total row add to 3.43 Mn. The page follows the rows (tracker: client data check).
    v.cards.forEach((c) => {
      const mine = rows.filter((r) => r.med === c.medium);
      expect(t2(c.fytd)).toBe(t2(mine.reduce((t, r) => t + r.m.reduce((a, x) => a + x, 0), 0)));
      expect(t2(c.py)).toBe(t2(mine.reduce((t, r) => t + r.py, 0)));
    });
  });
});
