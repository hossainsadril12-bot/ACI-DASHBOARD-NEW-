import { describe, expect, it } from "vitest";
import { openWorkbook } from "./workbook";
import { clientFiles, hasClientFiles, makeXlsx } from "./test-workbooks";
import { checkXlsxBytes } from "./xlsx-check";
import { monthLabel, round, xstr } from "./cells";

describe("openWorkbook", () => {
  const bytes = makeXlsx([
    { name: "Hidden one", rows: [["secret"]], hidden: true },
    { name: "Oct'26", rows: [["Title"], ["Brand", 12.5, new Date(Date.UTC(2026, 9, 1))], [null, "x"]] },
  ]);
  const wb = openWorkbook(new Uint8Array(bytes));

  it("lists sheets with visibility", () => {
    expect(wb.sheets).toEqual([{ name: "Hidden one", visible: false }, { name: "Oct'26", visible: true }]);
    expect(wb.visibleSheets().map((s) => s.name)).toEqual(["Oct'26"]);
  });
  it("reads cells 1-based, with dates and blanks", () => {
    const s = wb.sheet("oct'26 ")!; // case- and space-insensitive name match
    expect(s.v(2, 1)).toBe("Brand");
    expect(s.v(2, 2)).toBe(12.5);
    expect(s.cell(2, 3).date?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(s.v(3, 1)).toBeNull();
    expect(s.v(0, 1)).toBeNull();
    expect(s.v(99, 99)).toBeNull();
    expect(s.maxRow).toBe(3);
    expect(s.maxCol).toBe(3);
  });
  it("finds sheets by index and returns null when missing", () => {
    expect(wb.sheet(1)?.name).toBe("Oct'26");
    expect(wb.sheet(-1)).toBeNull();
    expect(wb.sheet(1.5)).toBeNull();
    expect(wb.sheet("nope")).toBeNull();
  });
});

describe("cell helpers", () => {
  it("match his reader's helpers", () => {
    expect(xstr(null)).toBe("");
    expect(xstr("  a ")).toBe("a");
    expect(round(1.23456, 2)).toBe(1.23);
    expect(monthLabel("2026-10")).toBe("Oct'26");
    expect(monthLabel("2027-01")).toBe("Jan'27");
  });
});

describe.skipIf(!hasClientFiles)("the client's 22 files", () => {
  it("all pass the byte check and open", () => {
    const files = clientFiles();
    expect(files).toHaveLength(22);
    for (const f of files) {
      expect(checkXlsxBytes(new Uint8Array(f.bytes)), f.rel).toEqual({ ok: true });
      expect(openWorkbook(new Uint8Array(f.bytes)).visibleSheets().length, f.rel).toBeGreaterThan(0);
    }
  });
});
