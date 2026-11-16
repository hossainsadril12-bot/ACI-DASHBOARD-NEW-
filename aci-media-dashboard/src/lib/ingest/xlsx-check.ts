import { inflateRawSync } from "node:zlib";
import { MAX_FILE_BYTES } from "@/store/files";

export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export type XlsxCheck = { ok: true } | { ok: false; reason: string };

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";
const OLD_XLS = "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.";
const TOO_BIG = "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.";
const no = (reason: string): XlsxCheck => ({ ok: false, reason });

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ENCRYPTED = 0x0041 | 0x2000; // traditional / strong encryption, central directory encrypted
const SIZES_AFTER_DATA = 0x0008; // sizes and CRC follow the data, local header may hold zeros

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** True if an extra-field block holds a zip64 record. Walked like SheetJS's parse_extra_field, which lets one override the sizes. */
function hasZip64Extra(dv: DataView, start: number, len: number): boolean {
  for (let p = start; p <= start + len - 4; p += 4 + dv.getUint16(p + 2, true)) {
    if (dv.getUint16(p, true) === 0x0001) return true;
  }
  return false;
}

/**
 * Decides from the bytes (never the file name) whether this is an .xlsx we are willing to parse.
 * It reads the zip the way SheetJS does, and refuses anything SheetJS would read differently:
 * the end-of-central-directory record is found scanning back from the last 4 bytes (as SheetJS does)
 * and must end exactly at the end of the file; every local header must agree with its central entry
 * on method, sizes and name. Pass 1 walks the central directory and refuses on declared sizes (cheap,
 * no inflating). Pass 2 does not trust those sizes: it inflates every entry with a hard output cap,
 * so a zip that understates its sizes still cannot unpack past the limit.
 */
export function checkXlsxBytes(bytes: Uint8Array, limits?: { maxUnpacked?: number }): XlsxCheck {
  const maxUnpacked = limits?.maxUnpacked ?? MAX_UNPACKED_BYTES;
  if (bytes.length === 0) return no("The file is empty.");
  if (bytes.length > MAX_FILE_BYTES) return no("The file is larger than 60 MB.");
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return no(OLD_XLS);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return no(NOT_XLSX);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Same search as SheetJS (back from length-4), so this is the record it uses and none comes after it.
  let eocd = -1;
  for (let p = bytes.length - 4; p >= Math.max(0, bytes.length - 22 - 0xffff); p--) {
    if (dv.getUint32(p, true) === EOCD_SIG) { eocd = p; break; }
  }
  if (eocd < 0 || eocd + 22 > bytes.length || eocd + 22 + dv.getUint16(eocd + 20, true) !== bytes.length) return no(NOT_XLSX);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) return no(TOO_BIG); // zip64: never needed for his files
  if (dv.getUint16(eocd + 8, true) !== count) return no(NOT_XLSX); // SheetJS reads this count, we read the total
  let total = 0;
  let hasWorkbook = false;
  const workbookName = new TextEncoder().encode("xl/workbook.xml");
  const entries: { method: number; flags: number; compSize: number; size: number; localOffset: number; name: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== CENTRAL_SIG) return no(NOT_XLSX);
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const localOffset = dv.getUint32(p + 42, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    if (p + 46 + nameLen + extraLen + commentLen > bytes.length) return no(NOT_XLSX);
    if (flags & ENCRYPTED) return no(NOT_XLSX);
    if (size === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) return no(TOO_BIG);
    if (hasZip64Extra(dv, p + 46 + nameLen, extraLen)) return no(TOO_BIG);
    total += size;
    if (total > maxUnpacked) return no(TOO_BIG);
    const name = bytes.subarray(p + 46, p + 46 + nameLen);
    entries.push({ method, flags, compSize, size, localOffset, name });
    if (sameBytes(name, workbookName)) hasWorkbook = true;
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!hasWorkbook) return no(NOT_XLSX);
  let remaining = maxUnpacked;
  for (const e of entries) {
    const lo = e.localOffset;
    if (lo + 30 > bytes.length || dv.getUint32(lo, true) !== LOCAL_SIG) return no(NOT_XLSX);
    // SheetJS takes flags, method and sizes from the local header: they must say what the central directory says.
    const flags = dv.getUint16(lo + 6, true);
    const method = dv.getUint16(lo + 8, true);
    const compSize = dv.getUint32(lo + 18, true);
    const size = dv.getUint32(lo + 22, true);
    const nameLen = dv.getUint16(lo + 26, true);
    const extraLen = dv.getUint16(lo + 28, true);
    const start = lo + 30 + nameLen + extraLen;
    if (start > bytes.length) return no(NOT_XLSX);
    if (flags & ENCRYPTED) return no(NOT_XLSX);
    if (method !== e.method) return no(NOT_XLSX);
    const sizesLater = (flags & SIZES_AFTER_DATA) !== 0 && compSize === 0 && size === 0;
    if (!sizesLater && (compSize !== e.compSize || size !== e.size)) return no(NOT_XLSX);
    if (!sameBytes(bytes.subarray(lo + 30, lo + 30 + nameLen), e.name)) return no(NOT_XLSX);
    if (hasZip64Extra(dv, lo + 30 + nameLen, extraLen)) return no(TOO_BIG);
    const end = start + e.compSize;
    if (end > bytes.length) return no(NOT_XLSX);
    const data = bytes.subarray(start, end);
    if (e.method === 0) {
      remaining -= data.length;
      if (remaining < 0) return no(TOO_BIG);
    } else if (e.method === 8) {
      try {
        remaining -= inflateRawSync(data, { maxOutputLength: Math.max(remaining, 1) }).length;
      } catch (err) {
        const code = (err as { code?: string }).code;
        return no(err instanceof RangeError || code === "ERR_BUFFER_TOO_LARGE" ? TOO_BIG : NOT_XLSX);
      }
      if (remaining < 0) return no(TOO_BIG);
    } else return no(NOT_XLSX);
  }
  return { ok: true };
}
