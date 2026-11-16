import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { checkXlsxBytes, MAX_UNPACKED_BYTES } from "./xlsx-check";
import { makeXlsx } from "./test-workbooks";
import { openWorkbook } from "./workbook";

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

type LocalOverride = { method?: number; flags?: number; comp?: number; size?: number; name?: string; extra?: Buffer };
type Entry = { name: string; method?: number; data?: Buffer; declared?: number; flags?: number; extra?: Buffer; local?: LocalOverride; after?: Buffer };
/**
 * A zip with real local headers and data. By default the local header agrees with the central directory;
 * `declared` makes both understate the size, `local` makes the local header say something else,
 * `after` puts bytes (a data descriptor) after the entry's data.
 */
function buildZip(entries: Entry[], trailing = Buffer.alloc(0)): Uint8Array {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const n = Buffer.from(e.name); const data = e.data ?? Buffer.alloc(0); const method = e.method ?? 0; const flags = e.flags ?? 0;
    const lo = e.local ?? {}; const ln = Buffer.from(lo.name ?? e.name); const lx = lo.extra ?? Buffer.alloc(0); const cx = e.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30 + ln.length + lx.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(lo.flags ?? flags, 6); local.writeUInt16LE(lo.method ?? method, 8);
    local.writeUInt32LE(lo.comp ?? data.length, 18); local.writeUInt32LE(lo.size ?? e.declared ?? data.length, 22);
    local.writeUInt16LE(ln.length, 26); local.writeUInt16LE(lx.length, 28); ln.copy(local, 30); lx.copy(local, 30 + ln.length);
    const c = Buffer.alloc(46 + n.length + cx.length); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(e.declared ?? data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt16LE(cx.length, 30);
    c.writeUInt32LE(offset, 42); n.copy(c, 46); cx.copy(c, 46 + n.length);
    const after = e.after ?? Buffer.alloc(0);
    locals.push(local, data, after); centrals.push(c); offset += local.length + data.length + after.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd, trailing]));
}

