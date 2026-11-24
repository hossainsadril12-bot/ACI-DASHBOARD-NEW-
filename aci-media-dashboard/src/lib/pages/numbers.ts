// Small number and text helpers shared by the page builders.

/** 6 decimals only to tame float noise; the one real rounding is at display. */
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** A name from the file, trimmed and with runs of spaces made one. */
export const tidy = (t: string) => t.trim().replace(/\s+/g, " ");
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
