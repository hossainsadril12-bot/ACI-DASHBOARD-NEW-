import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkXlsxBytes, MAX_UNPACKED_BYTES } from "./xlsx-check";
import { makeXlsx } from "./test-workbooks";

const TOO_BIG = "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.";
const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";

/** A minimal stored zip with one entry whose central directory claims `size` unpacked bytes. */
function zipClaiming(name: string, size: number): Uint8Array {
  const n = Buffer.from(name);
  const local = Buffer.alloc(30 + n.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
  const central = Buffer.alloc(46 + n.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(size, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42); n.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

type Entry = { name: string; method?: number; data?: Buffer; declared?: number };
/** A zip with real local headers and data; `declared` lets the central directory understate the size. */
function buildZip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const n = Buffer.from(e.name); const data = e.data ?? Buffer.alloc(0); const method = e.method ?? 0;
    const local = Buffer.alloc(30 + n.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
    const c = Buffer.alloc(46 + n.length); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(e.declared ?? data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); n.copy(c, 46);
    locals.push(local, data); centrals.push(c); offset += local.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
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
  it("refuses a zip that understates its sizes but inflates past the cap", () => {
    const real = deflateRawSync(Buffer.alloc(3 * 1024 * 1024));
    const zip = buildZip([{ name: "xl/workbook.xml", method: 8, data: real, declared: 100 }]);
    expect(checkXlsxBytes(zip, { maxUnpacked: 1024 * 1024 })).toEqual({ ok: false, reason: TOO_BIG });
  });
  it("accepts a deflated workbook entry under the cap and refuses a corrupt stream or unknown method", () => {
    const ok = buildZip([{ name: "xl/workbook.xml", method: 8, data: deflateRawSync(Buffer.from("<a/>")) }]);
    expect(checkXlsxBytes(ok)).toEqual({ ok: true });
    const bad = buildZip([{ name: "xl/workbook.xml", method: 8, data: Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff]) }]);
    expect(checkXlsxBytes(bad)).toEqual({ ok: false, reason: NOT_XLSX });
    const odd = buildZip([{ name: "xl/workbook.xml", method: 12, data: Buffer.from("x") }]);
    expect(checkXlsxBytes(odd)).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("sums sizes across entries", () => {
    const zip = buildZip([
      { name: "xl/workbook.xml", data: Buffer.from("a"), declared: MAX_UNPACKED_BYTES - 5 },
      { name: "b", data: Buffer.from("b"), declared: 3 },
      { name: "c", data: Buffer.from("c"), declared: 3 },
    ]);
    expect(checkXlsxBytes(zip)).toEqual({ ok: false, reason: TOO_BIG });
  });
  it("refuses zip64 markers", () => {
    const base = Buffer.from(zipClaiming("xl/workbook.xml", 10));
    const eocd = base.length - 22;
    const count = Buffer.from(base); count.writeUInt16LE(0xffff, eocd + 10);
    expect(checkXlsxBytes(new Uint8Array(count))).toEqual({ ok: false, reason: TOO_BIG });
    const off = Buffer.from(base); off.writeUInt32LE(0xffffffff, eocd + 16);
    expect(checkXlsxBytes(new Uint8Array(off))).toEqual({ ok: false, reason: TOO_BIG });
    expect(checkXlsxBytes(zipClaiming("xl/workbook.xml", 0xffffffff))).toEqual({ ok: false, reason: TOO_BIG });
  });
  it("refuses a truncated or garbage central directory", () => {
    const zip = Buffer.from(zipClaiming("xl/workbook.xml", 10));
    const garbage = Buffer.from(zip); garbage.fill(0x41, zip.readUInt32LE(zip.length - 22 + 16), zip.readUInt32LE(zip.length - 22 + 16) + 4);
    expect(checkXlsxBytes(new Uint8Array(garbage))).toEqual({ ok: false, reason: NOT_XLSX });
    const pointsOut = Buffer.from(zip); pointsOut.writeUInt32LE(zip.length + 1000, zip.length - 22 + 16);
    expect(checkXlsxBytes(new Uint8Array(pointsOut))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(new Uint8Array(zip.subarray(0, 40)))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("treats exactly 60 MB as not too big and 60 MB + 1 as too big", () => {
    const exact = new Uint8Array(60 * 1024 * 1024);
    const r = checkXlsxBytes(exact);
    expect(r.ok === false && r.reason).not.toBe("The file is larger than 60 MB.");
    expect(checkXlsxBytes(new Uint8Array(60 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "The file is larger than 60 MB." });
  });
});
