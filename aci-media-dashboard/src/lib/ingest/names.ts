import { normName } from "@/lib/names-normal";
import type { AtlCategory } from "./readers/atl";
import type { BillboardData } from "./readers/billboard";
import type { BillingData } from "./readers/billing";
import type { CalendarData } from "./readers/calendar";
import type { DigitalData } from "./readers/digital";
import type { FyRow } from "./readers/fy";
import type { OohSiteRow } from "./readers/ooh-sites";
import type { ReadResult } from "./read-result";

/** The business and brand names one file uses, for checking against the lists. */
export type FileNames = {
  /** Distinct (by normName), as typed in the file (trimmed), from the file's business column. */
  businesses: string[];
  /** Distinct by normName. business = the row's business as typed, null when the file has none. */
  brands: { name: string; business: string | null }[];
  /** Digital and ATL: the business comes from the admin's pick. */
  needsFileBusiness: boolean;
  /** ATL "Brand Name:" title. */
  atlTitle: string | null;
};

type Pair = { biz: unknown; brand: unknown };

const NOT_NAMES = new Set(["", "others", "total"]);

/** The trimmed name, or null when it is blank, "Others" or "Total". */
function keep(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return NOT_NAMES.has(normName(s)) ? null : s;
}

/** The pairs of (business, brand) cells in one read result. Billing's data.br repeats data.bl's raw columns, so only bl is read. */
function pairsIn(result: ReadResult<unknown>): Pair[] {
  switch (result.type) {
    case "billing": return (result.data as BillingData).bl.map((r) => ({ biz: r[2], brand: r[3] }));
    case "billboard": return (result.data as BillboardData).rows.map((r) => ({ biz: r.biz, brand: r.b }));
    case "calendar": return (result.data as CalendarData).months.flatMap((m) => m.rows.map((r) => ({ biz: r.biz, brand: r.b })));
    case "fy": return (result.data as FyRow[]).map((r) => ({ biz: r.biz, brand: r.b }));
    case "digital": return (result.data as DigitalData).dig.map((r) => ({ biz: null, brand: r.b }));
    case "atl": return (result.data as AtlCategory).own.map((b) => ({ biz: null, brand: b }));
    // The reader joins a site's several brands with " / ".
    case "ooh-sites": return (result.data as OohSiteRow[]).flatMap((r) => String(r.brand ?? "").split(" / ").map((b) => ({ biz: null, brand: b })));
    default: return [];
  }
}

export function namesIn(result: ReadResult<unknown>): FileNames {
  const businesses = new Map<string, string>();
  const brands = new Map<string, { name: string; business: string | null }>();
  for (const p of pairsIn(result)) {
    const biz = keep(p.biz);
    if (biz && !businesses.has(normName(biz))) businesses.set(normName(biz), biz);
    const brand = keep(p.brand);
    if (brand && !brands.has(normName(brand))) brands.set(normName(brand), { name: brand, business: biz });
  }
  return {
    businesses: [...businesses.values()],
    brands: [...brands.values()],
    needsFileBusiness: result.type === "digital" || result.type === "atl",
    atlTitle: result.type === "atl" ? (result.data as AtlCategory).title : null,
  };
}