/** The entries of a real workbook written by SheetJS, so a crafted zip around them still opens in SheetJS. */
function entriesOf(buf: Buffer): { name: string; data: Buffer }[] {
  const z = XLSX.CFB.read(buf, { type: "buffer" });
  const out: { name: string; data: Buffer }[] = [];
  z.FullPaths.forEach((p: string, i: number) => { const f = z.FileIndex[i]; if (f.type === 2) out.push({ name: p.replace(/^Root Entry\//, ""), data: Buffer.from(f.content as Uint8Array) }); });
  return out;
}
const sheetJsUnpacks = (file: Uint8Array, name: string) => {
  const z = XLSX.CFB.read(Buffer.from(file), { type: "buffer" });
  return (z.FileIndex[z.FullPaths.findIndex((p: string) => p.endsWith(name))].content as Uint8Array).length;
};
const MB = 1024 * 1024;
const SHEET1 = "xl/worksheets/sheet1.xml";

/** Central directory: sheet1 is STORED and small. Local header: DEFLATED, flag bit 3, 2 MB unpacked. SheetJS trusts the local one. */
function methodSwapBomb(): Uint8Array {
  const entries = entriesOf(makeXlsx([{ name: "S", rows: [["a"]] }])).map((e) => {
    if (e.name !== SHEET1) { const d = deflateRawSync(e.data); return { name: e.name, method: 8, data: d, declared: e.data.length }; }
    const plain = Buffer.concat([e.data, Buffer.alloc(2 * MB, 0x20)]);
    const d = deflateRawSync(plain);
    const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(d.length, 8); dd.writeUInt32LE(d.length, 12);
    return { name: e.name, method: 0, data: d, local: { method: 8, flags: 8, comp: d.length, size: plain.length }, after: dd };
  });
  return buildZip(entries);
}

/**
 * A harmless workbook A whose first entry is a STORED blob carrying a whole second workbook B (sheet1 unpacks to 2 MB),
 * then 20 bytes holding a second end-of-central-directory signature that points at B's central directory.
 * SheetJS scans back from length-4 and reads B; a scan from length-22 reads A.
 */
function hiddenEocdBomb(): Uint8Array {
  const carrier = "docProps/custom.bin";
  const bBase = 30 + carrier.length;
  const parts: Buffer[] = []; const cds: Buffer[] = []; let off = 0;
  const b = entriesOf(makeXlsx([{ name: "S", rows: [["hidden"]] }])).map((e) => (e.name === SHEET1 ? { ...e, data: Buffer.concat([e.data, Buffer.alloc(2 * MB, 0x20)]) } : e));
  for (const e of b) {
    const n = Buffer.from(e.name); const d = deflateRawSync(e.data);
    const l = Buffer.alloc(30 + n.length); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(e.data.length, 22); l.writeUInt16LE(n.length, 26); n.copy(l, 30);
    const c = Buffer.alloc(46 + n.length); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(bBase + off, 42); n.copy(c, 46);
    parts.push(l, d); cds.push(c); off += l.length + d.length;
  }
  const blob = Buffer.concat([...parts, ...cds]);
  const a = [{ name: carrier, data: blob }, ...entriesOf(makeXlsx([{ name: "S", rows: [["visible"]] }])).map((e) => ({ name: e.name, method: 8, data: deflateRawSync(e.data), declared: e.data.length }))];
  // Both entry counts set, so only the end-of-central-directory position check can catch it.
  const fake = Buffer.alloc(20); fake.writeUInt32LE(0x06054b50, 0); fake.writeUInt16LE(b.length, 8); fake.writeUInt16LE(b.length, 10); fake.writeUInt32LE(bBase + off, 16);
  return buildZip(a, fake);
}

const workbookXml = (method = 0) => ({ name: "xl/workbook.xml", method, data: method === 8 ? deflateRawSync(Buffer.from("<a/>")) : Buffer.from("<a/>"), declared: 4 });

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
  it("refuses a bomb whose local header says deflate while the central directory says stored (SheetJS trusts the local one)", () => {
    const zip = methodSwapBomb();
    expect(sheetJsUnpacks(zip, SHEET1)).toBeGreaterThan(2 * MB); // what SheetJS would really unpack
    expect(checkXlsxBytes(zip, { maxUnpacked: MB })).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses a second end-of-central-directory record in the last bytes that hides another workbook", () => {
    const zip = hiddenEocdBomb();
    expect(openWorkbook(zip).sheet(0)?.v(1, 1)).toBe("hidden"); // SheetJS reads the hidden workbook, not the visible one
    expect(sheetJsUnpacks(zip, SHEET1)).toBeGreaterThan(2 * MB);
    expect(checkXlsxBytes(zip, { maxUnpacked: MB })).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses a local header whose method differs from the central directory, even when the sizes agree", () => {
    const d = deflateRawSync(Buffer.alloc(2 * MB));
    const zip = buildZip([workbookXml(), { name: "x.bin", method: 0, data: d, local: { method: 8 } }]);
    expect(checkXlsxBytes(zip, { maxUnpacked: MB })).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses a local header whose sizes differ from the central directory", () => {
    expect(checkXlsxBytes(buildZip([workbookXml(), { name: "x.bin", data: Buffer.from("abcdef"), local: { comp: 600, size: 600 } }]))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(buildZip([workbookXml(8), { name: "x.bin", method: 8, data: deflateRawSync(Buffer.from("abc")), declared: 3, local: { size: 9_000_000 } }]))).toEqual({ ok: false, reason: NOT_XLSX });
    // Bit 3 set with sizes 0 in the local header is normal (sizes follow the data); it still has to agree on the method.
    const deferred = { name: "x.bin", method: 8, data: deflateRawSync(Buffer.from("abc")), declared: 3, flags: 8, local: { comp: 0, size: 0 } };
    expect(checkXlsxBytes(buildZip([workbookXml(8), deferred]))).toEqual({ ok: true });
    expect(checkXlsxBytes(buildZip([workbookXml(8), { ...deferred, local: { comp: 0, size: 0, flags: 0 } }]))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses a local file name that differs from the central directory", () => {
    expect(checkXlsxBytes(buildZip([{ ...workbookXml(), local: { name: "xl/workbook.xmm" } }]))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses data after the end-of-central-directory record", () => {
    expect(checkXlsxBytes(buildZip([workbookXml()]))).toEqual({ ok: true });
    expect(checkXlsxBytes(buildZip([workbookXml()], Buffer.alloc(10)))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(buildZip([workbookXml()], Buffer.from([0x50, 0x4b, 0x05])))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses an end-of-central-directory signature in the last bytes of the zip comment (SheetJS would use that one)", () => {
    const withComment = (comment: Buffer) => {
      const zip = Buffer.from(buildZip([workbookXml()]));
      zip.writeUInt16LE(comment.length, zip.length - 22 + 20);
      return new Uint8Array(Buffer.concat([zip, comment]));
    };
    expect(checkXlsxBytes(withComment(Buffer.from("made by hand")))).toEqual({ ok: true });
    const sig = Buffer.alloc(10); sig.writeUInt32LE(0x06054b50, 0);
    expect(checkXlsxBytes(withComment(sig))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses an end-of-central-directory record whose two entry counts differ (SheetJS reads the first)", () => {
    const zip = Buffer.from(buildZip([workbookXml(), { name: "b", data: Buffer.from("b") }]));
    zip.writeUInt16LE(1, zip.length - 22 + 8);
    expect(checkXlsxBytes(new Uint8Array(zip))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("refuses encrypted entries", () => {
    for (const flags of [0x0001, 0x0040, 0x2000]) {
      expect(checkXlsxBytes(buildZip([workbookXml(), { name: "b", data: Buffer.from("b"), flags, local: { flags: 0 } }])), `central flags ${flags}`).toEqual({ ok: false, reason: NOT_XLSX });
      expect(checkXlsxBytes(buildZip([workbookXml(), { name: "b", data: Buffer.from("b"), local: { flags } }])), `local flags ${flags}`).toEqual({ ok: false, reason: NOT_XLSX });
    }
  });
  it("refuses zip64 size fields hidden in an extra field (SheetJS lets them override the sizes)", () => {
    const z64 = Buffer.alloc(20); z64.writeUInt16LE(0x0001, 0); z64.writeUInt16LE(16, 2); z64.writeUInt32LE(9_000_000, 4); z64.writeUInt32LE(9_000_000, 12);
    const time = Buffer.alloc(9); time.writeUInt16LE(0x5455, 0); time.writeUInt16LE(5, 2);
    expect(checkXlsxBytes(buildZip([workbookXml(), { name: "b", data: Buffer.from("b"), extra: time, local: { extra: time } }]))).toEqual({ ok: true });
    expect(checkXlsxBytes(buildZip([workbookXml(), { name: "b", data: Buffer.from("b"), extra: z64 }]))).toEqual({ ok: false, reason: TOO_BIG });
    expect(checkXlsxBytes(buildZip([workbookXml(), { name: "b", data: Buffer.from("b"), local: { extra: Buffer.concat([time, z64]) } }]))).toEqual({ ok: false, reason: TOO_BIG });
  });
  it("treats exactly 60 MB as not too big and 60 MB + 1 as too big", () => {
    const exact = new Uint8Array(60 * 1024 * 1024);
    const r = checkXlsxBytes(exact);
    expect(r.ok === false && r.reason).not.toBe("The file is larger than 60 MB.");
    expect(checkXlsxBytes(new Uint8Array(60 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "The file is larger than 60 MB." });
  });
});
