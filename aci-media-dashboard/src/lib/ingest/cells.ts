/** Small helpers ported from the client's reader (template.html), so ported readers behave the same. */
export const xstr = (v: unknown): string => (v == null ? "" : String(v).trim());
export const round = (v: number, d: number): number => { const p = 10 ** d; return Math.round(v * p) / p; };
export const sum = <T>(rows: T[], f: (r: T) => number): number => rows.reduce((t, r) => t + f(r), 0);
export const pad2 = (n: number): string => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" → "Oct'26" */
export const monthLabel = (m: string): string => { const [y, mo] = m.split("-"); return `${MON[Number(mo) - 1]}'${y.slice(2)}`; };
