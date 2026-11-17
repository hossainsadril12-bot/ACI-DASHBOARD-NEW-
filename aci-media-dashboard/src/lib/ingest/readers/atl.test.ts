import { describe, expect, it } from "vitest";
import { readAtl, readAtlTitle, type AtlCategory } from "./atl";
import { NeedsCategoryError, ReadError, type ReaderContext } from "../read-result";
import { matchAtlCategory, suggestOwnBrands } from "../suggestions";
import { openWorkbook, type Workbook } from "../workbook";
import { answerKey, clientFiles, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const SOAP: ReaderContext = { fileName: "soap.xlsx", atlCategory: { slug: "soap", name: "Savlon Soap", business: "Toiletries", ownBrands: ["Savlon Soap"] } };

/** The context his app implied: his category for the title, and his own-brand rule over the file's brand rows. */
function hisContext(wb: Workbook): ReaderContext {
  const title = readAtlTitle(wb);
  const c = matchAtlCategory(title)!;
  const base = { slug: c[0], name: c[1], business: c[2] };
  const brands = readAtl(wb, { fileName: "x.xlsx", atlCategory: { ...base, ownBrands: [] } }).data.brands;
  return { fileName: "x.xlsx", atlCategory: { ...base, ownBrands: suggestOwnBrands(title, brands) } };
}

describe.skipIf(!hasClientFiles)("ATL: all 13 real files match his built-in data", () => {
  const key = hasClientFiles ? answerKey<{ cats: Record<string, AtlCategory & { src?: unknown }> }>("atl.json") : { cats: {} };
  const files = hasClientFiles ? clientFiles().filter((f) => f.rel.startsWith("atl/")) : [];
  it("has 13 files and 13 categories", () => {
    expect(files).toHaveLength(13);
    expect(Object.keys(key.cats)).toHaveLength(13);
  });
  it.each(files.map((f) => [f.rel, f.bytes] as const))("%s", (_rel, bytes) => {
    const wb = open(bytes);
    const r = readAtl(wb, hisContext(wb));
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
    const wb = open(files.find((x) => x.rel.includes("Savlon_Soap"))!.bytes);
    expect(readAtl(wb, hisContext(wb)).label).toBe("ATL, Savlon Soap, Jul'25 to Oct'26");
  });
  it("spices keeps all 4 of his own brands", () => {
    const wb = open(files.find((x) => /spice/i.test(x.rel))!.bytes);
    expect(readAtl(wb, hisContext(wb)).data.own).toEqual(["ACI Pure Masala", "ACI Pure Halim Mix", "ACI Pure - Roast Masala", "ACI Pure Mixed Spice - Biriyani Masala"]);
  });
});

describe("ATL category from the caller", () => {
  const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
  const luxBook = () => makeXlsx([{ name: "GRP", rows: [
    ["Brand Name: Lux Soap"],
    ["Brand Name", d(2026, 7)],
    [null, "GRP", "Spend"],
    ["Lux", 10, 1000],
    ["Dove", 30, 3000],
    ["Sunsilk", 5, 500],
  ] }]);
  const lux = (ownBrands: string[]): ReaderContext => ({ fileName: "lux.xlsx", atlCategory: { slug: "lux-soap", name: "Lux Soap", business: "Toiletries", ownBrands } });

  it("reads the title", () => {
    expect(readAtlTitle(open(luxBook()))).toBe("Lux Soap");
    expect(() => readAtlTitle(open(makeXlsx([{ name: "GRP", rows: [["Client : ACI"]] }])))).toThrow(
      new ReadError('Couldn\'t find the "Brand Name:" line at the top of sheet "GRP".'),
    );
  });
  it("asks for the category when the caller has none", () => {
    for (const ctx of [{ fileName: "lux.xlsx" }, { fileName: "lux.xlsx", atlCategory: null }]) {
      let err: unknown;
      try { readAtl(open(luxBook()), ctx); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(NeedsCategoryError);
      expect(err).toMatchObject({ title: "Lux Soap", message: "New ATL category." });
    }
  });
  it("reads a category his app never had", () => {
    const r = readAtl(open(luxBook()), lux(["Lux"]));
    expect(r.datasetKey).toBe("atl:lux-soap");
    expect(r.label).toBe("ATL, Lux Soap, Jul'26 to Jul'26");
    expect(r.summary).toBe("Lux Soap · 1 months (Jul'26 – Jul'26) · 3 brands on air");
    expect(r.data).toMatchObject({ name: "Lux Soap", biz: "Toiletries", title: "Lux Soap", own: ["Lux"], brands: ["Lux", "Dove", "Sunsilk"] });
    expect(r.warnings).toEqual([]);
  });
  it("matches our brands by normalised name, in row order", () => {
    expect(readAtl(open(luxBook()), lux([" sunsilk ", "LUX", "Nope"])).data.own).toEqual(["Lux", "Sunsilk"]);
  });
  it("warns, with the category name, when none of our brands is in the file", () => {
    const r = readAtl(open(luxBook()), lux(["Nope"]));
    expect(r.data.own).toEqual([]);
    expect(r.warnings).toEqual(["Couldn't find Lux Soap's own row in the brand list; every brand is treated as a competitor."]);
  });
});

describe("ATL read errors and warnings", () => {
  it("needs the Brand Name line", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Client : ACI"], ["Brand Name"]] }])), SOAP)).toThrow(
      new ReadError('Couldn\'t find the "Brand Name:" line at the top of sheet "GRP".'),
    );
  });
  it("needs the header row", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Brand Name: ACI Savlon Soap"]] }])), SOAP)).toThrow(/header row/i);
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
    const r = readAtl(open(b), SOAP);
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
    expect(readAtl(open(b), SOAP).warnings).toEqual(expect.arrayContaining([
      "Savlon Soap has 7,087 GRP in Aug'26, more than 3,000 in one month. Please check the file.",
      "Savlon Soap has 1+ Reach above 100% in Aug'26. Please check the file.",
    ]));
  });
});
