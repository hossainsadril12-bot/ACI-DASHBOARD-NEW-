import { describe, expect, it } from "vitest";
import { readBillboard, type BillboardData } from "./billboard";
import { READER_NEEDS_STYLES } from "./index";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

describe.skipIf(!hasClientFiles)("Billboard billing: the real file", () => {
  it("equals his built-in data, statuses read from the row colours", () => {
    const r = readBillboard(openWorkbook(new Uint8Array(clientFile("Billboard_Billing_Status_Updated_10th_Nov26.xlsx")), { styles: true }));
    expect(r.data).toEqual(answerKey<BillboardData>("billboard.json"));
    expect(r.label).toBe("Billboard billing, 169 bills");
  });
});
describe("Billboard billing read errors", () => {
  it("needs the header row", () => {
    expect(() => readBillboard(openWorkbook(new Uint8Array(makeXlsx([{ name: "S", rows: [["Billboard Billing Status"]] }])), { styles: true })))
      .toThrow(new ReadError('The header row ("SL · Name of the Media/ Vendor · …") wasn\'t found.'));
  });
});
describe("Billboard registration", () => {
  it("needs styles", () => {
    expect(READER_NEEDS_STYLES).toEqual(new Set(["billboard"]));
  });
});
