import { inflateRawSync } from "node:zlib";
import { MAX_FILE_BYTES } from "@/store/files";

export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export type XlsxCheck = { ok: true } | { ok: false; reason: string };

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";
const OLD_XLS = "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.";
const TOO_BIG = "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.";
const no = (reason: string): XlsxCheck => ({ ok: false, reason });

/**
 * Decides from the bytes (never the file name) whether this is an .xlsx we are willing to parse.
 * Pass 1 walks the zip central directory and refuses on declared sizes (cheap, no inflating).
 * Pass 2 does not trust those sizes: it inflates every entry with a hard output cap, so a zip
 * that understates its sizes still cannot unpack past the limit.
 */
export function checkXlsxBytes(bytes: Uint8Array, limits?: { maxUnpacked?: number }): XlsxCheck {
  const maxUnpacked = limits?.maxUnpacked ?? MAX_UNPACKED_BYTES;
  if (bytes.length === 0) return no("The file is empty.");
  if (bytes.length > MAX_FILE_BYTES) return no("The file is larger than 60 MB.");
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return no(OLD_XLS);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return no(NOT_XLSX);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 22 - 0xffff); p--) {
    if (dv.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) return no(NOT_XLSX);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) return no(TOO_BIG); // zip64: never needed for his files
  const decoder = new TextDecoder();
  let total = 0;
  let hasWorkbook = false;
  const entries: { method: number; compSize: number; localOffset: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return no(NOT_XLSX);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const localOffset = dv.getUint32(p + 42, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    if (size === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) return no(TOO_BIG);
    total += size;
    if (total > maxUnpacked) return no(TOO_BIG);
    entries.push({ method, compSize, localOffset });
    if (decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)) === "xl/workbook.xml") hasWorkbook = true;
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!hasWorkbook) return no(NOT_XLSX);
  let remaining = maxUnpacked;
  for (const e of entries) {
    const lo = e.localOffset;
    if (lo + 30 > bytes.length || dv.getUint32(lo, true) !== 0x04034b50) return no(NOT_XLSX);
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
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
