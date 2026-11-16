import * as XLSX from "xlsx";

export type CellValue = string | number | boolean | null;
export type Cell = { v: CellValue; date: Date | null };
export type Sheet = { name: string; maxRow: number; maxCol: number; v(r: number, c: number): CellValue; cell(r: number, c: number): Cell };
export type SheetInfo = { name: string; visible: boolean };
export type Workbook = { sheets: SheetInfo[]; sheet(ref: string | number): Sheet | null; visibleSheets(): Sheet[] };

const EMPTY: Cell = { v: null, date: null };

function toCell(c: XLSX.CellObject | undefined): Cell {
  if (!c) return EMPTY;
  switch (c.t) {
    case "s": return { v: String(c.v), date: null };
    case "b": return { v: Boolean(c.v), date: null };
    case "e": return { v: c.w ?? null, date: null };
    case "n": {
      const v = Number(c.v);
      // Same as his reader: a number with a date format is an Excel date (days since 1899-12-30, UTC).
      const isDate = typeof c.z === "string" && XLSX.SSF.is_date(c.z);
      return { v, date: isDate ? new Date(Math.round((v - 25569) * 86400000)) : null };
    }
    case "d": return { v: (c.v as Date).getTime() / 86400000 + 25569, date: c.v as Date };
    default: return EMPTY;
  }
}

/** Opens an .xlsx that already passed checkXlsxBytes. Rows and columns are 1-based, like the client's own reader. */
export function openWorkbook(bytes: Uint8Array): Workbook {
  const wb = XLSX.read(bytes, { type: "array", dense: true, cellNF: true, cellDates: false, cellStyles: false });
  const sheets: SheetInfo[] = wb.SheetNames.map((name, i) => ({ name, visible: !wb.Workbook?.Sheets?.[i]?.Hidden }));
  const cache = new Map<number, Sheet>();

  function load(i: number): Sheet {
    const hit = cache.get(i);
    if (hit) return hit;
    const ws = wb.Sheets[wb.SheetNames[i]];
    if (!ws || !ws["!data"]) {
      const empty: Sheet = { name: wb.SheetNames[i], maxRow: 0, maxCol: 0, v: () => null, cell: () => EMPTY };
      cache.set(i, empty);
      return empty;
    }
    const data = (ws["!data"] ?? []) as (XLSX.CellObject | undefined)[][];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const cell = (r: number, c: number) => (r < 1 || c < 1 ? EMPTY : toCell(data[r - 1]?.[c - 1]));
    const sheet: Sheet = {
      name: wb.SheetNames[i],
      maxRow: range ? range.e.r + 1 : 0,
      maxCol: range ? range.e.c + 1 : 0,
      v: (r, c) => cell(r, c).v,
      cell,
    };
    cache.set(i, sheet);
    return sheet;
  }

  return {
    sheets,
    sheet(ref) {
      const i = typeof ref === "number" ? ref : sheets.findIndex((s) => s.name.trim().toLowerCase() === ref.trim().toLowerCase());
      return Number.isInteger(i) && i >= 0 && i < sheets.length ? load(i) : null;
    },
    visibleSheets: () => sheets.flatMap((s, i) => (s.visible ? [load(i)] : [])),
  };
}
