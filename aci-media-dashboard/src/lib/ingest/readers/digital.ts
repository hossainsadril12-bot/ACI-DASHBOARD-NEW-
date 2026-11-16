import { resolveDigitalBusiness } from "../brands";
import { monthLabel, round, xstr } from "../cells";
import { NeedsBusinessError, ReadError, type ReaderContext, type ReadResult } from "../read-result";
import type { CellValue, Workbook } from "../workbook";

/** Line-by-line port of his parseDigital (template.html 583-605). Spend is in USD. */

const PLATFORMS = ["Meta", "YouTube", "TikTok"] as const;
type Platform = (typeof PLATFORMS)[number];

export type DigitalAd = {
  bz: string; p: Platform; b: string; m: string | null;
  content?: string; link?: string; bid?: string;
  reach?: number; imp?: number; views?: number; eng?: number; clicks?: number; freq?: number; spend?: number; v25?: number; v100?: number;
  p2: string;
};
export type DigitalRawRow = { bz: string; m: string | null; r: (string | number | null)[] };
export type DigitalData = { dig: DigitalAd[]; raw: Record<Platform, DigitalRawRow[]> };

const DCOLS: Record<Platform, string[]> = {
  Meta: ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "CPM", "ThruPlays", "CPV", "Video Play at % 25%", "Video Play at % 50%", "Video Play at % 75%", "Video Play at % 95%", "Video Play at % 100%", "Post Engagements", "CPE", "Clicks", "CTR", "CPC", "Frequency", "VTR (6/10/15 Sec)", "Spent (USD)"],
  YouTube: ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Impressions", "CPM", "TrueView", "CPV", "Video Play at % 25%", "Video Play at % 50%", "Video Play at % 75%", "Video Play at % 100%", "Clicks", "CTR", "CPC", "Unique User", "Avg. Imp. Freq. /User", "Spent (USD)"],
  TikTok: ["Brand", "Month", "Content Type", "Content Link", "Objectives", "Reach", "Impressions", "CPM", "Video views", "CPV", "Video Plays at % 25%", "Video Plays at % 50%", "Video Plays at % 75%", "Video Plays at % 100%", "Clicks", "CTR", "CPC", "Frequency", "Cost"],
};
const DAL: Record<string, string[]> = {
  content: ["content type"], link: ["content link"], bid: ["bid type", "objectives"], reach: ["reach", "unique user"], imp: ["impressions"],
  views: ["thruplays", "trueview", "video views"], eng: ["post engagements"], clicks: ["clicks"], freq: ["frequency", "avg. imp. freq. /user"], spend: ["spent (usd)", "cost"],
};
const MONK: Record<string, string> = { jul: "2026-07", aug: "2026-08", sep: "2026-09", oct: "2026-10", nov: "2026-11", dec: "2026-12", jan: "2027-01", feb: "2027-02", mar: "2027-03", apr: "2027-04", may: "2027-05", jun: "2027-06" };
const TOTAL = /^(grand )?total$/i;

const xnum = (v: CellValue): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; }
  return null;
};

export function dNorm(b: string): string {
  const l = b.toLowerCase();
  if (l.includes("savlon") && !l.includes("savlon men")) return "Savlon Soap";
  if (l.includes("skinzen")) return "SkinZen";
  if (l.includes("shinex")) return "Shinex";
  if (l.includes("neem")) return "Neem";
  if (l.includes("septex") || l.includes("spetex")) return "Septex";
  if (l.startsWith("wonder")) return "Wonder";
  return b.split(" - ")[0].trim();
}

/** Every brand named in column A of the three platform sheets, normalised the way his reader names them. */
function brandsIn(wb: Workbook): string[] {
  const out: string[] = [];
  for (const plat of PLATFORMS) {
    const ws = wb.sheet(plat);
    if (!ws) continue;
    let start = 2; // his parseDigital: row 2 holding numbers is the percentage sub-header, data starts at row 3
    for (let c = 1; c <= ws.maxCol; c++) if (typeof ws.v(2, c) === "number") { start = 3; break; }
    for (let r = start; r <= ws.maxRow; r++) {
      const s = xstr(ws.v(r, 1));
      if (s && !TOTAL.test(s)) out.push(dNorm(s));
    }
  }
  return out;
}

