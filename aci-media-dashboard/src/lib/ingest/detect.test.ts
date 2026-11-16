import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFileType, NOT_USUAL_FILE } from "./detect";
import { openWorkbook } from "./workbook";
import { clientFiles, hasClientFiles, makeXlsx } from "./test-workbooks";
import type { FileType } from "./file-types";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

const EXPECTED: Record<string, FileType> = {
  "ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx": "ooh-sites",
  "All_Activity_Calender_FY_26-27.xlsx": "calendar",
  "Billboard_Billing_Status_Updated_10th_Nov26.xlsx": "billboard",
  "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx": "fy",
  "Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx": "channel",
  "Dashboard_Media_Final_Fixed_26th_October_2026.xlsx": "billing",
  "Hygiene_Business.xlsx": "digital",
  "Salt_Business.xlsx": "digital",
  "Toiletries_Business_Digital_Media_Data_FY_26-27.xlsx": "digital",
};

describe.skipIf(!hasClientFiles)("every real file is detected as the right type, for sure", () => {
  const files = hasClientFiles ? clientFiles() : [];
  it("covers all 22 files", () => expect(files).toHaveLength(22));
  it.each(files.map((f) => [f.rel, f.bytes] as const))("%s", (rel, bytes) => {
    const want = rel.startsWith("atl/") ? "atl" : EXPECTED[rel];
    expect(want, `no expectation for ${rel}`).toBeDefined();
    expect(detectFileType(open(bytes))).toEqual({ status: "sure", type: want });
  });
});

describe("files that are not his usual files", () => {
  it("refuses a workbook with nothing recognisable", () => {
    expect(detectFileType(open(makeXlsx([{ name: "Sheet1", rows: [["Name", "Amount"], ["a", 1]] }])))).toEqual({ status: "none", lookedFor: NOT_USUAL_FILE });
  });
  it("ignores hidden sheets", () => {
    const b = makeXlsx([
      { name: "Electronic", rows: [["SL", "Channel Name"]], hidden: true },
      { name: "Digital", rows: [["SL", "Platform"]], hidden: true },
      { name: "Press & Radio", rows: [["SL", "Name"]], hidden: true },
      { name: "Notes", rows: [["hello"]] },
    ]);
    expect(detectFileType(open(b)).status).toBe("none");
  });
  it("is unsure about a partial match (calendar without Grand Total)", () => {
    const b = makeXlsx([{ name: "Nov'26", rows: [["CB Media Activity Nov 2026"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["calendar"] });
  });
  it("is unsure when only some channel sheets are there", () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["channel"] });
  });
  it("never says sure for the old app's template files", () => {
    const dir = path.resolve("../demo-files");
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".xlsx"))) {
      expect(detectFileType(open(fs.readFileSync(path.join(dir, f)))).status, f).not.toBe("sure");
    }
  });
});
