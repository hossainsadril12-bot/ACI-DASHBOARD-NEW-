import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFileType, NOT_USUAL_FILE } from "./detect";
import { openWorkbook } from "./workbook";
import { clientFiles, hasClientFiles, makeXlsx } from "./test-workbooks";
import { FILE_TYPES, type FileType } from "./file-types";

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
});

// The old app's template files live outside this repo, so other machines skip this.
const DEMO_DIR = path.resolve("../demo-files");
describe.skipIf(!fs.existsSync(DEMO_DIR))("the old app's template files", () => {
  it("are never detected as sure", () => {
    const files = fs.readdirSync(DEMO_DIR).filter((x) => x.endsWith(".xlsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(detectFileType(open(fs.readFileSync(path.join(DEMO_DIR, f)))).status, f).not.toBe("sure");
    }
  });
});

type Sheets = Parameters<typeof makeXlsx>[0];
// No "SL" first: "SL" then "Media/ Vendor" is also the billboard header, a fair partial billboard match.
const BILLING_HEADERS = ["Media/ Vendor", "Business", "Brand", "Month", "PO Number", "Invoice No", "Amount"];
const digitalSheets: Sheets = ["Meta", "YouTube", "TikTok"].map((name) => ({ name, rows: [["Brand", "Month", "Spend"], ["Savlon", "Nov'26", 100]] }));

// One workbook per type that matches its rule fully, and one that matches only partly.
const SYNTHETIC: [FileType, Sheets, Sheets][] = [
  [
    "atl",
    [{ name: "TV", rows: [["Brand Name: Toiletries"], [], ["Brand Name", "Channel", "NGRP"], ["Savlon Soap", "Channel i", 12]] }],
    [{ name: "TV", rows: [["Brand Name: Toiletries"], [], ["Name", "Channel", "NGRP"]] }],
  ],
  [
    "calendar",
    [{ name: "Nov'26", rows: [["CB Media Activity Nov 2026"], ["Business", "Brand", "Media"], ["Toiletries", "Savlon Soap", 1], ["Grand Total", null, 1]] }],
    [{ name: "Nov'26", rows: [["CB Media Activity Nov 2026"], ["Business", "Brand", "Media"], ["Toiletries", "Savlon Soap", 1]] }],
  ],
  [
    "fy",
    [{ name: "Final Report 26-27", rows: [["FY 26-27"], ["Brand", "Media", "Jul"], ["Savlon", "TV", 100]] }],
    [{ name: "Sheet1", rows: [["Brand", "Media", "Jul"], ["Savlon", "TV", 100]] }],
  ],
  [
    "channel",
    [
      { name: "Electronic", rows: [["SL", "Channel Name"]] },
      { name: "Digital", rows: [["SL", "Platform"]] },
      { name: "Press & Radio", rows: [["SL", "Name"]] },
    ],
    [
      { name: "Electronic", rows: [["SL", "Channel Name"]] },
      { name: "Digital", rows: [["SL", "Platform"]] },
    ],
  ],
  [
    "billing",
    [{ name: "Master", rows: [BILLING_HEADERS, ["Channel i", "Toiletries", "Savlon", "Nov'26", "PO-1", "INV-1", 100]] }],
    [{ name: "Master", rows: [["Media/ Vendor", "Business", "Brand", "Amount"]] }],
  ],
  [
    "billboard",
    [{ name: "Status", rows: [["Billboard Billing Status"], ["SL", "Vendor Name", "Location", "Purchase Order", "Bill No"]] }],
    [{ name: "Status", rows: [["Billboard Billing Status"], ["SL", "Vendor Name", "Location"]] }],
  ],
  ["digital", digitalSheets, digitalSheets.slice(0, 2)],
  [
    "ooh-sites",
    [{ name: "Sites", rows: [["SL", "OOH Location", "Latitude", "Longitude"], [1, "Gulshan 1", 23.78, 90.41]] }],
    [{ name: "Sites", rows: [["SL", "OOH Location", "Size"], [1, "Gulshan 1", "20x10"]] }],
  ],
];

describe("detection without client files", () => {
  it("covers every type", () => expect(SYNTHETIC.map(([t]) => t).sort()).toEqual([...FILE_TYPES].sort()));
  it.each(SYNTHETIC.map(([t, full]) => [t, full] as const))("%s: a full match is sure", (type, sheets) => {
    expect(detectFileType(open(makeXlsx(sheets)))).toEqual({ status: "sure", type });
  });
  it.each(SYNTHETIC.map(([t, , partial]) => [t, partial] as const))("%s: a partial match is unsure", (type, sheets) => {
    expect(detectFileType(open(makeXlsx(sheets)))).toEqual({ status: "unsure", candidates: [type] });
  });
  it("is unsure when two types match fully, full matches first", () => {
    const b = makeXlsx([{ name: "Master", rows: [BILLING_HEADERS] }, ...digitalSheets, { name: "Electronic", rows: [["SL", "Channel Name"]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["billing", "digital", "channel"] });
  });
  it("billing needs each keyword in its own cell", () => {
    const b = makeXlsx([{ name: "Master", rows: [["Media/ Vendor", "Business Brand", "Month", "PO Number", "Invoice No"]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["billing"] });
  });
});