export function readDigital(wb: Workbook, ctx: ReaderContext): ReadResult<DigitalData> {
  const resolved = resolveDigitalBusiness({ brands: brandsIn(wb), fileName: ctx.fileName, chosen: ctx.business ?? null });
  if (!resolved) throw new NeedsBusinessError("Pick the business.");
  const biz = resolved.business;

  const dig: DigitalAd[] = [];
  const raw: DigitalData["raw"] = { Meta: [], YouTube: [], TikTok: [] };
  const warn: string[] = [];
  for (const plat of PLATFORMS) {
    const ws = wb.sheet(plat);
    if (!ws) { warn.push(`No "${plat}" sheet`); continue; }
    const h: Record<string, number> = {};
    let last: string | null = null;
    for (let c = 1; c <= ws.maxCol; c++) {
      const a = ws.v(1, c), b = ws.v(2, c);
      if (a != null && xstr(a)) last = xstr(a);
      const k = typeof b === "number" && last ? `${last} ${Math.round(b * 100)}%` : a != null && xstr(a) ? xstr(a) : null;
      if (k && !(k.toLowerCase() in h)) h[k.toLowerCase()] = c;
    }
    const m: Record<string, number> = {};
    for (const [k, al] of Object.entries(DAL)) for (const a of al) if (a in h) { m[k] = h[a]; break; }
    for (const [hk, c] of Object.entries(h)) {
      if (hk.includes("play") && / 25%$/.test(hk) && !m.v25) m.v25 = c;
      if (hk.includes("play") && / 100%$/.test(hk) && !m.v100) m.v100 = c;
    }
    let start = 2;
    for (let c = 1; c <= ws.maxCol; c++) if (typeof ws.v(2, c) === "number") { start = 3; break; }
    const sp = h["spent (usd)"] || h["cost"], im = h["impressions"];
    let b: string | null = null, mo: string | null = null, n = 0;
    for (let r = start; r <= ws.maxRow; r++) {
      const bv = ws.v(r, 1), mv = ws.v(r, 2);
      if (bv != null && xstr(bv)) { if (TOTAL.test(xstr(bv))) continue; b = xstr(bv); }
      if (mv != null && xstr(mv)) mo = MONK[xstr(mv).toLowerCase().slice(0, 3)] || mo;
      const s_ = sp ? ws.v(r, sp) : null, i_ = im ? ws.v(r, im) : null;
      if (typeof s_ !== "number" && typeof i_ !== "number") continue;
      const o: Record<string, unknown> = { bz: biz, p: plat, b, m: mo };
      for (const [k, c] of Object.entries(m)) {
        const v = ws.v(r, c);
        if (["content", "link", "bid"].includes(k)) { if (v != null && xstr(v)) o[k] = xstr(v); }
        else { const nv = xnum(v); if (nv != null) o[k] = nv; }
      }
      const mm = (b || "").match(/\(([^)]+)\)|\|\s*(.+)$| - (.+)$/);
      if (mm && !o.content && (b || "").toLowerCase().includes("savlon")) o.content = "Master TVC – " + (mm[1] || mm[2] || mm[3]).trim();
      if (mm && !o.content && (b || "").includes(" - ")) o.content = "Master TVC – " + b!.split(" - ")[1].trim();
      const lk = (o.link as string | undefined) || "";
      o.p2 = plat === "Meta" && lk.includes("facebook") ? "Facebook" : plat === "Meta" && lk.includes("instagram") ? "Instagram" : plat;
      o.b = dNorm(b || "");
      dig.push(o as DigitalAd);
      const row = DCOLS[plat].map((k) => {
        const c = h[k.toLowerCase()];
        let v: CellValue = c ? ws.v(r, c) : null;
        if (k === "Brand") v = b;
        if (k === "Month") v = mv != null && xstr(mv) ? xstr(mv) : null;
        if (typeof v === "number") v = round(v, 6);
        if (typeof v === "string") v = v.trim() || null;
        return v as string | number | null;
      });
      if (!row[2] && mm && (b || "").toLowerCase().includes("savlon")) row[2] = "Master TVC – " + (mm[1] || mm[2] || mm[3]).trim();
      row[0] = dNorm(b || "");
      raw[plat].push({ bz: biz, m: mo, r: row });
      n++;
    }
    if (!n) warn.push(`${plat}: no rows with spend or impressions`);
  }
  if (!dig.length) throw new ReadError("No ad rows were found in the Meta, YouTube or TikTok sheets.");
  if (dig.some((o) => !o.m)) warn.push(`${dig.filter((o) => !o.m).length} rows have no month`);
  const spend = dig.reduce((t, o) => t + (o.spend || 0), 0);
  const months = [...new Set(dig.map((o) => o.m).filter((x): x is string => !!x))].sort();
  return {
    type: "digital",
    datasetKey: `digital:${biz}`,
    label: months.length ? `Digital, ${biz}, ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : `Digital, ${biz}`,
    summary: `${biz}: ${dig.length} ads · $${Math.round(spend).toLocaleString("en-US")} spend · ${months.map(monthLabel).join(", ")}`,
    months,
    rowCount: dig.length,
    data: { dig, raw },
    warnings: warn,
    business: { name: biz, source: resolved.source },
  };
}
