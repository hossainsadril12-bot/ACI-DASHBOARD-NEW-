import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

export type SheetSpec = { name: string; rows: unknown[][]; hidden?: boolean };

/** Builds a real .xlsx in memory. Date objects become date-formatted cells. */
export function makeXlsx(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows, { cellDates: true }), s.name);
  wb.Workbook = { Sheets: sheets.map((s) => ({ name: s.name, Hidden: s.hidden ? 1 : 0 })) } as XLSX.WBProps;
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const CLIENT_XLSX_DIR = path.resolve("Asset/xlsx");
export const ANSWER_KEY_DIR = path.resolve("Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/data");
export const hasClientFiles = fs.existsSync(CLIENT_XLSX_DIR) && fs.existsSync(ANSWER_KEY_DIR);

export const clientFile = (rel: string): Buffer => fs.readFileSync(path.join(CLIENT_XLSX_DIR, rel));

/** All 22 client files, as paths relative to Asset/xlsx ("atl/1._2026_..." for ATL). */
export function clientFiles(): { rel: string; bytes: Buffer }[] {
  const top = fs.readdirSync(CLIENT_XLSX_DIR).filter((f) => f.endsWith(".xlsx"));
  const atl = fs.readdirSync(path.join(CLIENT_XLSX_DIR, "atl")).filter((f) => f.endsWith(".xlsx")).map((f) => `atl/${f}`);
  return [...top, ...atl].map((rel) => ({ rel, bytes: clientFile(rel) }));
}

export const answerKey = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(ANSWER_KEY_DIR, name), "utf8")) as T;
