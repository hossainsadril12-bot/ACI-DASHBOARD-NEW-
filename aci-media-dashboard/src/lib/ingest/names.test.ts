import { describe, expect, it } from "vitest";
import { namesIn } from "./names";
import type { FileType } from "./file-types";
import type { ReadResult } from "./read-result";
import { readBillboard } from "./readers/billboard";
import { readBilling } from "./readers/billing";
import { readFy } from "./readers/fy";
import { openWorkbook } from "./workbook";
import { clientFile, hasClientFiles } from "./test-workbooks";

const rr = (type: FileType, data: unknown): ReadResult<unknown> =>
  ({ type, datasetKey: type, label: "", summary: "", months: [], rowCount: 0, data, warnings: [] });

/** A billing line: [desc, mapped biz, raw biz, brand, ...]. Only columns 2 and 3 matter here. */
const bl = (biz: string, brand: string) => ["desc", "Others", biz, brand, "2026-07"];

describe("namesIn", () => {
  it("billing: businesses from column 2 as typed, brands from column 3 with their row's business", () => {
    const n = namesIn(rr("billing", {
      bl: [bl(" ACI Salt ", "ACI Pure Salt"), bl("CB Core", "Mosquito Coil"), bl("aci  salt", "aci pure salt"), bl("Toiletries", "Savlon HW")],
      br: { h: [], r: [] },
    }));
    expect(n.businesses).toEqual(["ACI Salt", "CB Core", "Toiletries"]);
    expect(n.brands).toEqual([
      { name: "ACI Pure Salt", business: "ACI Salt" },
      { name: "Mosquito Coil", business: "CB Core" },
      { name: "Savlon HW", business: "Toiletries" },
    ]);
    expect(n.needsFileBusiness).toBe(false);
    expect(n.atlTitle).toBeNull();
  });

  it("drops blank names and names that normalise to others or total", () => {
    const n = namesIn(rr("billing", {
      bl: [bl("", "Savlon Soap"), bl(" OTHERS ", "Leona"), bl("Total", "total"), bl("Hygiene", "  "), bl("Hygiene", " Others")],
      br: { h: [], r: [] },
    }));
    expect(n.businesses).toEqual(["Hygiene"]);
    expect(n.brands).toEqual([{ name: "Savlon Soap", business: null }, { name: "Leona", business: null }]);
  });

  it("billboard: rows biz (raw) and b", () => {
    const n = namesIn(rr("billboard", { legend: [], rows: [{ biz: "AI", bz: "Others", b: "Agro" }, { biz: "Hygiene", bz: "Hygiene", b: "Freedom" }] }));
    expect(n.businesses).toEqual(["AI", "Hygiene"]);
    expect(n.brands).toEqual([{ name: "Agro", business: "AI" }, { name: "Freedom", business: "Hygiene" }]);
  });

  it("calendar: every month's rows, deduped across months", () => {
    const n = namesIn(rr("calendar", { months: [
      { m: "2026-07", rows: [{ biz: "Toiletries", b: "Savlon Soap" }, { biz: "Others", b: "Misc" }] },
      { m: "2026-08", rows: [{ biz: "toiletries", b: "SAVLON SOAP" }, { biz: "Salt", b: "ACI Pure Salt" }] },
    ] }));
    expect(n.businesses).toEqual(["Toiletries", "Salt"]);
    expect(n.brands).toEqual([
      { name: "Savlon Soap", business: "Toiletries" },
      { name: "Misc", business: null },
      { name: "ACI Pure Salt", business: "Salt" },
    ]);
  });

  it("fy: rows biz and b", () => {
    const n = namesIn(rr("fy", [{ biz: "Foods", b: "Basic Spices" }, { biz: "Electrolyte", b: "ACI Electrolyte" }, { biz: "Foods", b: "Basic Spices" }]));
    expect(n.businesses).toEqual(["Foods", "Electrolyte"]);
    expect(n.brands).toEqual([{ name: "Basic Spices", business: "Foods" }, { name: "ACI Electrolyte", business: "Electrolyte" }]);
  });

  it("digital: brands from dig, no businesses, the business comes from the admin's pick", () => {
    const n = namesIn(rr("digital", { dig: [{ bz: "Toiletries", b: "Savlon Soap" }, { bz: "Toiletries", b: "Shinex" }, { bz: "Toiletries", b: "savlon soap" }], raw: {} }));
    expect(n.businesses).toEqual([]);
    expect(n.brands).toEqual([{ name: "Savlon Soap", business: null }, { name: "Shinex", business: null }]);
    expect(n.needsFileBusiness).toBe(true);
    expect(n.atlTitle).toBeNull();
  });

  it("atl: the title, and only our own brands (competitors are never brands)", () => {
    const n = namesIn(rr("atl", {
      name: "Savlon Soap", biz: "Toiletries", title: "Savlon Soap", own: ["Savlon Soap", "Savlon Soap Mint"],
      brands: ["Savlon Soap", "Lux", "Lifebuoy", "Savlon Soap Mint"], months: {},
    }));
    expect(n.atlTitle).toBe("Savlon Soap");
    expect(n.businesses).toEqual([]);
    expect(n.brands).toEqual([{ name: "Savlon Soap", business: null }, { name: "Savlon Soap Mint", business: null }]);
    expect(n.needsFileBusiness).toBe(true);
  });

  it("ooh-sites: each brand on a site, split where the reader joined several with \" / \"", () => {
    const n = namesIn(rr("ooh-sites", [
      { location: "A", brand: "Twinkle Baby Dipaer / Freedom Sanitary Napkin" },
      { location: "B", brand: "Freedom Sanitary Napkin" },
      { location: "C", brand: "" },
    ]));
    expect(n.businesses).toEqual([]);
    expect(n.brands).toEqual([{ name: "Twinkle Baby Dipaer", business: null }, { name: "Freedom Sanitary Napkin", business: null }]);
    expect(n.needsFileBusiness).toBe(false);
  });

  it("channel: nothing", () => {
    const n = namesIn(rr("channel", { elec: { rows: [{ n: "Channel i", m: [] }], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } }));
    expect(n).toEqual({ businesses: [], brands: [], needsFileBusiness: false, atlTitle: null });
  });
});

describe.skipIf(!hasClientFiles)("namesIn: the real files", () => {
  const open = (rel: string, styles = false) => openWorkbook(new Uint8Array(clientFile(rel)), { styles });

  it("Billing gives exactly his 13 businesses", () => {
    const n = namesIn(readBilling(open("Dashboard_Media_Final_Fixed_26th_October_2026.xlsx")));
    expect([...n.businesses].sort()).toEqual(
      ["Toiletries", "Hygiene", "Salt", "Foods", "SCJ", "IB", "Electrical", "Beverage", "Commodity", "Rice", "CB", "CB Core", "ACI Salt"].sort(),
    );
    expect(n.brands.length).toBeGreaterThan(0);
  });

  it("FY includes Foods and Electrolyte", () => {
    const n = namesIn(readFy(open("CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx")));
    expect(n.businesses).toEqual(expect.arrayContaining(["Foods", "Electrolyte"]));
  });

  it("Billboard includes AI", () => {
    const n = namesIn(readBillboard(open("Billboard_Billing_Status_Updated_10th_Nov26.xlsx", true)));
    expect(n.businesses).toContain("AI");
  });
});
