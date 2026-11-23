import { describe, expect, it } from "vitest";
import { readFy, type FyRow } from "./fy";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("FY spend: the real file", () => {
  it("equals his built-in data and reads the visible Final Report sheet only", () => {
    const r = readFy(open(clientFile("CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx")));
    // His built-in key came from source/scripts/extract.py (lines 46-60), which keeps all-zero rows;
    // his live reader drops them (template.html line 614). So compare with the key filtered by his rule.
    const full = answerKey<{ fy: FyRow[] }>("data.json").fy;
    const key = full.filter((x) => x.m.some((v) => v) || x.py);
    expect(r.data).toHaveLength(key.length);
    r.data.forEach((row, i) => {
      const k = key[i]!;
      expect({ biz: row.biz, b: row.b, med: row.med }).toEqual({ biz: k.biz, b: k.b, med: k.med });
      expect(row.m).toHaveLength(k.m.length);
      row.m.forEach((v, j) => expect(v).toBeCloseTo(k.m[j]!, 4));
      expect(row.py).toBeCloseTo(k.py, 4);
    });
    const dropped = full.filter((x) => !(x.m.some((v) => v) || x.py));
    expect(full.length - r.data.length).toBe(59);
    expect(dropped).toHaveLength(59);
    expect(dropped.every((x) => x.py === 0 && x.m.every((v) => v === 0))).toBe(true);
    expect(r.datasetKey).toBe("fy");
    expect(r.label).toBe("FY spend, FY 2026-27");
  });
});
describe("FY spend read errors", () => {
  it("needs the header row", () => {
    expect(() => readFy(open(makeXlsx([{ name: "2026-27 Final Report", rows: [["title"], ["nothing"]] }])))).toThrow(/header row/);
  });
  it("warns when the business summary table is missing", () => {
    const row = ["Savlon Soap", "TV", 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 5];
    const r = readFy(open(makeXlsx([{ name: "2026-27 Final Report", rows: [["t"], ["Brand", "Media", "July'26"], row, ["Total"], ["Grand Total"]] }])));
    expect(r.warnings).toContain("Business summary table not found; used the standard business order");
  });
});
