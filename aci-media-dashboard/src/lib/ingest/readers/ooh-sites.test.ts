import { describe, expect, it } from "vitest";
import { readOohSites } from "./ooh-sites";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const FIELDS = ["sl", "location", "brand", "size", "start", "end", "cost", "vendor", "lat", "lng"] as const;

describe.skipIf(!hasClientFiles)("OOH master sheet: the real file", () => {
  it("matches his sites on the sheet's own fields", () => {
    const r = readOohSites(open(clientFile("ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx")));
    const sites = Object.values(answerKey<Record<string, Record<string, unknown>>>("sites.json"));
    const pick = (o: Record<string, unknown>) => Object.fromEntries(FIELDS.map((k) => [k, o[k]]));
    expect(r.data.map(pick)).toEqual(sites.sort((a, b) => Number(a.sl) - Number(b.sl)).map(pick));
    expect(r.label).toBe("OOH master sheet, 40 sites");
  });
});
describe("OOH master sheet read errors and warnings", () => {
  const H = ["Sl. No", "OOH Location", "Present display/Brand", "Size", "Bill Board Period", null, "Present Amount (inc. VAT)", "Vendor", "Latitude", "Longitude"];
  it("needs a header with OOH Location and Latitude", () => {
    expect(() => readOohSites(open(makeXlsx([{ name: "S", rows: [["Sl. No", "Place"]] }])))).toThrow(new ReadError('Couldn\'t find the header row (it needs "OOH Location" and "Latitude").'));
  });
  it("warns about a missing pin, coordinates outside Bangladesh and no amount", () => {
    const r = readOohSites(open(makeXlsx([{ name: "Master File", rows: [H,
      [1, "Trishal, Mymensingh", "ACI Pure Salt", "W 10' x H 6'", null, null, 1000, "Sadaf Ad", null, null],
      [2, "Somewhere", "ACI Pure Salt", "W 10' x H 6'", null, null, null, "Sadaf Ad", 10, 10],
    ] }])));
    expect(r.warnings).toEqual(expect.arrayContaining([
      "Sl 1 Trishal, Mymensingh: no latitude/longitude, so no map pin",
      "Sl 2 Somewhere: coordinates are outside Bangladesh",
      "Sl 2 Somewhere: no amount",
    ]));
  });
});
