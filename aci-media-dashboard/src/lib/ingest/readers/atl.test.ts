import { describe, expect, it } from "vitest";
import { readAtl, type AtlCategory } from "./atl";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFiles, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("ATL: all 13 real files match his built-in data", () => {
  const key = hasClientFiles ? answerKey<{ cats: Record<string, AtlCategory & { src?: unknown }> }>("atl.json") : { cats: {} };
  const files = hasClientFiles ? clientFiles().filter((f) => f.rel.startsWith("atl/")) : [];
  it("has 13 files and 13 categories", () => {
    expect(files).toHaveLength(13);
    expect(Object.keys(key.cats)).toHaveLength(13);
  });
  it.each(files.map((f) => [f.rel, f.bytes] as const))("%s", (_rel, bytes) => {
    const r = readAtl(open(bytes));
    const catKey = r.datasetKey.replace(/^atl:/, "");
    const want = { ...key.cats[catKey] };
    delete want.src;
    expect(r.data).toEqual(want);
    expect(r.type).toBe("atl");
    expect(r.label).toMatch(new RegExp(`^ATL, ${want.name}, \\w{3}'\\d{2} to \\w{3}'\\d{2}$`));
    for (const [m, rows] of Object.entries(r.data.months)) {
      expect(rows.reduce((t, x) => t + x.sov, 0), `SOV ${m}`).toBeCloseTo(1, 2);
      if (rows.some((x) => x.sp > 0)) expect(rows.reduce((t, x) => t + x.soe, 0), `SOE ${m}`).toBeCloseTo(1, 2);
    }
  });
  it("Savlon Soap reads as Jul'25 to Oct'26", () => {
    const f = files.find((x) => x.rel.includes("Savlon_Soap"))!;
    expect(readAtl(open(f.bytes)).label).toBe("ATL, Savlon Soap, Jul'25 to Oct'26");
  });
});

describe("ATL read errors and warnings", () => {
  it("needs the Brand Name line", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Client : ACI"], ["Brand Name"]] }])))).toThrow(
      new ReadError('Couldn\'t find the "Brand Name:" line at the top of sheet "GRP".'),
    );
  });
  it("needs a known category", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }])))).toThrow(/doesn't match any ATL category/);
  });
  it("needs the header row", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Brand Name: ACI Savlon Soap"]] }])))).toThrow(/header row/i);
  });
  it("warns about a month out of sequence and reads it as the next month", () => {
    const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
    const b = makeXlsx([{ name: "GRP", rows: [
      ["Brand Name: ACI Savlon Soap"],
      ["Brand Name", d(2026, 5), null, d(2025, 6)],
      [null, "GRP", "Spend", "GRP", "Spend"],
      ["Savlon Soap", 10, 1000, 20, 2000],
      ["Lux", 30, 3000, 40, 4000],
    ] }]);
    const r = readAtl(open(b));
    expect(Object.keys(r.data.months)).toEqual(["2026-05", "2026-06"]);
    expect(r.warnings).toContain("A month header reads Jun'25 but sits after May'26; read as Jun'26.");
  });
  it("warns about impossible values", () => {
    const b = makeXlsx([{ name: "GRP", rows: [
      ["Brand Name: ACI Savlon Soap"],
      ["Brand Name", new Date(Date.UTC(2026, 7, 1))],
      [null, "GRP", "Spend", "1+ Reach"],
      ["Savlon Soap", 7087, 1000, 1.4],
    ] }]);
    expect(readAtl(open(b)).warnings).toEqual(expect.arrayContaining([
      "Savlon Soap has 7,087 GRP in Aug'26, more than 3,000 in one month. Please check the file.",
      "Savlon Soap has 1+ Reach above 100% in Aug'26. Please check the file.",
    ]));
  });
});
