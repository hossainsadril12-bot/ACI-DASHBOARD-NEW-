import type { CalendarData } from "@/lib/ingest/readers/calendar";
import { normName } from "@/lib/names-normal";
import { FY_MEDIA, fyMonthLabels, fyMonths, fyName } from "@/lib/manual/rules";
import type { FyMedium } from "@/lib/pages/fy-spend";

// 3.1 Monthly Activity Calendar: the page's numbers, from the stored calendar months. Pure; the page only renders this.

export type CalendarParams = { view: "gantt" | "sheet"; media: FyMedium[]; inactive: boolean; sheet: string | null };

/** The address parameters, allowlisted: anything unexpected falls back to the default. */
export function parseCalendarParams(sp: Record<string, string | string[] | undefined>): CalendarParams {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const asked = str("media").split(",").map((s) => s.trim());
  const media = FY_MEDIA.filter((m) => asked.includes(m));
  const sheet = str("sheet");
  return {
    view: str("view") === "sheet" ? "sheet" : "gantt",
    media: media.length ? media : [...FY_MEDIA],
    inactive: str("inactive") === "1",
    sheet: sheet === "fytd" || /^\d{4}-\d{2}$/.test(sheet) ? sheet : null,
  };
}

/** Sheet view numbers: en-US, 2 to 3 decimals, blank for 0. */
export function formatSheet(n: number): string {
  return n === 0 ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export type CalendarInput = {
  data: CalendarData;
  fyStart: number;
  today: string; // "YYYY-MM" in Dhaka
  businessOf: (name: string) => { slug: string; name: string } | null;
  brandOf: (name: string) => { name: string } | null;
  business: { slug: string; name: string } | null;
  params: CalendarParams;
};
export type Cell = { total: number; media: number[]; lanes: { medium: FyMedium; on: boolean; start: boolean; end: boolean }[] } | null; // null = month not uploaded
export type CalendarView = {
  fyLabel: string;
  monthKeys: string[];
  monthLabels: string[];
  uploaded: boolean[];
  currentIndex: number;
  empty: boolean;
  cards: {
    fytd: number; uploadedCount: number; firstLabel: string; lastLabel: string;
    last: { label: string; total: number; prevLabel: string | null; changePct: number | null };
    activeLast: number; activeFy: number;
    mix: { medium: FyMedium; pct: number }[];
  } | null;
  gantt: {
    media: FyMedium[];
    groups: { name: string; months: (number | null)[]; fytd: number; brands: { name: string; cells: Cell[]; fytd: number }[] }[];
    total: { months: (number | null)[]; fytd: number };
  };
  sheet: {
    choice: string;
    choices: { key: string; label: string }[];
    title: string;
    groups: { name: string; brands: { name: string; v: number[]; t: number }[]; total: { v: number[]; t: number } }[];
    grand: { v: number[]; t: number };
    notes: { tvByBrand: { brand: string; count: number }[]; channels: string[]; digital: string[] } | null;
    notesLabel: string | null;
  };
  chart: { label: string; v: number[]; total: number }[];
};

// 6 decimals only to tame float noise; the one real rounding is at display.
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const tidy = (t: string) => t.trim().replace(/\s+/g, " ");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longMonth = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

type Brand = { name: string; mv: number[][] }; // mv[month][medium], zeros where the brand has no row
type Group = { key: string; name: string; brands: Map<string, Brand> };

export function calendarView(input: CalendarInput): CalendarView {
  const { data, fyStart, today, businessOf, brandOf, business, params } = input;
  const monthKeys = fyMonths(fyStart);
  const monthLabels = fyMonthLabels(fyStart);
  const byKey = new Map(data.months.map((m) => [m.m, m]));
  const uploaded = monthKeys.map((k) => byKey.has(k));
  const upIdx = monthKeys.flatMap((_, i) => (uploaded[i] ? [i] : []));

  // Groups sit where each first appears across all months in month order (before any filter), as in his file.
  const groups: Group[] = [];
  let rowsInBusiness = 0;
  for (const i of upIdx) {
    for (const r of byKey.get(monthKeys[i])!.rows) {
      const biz = businessOf(r.biz);
      const key = biz ? `list:${biz.slug}` : `own:${normName(r.biz)}`;
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, name: biz?.name ?? tidy(r.biz), brands: new Map() }));
      if (business && biz?.slug !== business.slug) continue;
      rowsInBusiness++;
      const name = brandOf(r.b)?.name ?? tidy(r.b);
      const bk = normName(name);
      const b = g.brands.get(bk) ?? { name, mv: monthKeys.map(() => [0, 0, 0, 0]) };
      r.v.forEach((x, n) => { if (n < 4) b.mv[i][n] = r6(b.mv[i][n] + x); });
      g.brands.set(bk, b);
    }
  }
  const allBrands = groups.flatMap((g) => [...g.brands.values()]);
  const monthMedia = (i: number) => FY_MEDIA.map((_, n) => r6(sum(allBrands.map((b) => b.mv[i][n]))));

  const chart = upIdx.map((i) => { const v = monthMedia(i); return { label: monthLabels[i], v, total: r6(sum(v)) }; });

  let cards: CalendarView["cards"] = null;
  if (upIdx.length) {
    const last = upIdx[upIdx.length - 1];
    const prev = upIdx.length > 1 ? upIdx[upIdx.length - 2] : null;
    const lastMedia = monthMedia(last);
    const lastTotal = r6(sum(lastMedia));
    const prevTotal = prev === null ? 0 : r6(sum(monthMedia(prev)));
    cards = {
      fytd: r6(sum(chart.map((c) => c.total))),
      uploadedCount: upIdx.length,
      firstLabel: monthLabels[upIdx[0]],
      lastLabel: monthLabels[last],
      last: {
        label: monthLabels[last], total: lastTotal,
        prevLabel: prev === null ? null : monthLabels[prev],
        changePct: prevTotal ? Math.round(((lastTotal - prevTotal) / prevTotal) * 1000) / 10 : null,
      },
      activeLast: allBrands.filter((b) => sum(b.mv[last]) > 0).length,
      activeFy: allBrands.filter((b) => upIdx.some((i) => sum(b.mv[i]) > 0)).length,
      mix: FY_MEDIA.map((medium, n) => ({ medium, pct: lastTotal ? Math.round((lastMedia[n] / lastTotal) * 100) : 0 })),
    };
  }

  // Gantt: only the switched-on media count.
  const on = params.media.map((m) => FY_MEDIA.indexOf(m));
  const ganttGroups: CalendarView["gantt"]["groups"] = [];
  for (const g of groups) {
    const brands = [...g.brands.values()].map((b) => {
      const live = (i: number, n: number) => i >= 0 && i < 12 && uploaded[i] && b.mv[i][n] > 0;
      const cells: Cell[] = monthKeys.map((_, i) => uploaded[i]
        ? {
            total: r6(sum(on.map((n) => b.mv[i][n]))),
            media: [...b.mv[i]],
            lanes: on.map((n) => ({ medium: FY_MEDIA[n], on: live(i, n), start: live(i, n) && !live(i - 1, n), end: live(i, n) && !live(i + 1, n) })),
          }
        : null);
      return { name: b.name, cells, fytd: r6(sum(cells.map((c) => c?.total ?? 0))) };
    }).filter((b) => params.inactive || b.cells.some((c) => c && c.total > 0));
    if (!brands.length) continue;
    const months = monthKeys.map((_, i) => (uploaded[i] ? r6(sum(brands.map((b) => b.cells[i]!.total))) : null));
    ganttGroups.push({ name: g.name, months, fytd: r6(sum(months.map((x) => x ?? 0))), brands });
  }
  const totalMonths = monthKeys.map((_, i) => (uploaded[i] ? r6(sum(ganttGroups.map((g) => g.months[i]!))) : null));

  // Sheet: the choice only for now; its table and notes come with the Sheet view.
  const latest = upIdx.length ? monthKeys[upIdx[upIdx.length - 1]] : null;
  const choice = params.sheet === "fytd" ? "fytd" : params.sheet && byKey.has(params.sheet) && monthKeys.includes(params.sheet) ? params.sheet : latest ?? "fytd";
  const range = upIdx.length ? ` (${upIdx.length > 1 ? `${monthLabels[upIdx[0]]} to ` : ""}${monthLabels[upIdx[upIdx.length - 1]]})` : "";

  return {
    fyLabel: fyName(fyStart),
    monthKeys,
    monthLabels,
    uploaded,
    currentIndex: monthKeys.indexOf(today),
    empty: rowsInBusiness === 0,
    cards,
    gantt: { media: [...params.media], groups: ganttGroups, total: { months: totalMonths, fytd: r6(sum(totalMonths.map((x) => x ?? 0))) } },
    sheet: {
      choice,
      choices: [...upIdx.map((i) => ({ key: monthKeys[i], label: monthLabels[i] })), { key: "fytd", label: "FY to date" }],
      title: choice === "fytd" ? `FY ${fyName(fyStart)} to date${range}` : longMonth(choice),
      groups: [],
      grand: { v: [0, 0, 0, 0], t: 0 },
      notes: null,
      notesLabel: null,
    },
    chart,
  };
}
