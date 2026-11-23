import type { FyRow } from "@/lib/ingest/readers/fy";
import { FY_MEDIA, fyMonthLabels, fyName } from "@/lib/manual/rules";

// 3.2 FY Media Spend: the page's numbers, from the stored fy rows. Pure; the page only renders this.

export type FyMedium = (typeof FY_MEDIA)[number];
export type MediaChoice = "All" | FyMedium;

export function parseMedia(v: unknown): MediaChoice {
  return typeof v === "string" && (FY_MEDIA as readonly string[]).includes(v) ? (v as FyMedium) : "All";
}

export function formatMn(n: number): string {
  const text = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${/^-[0.,]+$/.test(text) ? text.slice(1) : text} BDT Mn`;
}

export type FySpendInput = {
  rows: FyRow[];
  fyStart: number;
  businesses: { slug: string; name: string }[];
  businessOf: (name: string) => { slug: string; name: string } | null;
  brandOf: (name: string) => { name: string } | null;
  business: { slug: string; name: string } | null;
  media: MediaChoice;
};
export type FyLine = { name: string; m: (number | null)[]; fytd: number; py: number; pct: number | null };
export type FySpendView = {
  fyLabel: string;
  lastFyLabel: string;
  monthLabels: string[];
  reported: number;
  lastReportedLabel: string | null;
  cards: { medium: FyMedium; fytd: number; py: number }[];
  groups: { name: string; lines: FyLine[]; total: FyLine }[];
  grandTotal: FyLine;
  maxCell: number;
  empty: boolean;
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function line(name: string, parts: { m: number[]; py: number }[], reported: number): FyLine {
  const m = Array.from({ length: 12 }, (_, i) => (i < reported ? r4(sum(parts.map((p) => p.m[i] ?? 0))) : null));
  const fytd = r4(sum(m.map((x) => x ?? 0)));
  const py = r4(sum(parts.map((p) => p.py)));
  return { name, m, fytd, py, pct: py ? Math.round((fytd / py) * 100) : null };
}

export function fySpendView(input: FySpendInput): FySpendView {
  const { rows, fyStart, businesses, businessOf, brandOf, business, media } = input;
  const labels = fyMonthLabels(fyStart);
  let reported = 0;
  for (let i = 0; i < 12; i++) if (rows.some((r) => r.m[i])) reported = i + 1;

  // Each row with its business group (list business, or its own name) and shown brand name.
  const placed = rows.map((r) => {
    const biz = businessOf(r.biz);
    return { r, groupKey: biz ? `list:${biz.slug}` : `own:${r.biz}`, groupName: biz ? biz.name : r.biz, slug: biz?.slug ?? null, brand: brandOf(r.b)?.name ?? r.b };
  });
  const inBusiness = business ? placed.filter((p) => p.slug === business.slug) : placed;

  const cards = FY_MEDIA.map((medium) => {
    const mine = inBusiness.filter((p) => p.r.med === medium);
    return { medium, fytd: r4(sum(mine.map((p) => sum(p.r.m.slice(0, reported))))), py: r4(sum(mine.map((p) => p.r.py))) };
  });

  const shown = media === "All" ? inBusiness : inBusiness.filter((p) => p.r.med === media);
  const order = [
    ...businesses.map((b) => ({ key: `list:${b.slug}`, name: b.name })),
    ...[...new Set(shown.filter((p) => p.groupKey.startsWith("own:")).map((p) => p.groupKey))].map((key) => ({ key, name: key.slice(4) })),
  ];
  const groups: FySpendView["groups"] = [];
  for (const g of order) {
    const inGroup = shown.filter((p) => p.groupKey === g.key);
    if (!inGroup.length) continue;
    const byBrand = new Map<string, FyRow[]>();
    for (const p of inGroup) byBrand.set(p.brand, [...(byBrand.get(p.brand) ?? []), p.r]);
    const lines = [...byBrand].map(([name, parts]) => line(name, parts, reported)).filter((l) => l.fytd || l.py).sort((a, b) => b.fytd - a.fytd);
    if (!lines.length) continue;
    groups.push({ name: g.name, lines, total: line(`${g.name} total`, inGroup.map((p) => p.r), reported) });
  }
  const maxCell = Math.max(0, ...groups.flatMap((g) => g.lines.flatMap((l) => l.m.map((x) => x ?? 0))));
  return {
    fyLabel: fyName(fyStart),
    lastFyLabel: fyName(fyStart - 1),
    monthLabels: labels,
    reported,
    lastReportedLabel: reported ? labels[reported - 1] : null,
    cards,
    groups,
    grandTotal: line("Grand total", shown.map((p) => p.r), reported),
    maxCell,
    empty: groups.length === 0,
  };
}
