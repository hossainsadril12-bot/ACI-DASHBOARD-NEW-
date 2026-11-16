import { MAX_FILE_BYTES } from "@/store/files";

export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export type XlsxCheck = { ok: true } | { ok: false; reason: string };

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";
const OLD_XLS = "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.";
const TOO_BIG = "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.";
const no = (reason: string): XlsxCheck => ({ ok: false, reason });

/**
 * Decides from the bytes (never the file name) whether this is an .xlsx we are willing to parse.
 * Reads only the zip central directory: no inflating, so a zip bomb is refused before any work.
 * The declared sizes could lie; this is a first guard, and only the signed-in admin can upload.
 */
export function checkXlsxBytes(bytes: Uint8Array): XlsxCheck {
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
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return no(NOT_XLSX);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    if (size === 0xffffffff) return no(TOO_BIG);
    total += size;
    if (total > MAX_UNPACKED_BYTES) return no(TOO_BIG);
    if (decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)) === "xl/workbook.xml") hasWorkbook = true;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return hasWorkbook ? { ok: true } : no(NOT_XLSX);
}
