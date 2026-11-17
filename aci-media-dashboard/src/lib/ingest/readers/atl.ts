import { monthLabel, pad2, round, sum, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

export type AtlRow = { b: string; grp: number; acd: number; ngrp: number; sp: number; sov: number; soe: number; reach: number; spots: number; cprp: number };
export type AtlCategory = { name: string; biz: string; title: string; category: string; tg: string; pop: number; own: string[]; brands: string[]; months: Record<string, AtlRow[]> };

/** [key, dashboard name, business, title pattern, own-brand pattern]: his ATLCATS. */
export const ATL_CATEGORIES: [string, string, string, RegExp, RegExp][] = [
  ["soap", "Savlon Soap", "Toiletries", /savlon soap/i, /^savlon soap/i],
  ["septex", "Septex Antiseptic Bar", "Toiletries", /septex/i, /septex/i],
  ["handwash", "Savlon Hand Wash", "Toiletries", /hand ?wash/i, /^savlon/i],
  ["antiseptic", "Savlon Antiseptic Liquid", "Toiletries", /antiseptic/i, /^savlon/i],
  ["babysoft", "Baby Soft", "Toiletries", /baby ?soft/i, /^baby soft/i],
  ["sbwipes", "Savlon Baby Wipes", "Toiletries", /savlon baby wipes/i, /^savlon/i],
  ["twipes", "Twinkle Baby Wipes", "Hygiene", /twinkle baby wipes/i, /^twinkle/i],
  ["freedom", "Freedom Sanitary Napkin", "Hygiene", /freedom/i, /^freedom/i],
  ["diaper", "Twinkle Baby Diaper", "Hygiene", /diaper/i, /twinkle/i],
  ["salt", "ACI Pure Salt", "Salt", /salt/i, /^aci pure salt/i],
  ["mustard", "ACI Pure Mustard Oil", "Others", /mustard/i, /^aci pure mustard/i],
  ["rice", "ACI Pure Fortified Rice", "Others", /rice/i, /^aci pure/i],
  ["spice", "ACI Pure Spices", "Others", /spice|masala/i, /^aci pure/i],
];
const MON3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_MONTH_GRP = 3000;

export function readAtl(wb: Workbook): ReadResult<AtlCategory> {
  const ws = wb.visibleSheets()[0] ?? wb.sheet(0);
  if (!ws) throw new ReadError("The file has no sheets.");
  const warnings: string[] = [];

  let title = "", category = "", tg = "", pop = 0;
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 3; c++) {
    const t = xstr(ws.v(r, c));
    if (/^brand( name)?\s*:/i.test(t)) title = t.replace(/^brand( name)?\s*:\s*/i, "").trim();
    else if (/^category\s*:/i.test(t)) category = t.replace(/^category\s*:\s*/i, "").trim();
    else if (/^tg\b/i.test(t)) tg = t.replace(/^tg\s*:?\s*/i, "").trim();
    else if (/population|tg size/i.test(t)) { const n = Number(t.replace(/[^\d]/g, "")); if (n) pop = n; }
  }
  if (!title) throw new ReadError(`Couldn't find the "Brand Name:" line at the top of sheet "${ws.name}".`);
  const C = ATL_CATEGORIES.find((c) => c[3].test(title) && !(c[0] === "antiseptic" && /septex/i.test(title)));
  if (!C) throw new ReadError(`"${title}" doesn't match any ATL category on the dashboard (Savlon Soap, Septex, Hand Wash, Antiseptic Liquid, Baby Soft, Savlon/Twinkle Baby Wipes, Freedom, Diaper, Salt, Mustard Oil, Rice, Spices).`);

  // Header row: "Brand Name" in column A (dashboard format) or "Brand" in column B (category format).
  let hr = 0, bc = 1, mr = 0;
  for (let r = 1; r <= 15 && !hr; r++) {
    if (/^brand name$/i.test(xstr(ws.v(r, 1)))) { hr = r + 1; bc = 1; mr = r; }
    else if (/^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; bc = 2; mr = r - 1; }
  }
  if (!hr) throw new ReadError('The header row with "Brand Name" or "Brand" wasn\'t found.');

  const blocks: { c: number; m: string }[] = [];
  let yr: number | null = null;
  for (let c = bc + 1; c <= ws.maxCol; c++) {
    const cl = ws.cell(mr, c);
    let m: string | null = null;
    if (bc === 2) { const y = ws.v(mr - 1, c); if (typeof y === "number" && y > 2000 && y < 2100) yr = y; }
    if (cl.date) m = `${cl.date.getUTCFullYear()}-${pad2(cl.date.getUTCMonth() + 1)}`;
    else {
      const t = xstr(cl.v).toLowerCase().trim();
      const mm = t.match(/^([a-z]{3})[a-z]*\s*[’']?\s*(\d{2,4})?$/);
      if (mm && MON3.includes(mm[1])) { let y = mm[2] ? Number(mm[2]) : yr; if (y && y < 100) y += 2000; if (y) m = `${y}-${pad2(MON3.indexOf(mm[1]) + 1)}`; }
      else if (t) m = "skip";
    }
    if (m) blocks.push({ c, m });
  }
  let prev: string | null = null;
  for (const bk of blocks) {
    if (bk.m === "skip") continue;
    if (prev && bk.m <= prev) {
      let [y, mo] = prev.split("-").map(Number);
      mo++; if (mo > 12) { mo = 1; y++; }
      const nx = `${y}-${pad2(mo)}`;
      if (nx.slice(5) === bk.m.slice(5)) { warnings.push(`A month header reads ${monthLabel(bk.m)} but sits after ${monthLabel(prev)}; read as ${monthLabel(nx)}.`); bk.m = nx; }
    }
    prev = bk.m;
  }

  const months: Record<string, AtlRow[]> = {};
  blocks.forEach((bk, i) => {
    if (bk.m === "skip") return;
    const end = (blocks[i + 1] ?? { c: ws.maxCol + 1 }).c;
    const hd: Record<string, number> = {};
    for (let c = bk.c; c < end; c++) {
      const h = xstr(ws.v(hr, c)).toLowerCase().replace(/\s+/g, " ").replace(/ %/, "%").trim();
      if (h && !(h in hd)) hd[h] = c;
    }
    const g = (r: number, ...ks: string[]) => { for (const k of ks) { const col = hd[k]; if (col) { const v = ws.v(r, col); if (typeof v === "number") return v; } } return 0; };
    const rows: AtlRow[] = [];
    for (let r = hr + 1; r <= ws.maxRow; r++) {
      const b = xstr(ws.v(r, bc)).replace(/\s+/g, " ").trim();
      if (/^(total|note|source)/i.test(b)) break;
      if (!b) continue;
      const row: AtlRow = {
        b, grp: round(g(r, "grp"), 1), acd: round(g(r, "acd"), 1), ngrp: round(g(r, "ngrp"), 1),
        sp: Math.round(g(r, "spend") || g(r, "spend mn") * 1e6), sov: round(g(r, "sov%"), 4), soe: round(g(r, "soe%"), 4),
        reach: round(g(r, "1+ reach"), 3), spots: Math.trunc(g(r, "total spot", "total spots")), cprp: Math.round(g(r, "cprp")),
      };
      if (row.grp > 0 || row.sp > 0) rows.push(row);
    }
    if (rows.length) {
      const tn = sum(rows, (r) => r.ngrp), tgrp = sum(rows, (r) => r.grp), ts = sum(rows, (r) => r.sp);
      rows.forEach((r) => { r.sov = round(tn ? r.ngrp / tn : tgrp ? r.grp / tgrp : 0, 4); r.soe = round(ts ? r.sp / ts : 0, 4); });
      months[bk.m] = rows;
    }
  });
  const ms = Object.keys(months).sort();
  if (!ms.length) throw new ReadError(`No months with TV activity were found for ${title}.`);

  const allB: string[] = [];
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    const b = xstr(ws.v(r, bc)).replace(/\s+/g, " ").trim();
    if (/^(total|note|source)/i.test(b)) break;
    if (b && !allB.includes(b)) allB.push(b);
  }
  const own = allB.filter((b) => C[4].test(b));
  if (!own.length) warnings.push(`Couldn't find ${C[1]}'s own row in the brand list; every brand is treated as a competitor.`);

  for (const m of ms) for (const r of months[m]) {
    if (r.grp > MAX_MONTH_GRP) warnings.push(`${r.b} has ${r.grp.toLocaleString("en-US")} GRP in ${monthLabel(m)}, more than 3,000 in one month. Please check the file.`);
    if (r.reach > 1) warnings.push(`${r.b} has 1+ Reach above 100% in ${monthLabel(m)}. Please check the file.`);
  }

  const brandsOnAir = new Set(ms.flatMap((m) => months[m].map((r) => r.b))).size;
  return {
    type: "atl",
    datasetKey: `atl:${C[0]}`,
    label: `ATL, ${C[1]}, ${monthLabel(ms[0])} to ${monthLabel(ms[ms.length - 1])}`,
    summary: `${C[1]} · ${ms.length} months (${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}) · ${brandsOnAir} brands on air`,
    months: ms,
    rowCount: sum(ms, (m) => months[m].length),
    data: { name: C[1], biz: C[2], title, category, tg, pop, own, brands: allB, months },
    warnings,
  };
}
