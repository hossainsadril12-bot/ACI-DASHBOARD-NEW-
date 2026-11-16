import { describe, expect, it } from "vitest";
import { checkXlsxBytes, MAX_UNPACKED_BYTES } from "./xlsx-check";
import { makeXlsx } from "./test-workbooks";

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";

/** A minimal stored zip with one entry whose central directory claims `size` unpacked bytes. */
function zipClaiming(name: string, size: number): Uint8Array {
  const n = Buffer.from(name);
  const local = Buffer.alloc(30 + n.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
  const central = Buffer.alloc(46 + n.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(size, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42); n.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

describe("checkXlsxBytes", () => {
  it("accepts a real workbook", () => {
    expect(checkXlsxBytes(new Uint8Array(makeXlsx([{ name: "S", rows: [["a"]] }])))).toEqual({ ok: true });
  });
  it("refuses an empty file", () => {
    expect(checkXlsxBytes(new Uint8Array())).toEqual({ ok: false, reason: "The file is empty." });
  });
  it("refuses a file over 60 MB without reading it", () => {
    expect(checkXlsxBytes(new Uint8Array(60 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "The file is larger than 60 MB." });
  });
  it("refuses text, PDF and a renamed zip", () => {
    expect(checkXlsxBytes(new Uint8Array(Buffer.from("Brand,Spend\n")))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(new Uint8Array(Buffer.from("%PDF-1.7")))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(zipClaiming("photo.jpg", 10))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("names an old .xls file", () => {
    expect(checkXlsxBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toEqual({
      ok: false, reason: "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.",
    });
  });
  it("refuses a zip bomb before unpacking", () => {
    expect(checkXlsxBytes(zipClaiming("xl/workbook.xml", MAX_UNPACKED_BYTES + 1))).toEqual({
      ok: false, reason: "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.",
    });
  });
});
