export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function formatMillion(taka: number): string {
  return (taka / 1_000_000).toFixed(2);
}

export function formatTaka(taka: number): string {
  return Math.round(taka).toLocaleString("en-IN");
}

/** Whole numbers such as people reached or impressions, with en-IN grouping. */
export const formatCount = formatTaka;

/** Small rates such as cost per view or CPM, always two decimals. */
export function formatRate(taka: number): string {
  return taka.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const BDT_MN = "BDT Mn";

/** Page amounts: taka shown as millions, 2 decimals, always with the unit (PRD currency rule). */
export function formatBdtMn(taka: number): string {
  const mn = taka / 1_000_000;
  return `${mn.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${BDT_MN}`;
}
