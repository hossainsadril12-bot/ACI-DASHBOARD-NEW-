import type { FyRow } from "@/lib/ingest/readers/fy";
import { normName } from "@/lib/names-normal";
import { FY_MEDIA, fyMonthLabels, fyName } from "@/lib/manual/rules";
import { r6, sum, tidy } from "@/lib/pages/numbers";

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
  cards: { medium: FyMedium | "Other"; fytd: number; py: number }[];
  groups: { name: string; lines: FyLine[]; total: FyLine }[];
  grandTotal: FyLine;
  maxCell: number;
  empty: boolean;
};

function line(name: string, parts: { m: number[]; py: number }[], reported: number): FyLine {
  const m = Array.from({ length: 12 }, (_, i) => (i < reported ? r6(sum(parts.map((p) => p.m[i] ?? 0))) : null));
  const fytd = r6(sum(m.map((x) => x ?? 0)));
  const py = r6(sum(parts.map((p) => p.py)));
  return { name, m, fytd, py, pct: py ? Math.round((fytd / py) * 100) : null };
}

export function fySpendView(input: FySpendInput): FySpendView {
  const { rows, fyStart, businessOf, brandOf, business, media } = input;
  const labels = fyMonthLabels(fyStart);
  let reported = 0;
  for (let i = 0; i < 12; i++) if (rows.some((r) => r.m[i])) reported = i + 1;

  // Each row with its business group (list business, or its own name) and shown brand name.
  const placed = rows.map((r) => {
    const biz = businessOf(r.biz);
    return { r, groupKey: biz ? `list:${biz.slug}` : `own:${normName(r.biz)}`, slug: biz?.slug ?? null, bizName: biz?.name ?? tidy(r.biz), brand: brandOf(r.b)?.name ?? tidy(r.b) };
  });
  const inBusiness = business ? placed.filter((p) => p.slug === business.slug) : placed;

  const cardOf = (medium: FyMedium | "Other", mine: typeof placed) => ({ medium, fytd: r6(sum(mine.map((p) => sum(p.r.m.slice(0, reported))))), py: r6(sum(mine.map((p) => p.r.py))) });
  const cards = FY_MEDIA.map((medium) => cardOf(medium, inBusiness.filter((p) => p.r.med === medium)));
  const other = inBusiness.filter((p) => !(FY_MEDIA as readonly string[]).includes(p.r.med));
  if (other.length) cards.push(cardOf("Other", other));

  const shown = media === "All" ? inBusiness : inBusiness.filter((p) => p.r.med === media);
  // Groups sit where each first appears in the whole file (before any filter), as in his Excel.
  const order: { key: string; name: string }[] = [];
  for (const p of placed) {
    if (order.some((o) => o.key === p.groupKey)) continue;
    order.push({ key: p.groupKey, name: p.bizName });
  }
  const groups: FySpendView["groups"] = [];
  for (const g of order) {
    const inGroup = shown.filter((p) => p.groupKey === g.key);
    if (!inGroup.length) continue;
    const byBrand = new Map<string, { name: string; parts: FyRow[] }>();
    for (const p of inGroup) {
      const k = normName(p.brand);
      const e = byBrand.get(k) ?? { name: p.brand, parts: [] };
      e.parts.push(p.r);
      byBrand.set(k, e);
    }
    const lines = [...byBrand.values()].map((e) => line(e.name, e.parts, reported)).filter((l) => l.fytd || l.py).sort((a, b) => b.fytd - a.fytd);
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

/** The line under the table title: the not-reported hint only while some month is still missing. */
export function tableNote(view: { reported: number; lastReportedLabel: string | null }): string {
  return view.reported > 0 && view.reported < 12 && view.lastReportedLabel
    ? `Darker cells = higher spend · months after ${view.lastReportedLabel} not reported yet`
    : "Darker cells = higher spend";
}
