import * as XLSX from "xlsx";

export type CellValue = string | number | boolean | null;
export type Cell = { v: CellValue; date: Date | null; fill: string | null }; // fill = "RRGGBB" upper case, only when opened with styles
export type Sheet = { name: string; maxRow: number; maxCol: number; v(r: number, c: number): CellValue; cell(r: number, c: number): Cell };
export type SheetInfo = { name: string; visible: boolean };
export type Workbook = { sheets: SheetInfo[]; sheet(ref: string | number): Sheet | null; visibleSheets(): Sheet[] };

const EMPTY: Cell = { v: null, date: null, fill: null };

/** His rule (template.html readXlsx): a pattern that is set and not "none", with an rgb colour; the last 6 hex digits, upper case. */
function fillOf(c: XLSX.CellObject): string | null {
  const s = (c as XLSX.CellObject & { s?: { patternType?: string; fgColor?: { rgb?: string } } }).s;
  const rgb = s?.fgColor?.rgb;
  return s?.patternType && s.patternType !== "none" && rgb ? String(rgb).slice(-6).toUpperCase() : null;
}

function toCell(c: XLSX.CellObject | undefined, styles: boolean): Cell {
  if (!c) return EMPTY;
  const fill = styles ? fillOf(c) : null;
  switch (c.t) {
    case "s": return { v: String(c.v), date: null, fill };
    case "b": return { v: Boolean(c.v), date: null, fill };
    case "e": return { v: c.w ?? null, date: null, fill };
    case "n": {
      const v = Number(c.v);
      // Same as his reader: a number with a date format is an Excel date (days since 1899-12-30, UTC).
      const isDate = typeof c.z === "string" && XLSX.SSF.is_date(c.z);
      return { v, date: isDate ? new Date(Math.round((v - 25569) * 86400000)) : null, fill };
    }
    case "d": return { v: (c.v as Date).getTime() / 86400000 + 25569, date: c.v as Date, fill };
    default: return fill ? { v: null, date: null, fill } : EMPTY;
  }
}

/** Opens an .xlsx that already passed checkXlsxBytes. Rows and columns are 1-based, like the client's own reader. */
export function openWorkbook(bytes: Uint8Array, opts: { styles?: boolean } = {}): Workbook {
  const styles = !!opts.styles;
  const wb = XLSX.read(bytes, { type: "array", dense: true, cellNF: true, cellDates: false, cellStyles: styles });
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
    const cell = (r: number, c: number) => (r < 1 || c < 1 ? EMPTY : toCell(data[r - 1]?.[c - 1], styles));
    // !ref comes from the file's <dimension>, which a crafted file can stretch to A1:XFD1048576; never loop past the data.
    const longestRow = data.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
    const sheet: Sheet = {
      name: wb.SheetNames[i],
      maxRow: range ? Math.min(range.e.r + 1, data.length) : 0,
      maxCol: range ? Math.min(range.e.c + 1, longestRow) : 0,
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
