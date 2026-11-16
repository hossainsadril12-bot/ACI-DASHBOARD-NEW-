import { xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

/** Port of the reading part of his masterRead (template.html 1243-1254). The merge with existing sites is Phase 4. */

export type OohSiteRow = {
  sl: number | ""; location: string; brand: string; size: string; start: string; end: string;
  cost: number | ""; vendor: string; lat: number | ""; lng: number | ""; city?: string;
};

export function readOohSites(wb: Workbook): ReadResult<OohSiteRow[]> {
  const ws = wb.visibleSheets()[0] ?? wb.sheet(0);
  if (!ws) throw new ReadError("No sheet was found in this file.");

  let hr = 0;
  for (let r = 1; r <= 12 && !hr; r++) {
    let a = false, b = false;
    for (let c = 1; c <= ws.maxCol; c++) {
      const t = xstr(ws.v(r, c)).toLowerCase();
      if (/location/.test(t)) a = true;
      if (/^lat/.test(t)) b = true;
    }
    if (a && b) hr = r;
  }
  if (!hr) throw new ReadError('Couldn\'t find the header row (it needs "OOH Location" and "Latitude").');

  const col: Partial<Record<"sl" | "location" | "brand" | "size" | "start" | "end" | "cost" | "vendor" | "lat" | "lng" | "city", number>> = {};
  for (let c = 1; c <= ws.maxCol; c++) {
    const t = xstr(ws.v(hr, c)).toLowerCase().trim();
    if (!t) continue;
    const set = (k: keyof typeof col): void => { if (!col[k]) col[k] = c; };
    if (/^sl/.test(t)) set("sl");
    else if (/location/.test(t)) set("location");
    else if (/brand|display/.test(t)) set("brand");
    else if (/size/.test(t)) set("size");
    else if (/period/.test(t)) { set("start"); if (!col.end) col.end = c + 1; }
    else if (/^start/.test(t)) set("start");
    else if (/^end/.test(t)) set("end");
    else if (/amount|cost/.test(t)) set("cost");
    else if (/vendor/.test(t)) set("vendor");
    else if (/^lat/.test(t)) set("lat");
    else if (/^lon|^lng/.test(t)) set("lng");
    else if (/city|district/.test(t)) set("city");
  }

  const val = (r: number, c: number | undefined) => (c ? ws.v(r, c) : null);
  const dt = (r: number, c: number | undefined): string => {
    if (!c) return "";
    const cl = ws.cell(r, c);
    if (cl.date) return cl.date.toISOString().slice(0, 10);
    const t = xstr(cl.v).trim();
    if (!t) return t;
    const d = new Date(t);
    return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : t;
  };

  const rows: OohSiteRow[] = [];
  const warnings: string[] = [];
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    const loc = xstr(val(r, col.location)).replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (!loc) continue;
    const num = (c: number | undefined): number | "" => {
      const v = val(r, c);
      if (typeof v === "number") return v;
      if (v != null && v !== "" && isFinite(+String(v).replace(/,/g, ""))) return +String(v).replace(/,/g, "");
      return "";
    };
    const o: OohSiteRow = {
      sl: num(col.sl) || "", location: loc,
      brand: xstr(val(r, col.brand)).split("/").map((s) => s.trim()).filter(Boolean).join(" / "),
      size: xstr(val(r, col.size)).replace(/\s+/g, " ").trim(),
      start: dt(r, col.start), end: dt(r, col.end),
      cost: num(col.cost), vendor: xstr(val(r, col.vendor)).trim(), lat: num(col.lat), lng: num(col.lng),
    };
    if (col.city) o.city = xstr(val(r, col.city)).trim();
    if (o.cost !== "" && typeof o.cost === "number") o.cost = Math.round(o.cost * 100) / 100;
    const tag = `Sl ${o.sl || "?"} ${loc}`;
    if (o.lat === "" || o.lng === "") warnings.push(`${tag}: no latitude/longitude, so no map pin`);
    else if (o.lat < 20.5 || o.lat > 26.7 || o.lng < 88 || o.lng > 92.8) warnings.push(`${tag}: coordinates are outside Bangladesh`);
    if (o.start && o.end && o.end < o.start) warnings.push(`${tag}: end date is before start date`);
    if (!o.cost) warnings.push(`${tag}: no amount`);
    rows.push(o);
  }
  if (!rows.length) throw new ReadError("No billboard rows were found under the header.");

  return {
    type: "ooh-sites",
    datasetKey: "ooh-sites",
    label: `OOH master sheet, ${rows.length} sites`,
    summary: `${rows.length} billboard rows read.`,
    months: [],
    rowCount: rows.length,
    data: rows,
    warnings,
  };
}
