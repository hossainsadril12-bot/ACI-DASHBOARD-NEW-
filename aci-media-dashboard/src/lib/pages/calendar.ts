import type { CalendarData } from "@/lib/ingest/readers/calendar";
import { normName } from "@/lib/names-normal";
import { FY_MEDIA, fyMonthLabels, fyMonths, fyName } from "@/lib/manual/rules";
import { formatMn, type FyMedium } from "@/lib/pages/fy-spend";
import { r6, sum, tidy } from "@/lib/pages/numbers";
import { formatMonth, isMonth } from "@/lib/month";

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
    sheet: sheet === "fytd" || isMonth(sheet) ? sheet : null,
  };
}

/** Sheet view numbers: en-US, 2 to 3 decimals, blank for 0. */
export function formatSheet(n: number): string {
  return n === 0 ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

const list = (t: string | undefined) => (t ?? "").split(",").map((s) => tidy(s)).filter(Boolean);

/**
 * The notes at the bottom of a month sheet. TV counts like "Leona: 09 ; Twinkle Baby Diaper: 12" split on ";" and
 * also on "," (his July sheet mixes both), then on the last ":" of each part; parts without a brand or a number are skipped.
 */
export function parseNotes(notes: { tvCount?: string; channels?: string; digital?: string }): { tvByBrand: { brand: string; count: number }[]; channels: string[]; digital: string[] } {
  const tvByBrand = (notes.tvCount ?? "").split(/[;,]/).flatMap((part) => {
    const at = part.lastIndexOf(":");
    const brand = tidy(part.slice(0, Math.max(at, 0)));
    const count = part.slice(at + 1).trim();
    return at >= 0 && brand && /^\d+$/.test(count) ? [{ brand, count: Number(count) }] : [];
  });
  return { tvByBrand, channels: list(notes.channels?.split(/\r?\n/)[0]), digital: list(notes.digital) };
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

/** The /calendar address for these params. Defaults are left out, so the plain page is "/calendar". */
export function calendarHref(p: CalendarParams): string {
  const media = FY_MEDIA.filter((m) => p.media.includes(m));
  const parts = [
    p.view === "sheet" ? "view=sheet" : "",
    media.length && media.length < FY_MEDIA.length ? `media=${media.join(",")}` : "",
    p.inactive ? "inactive=1" : "",
    p.sheet ? `sheet=${encodeURIComponent(p.sheet)}` : "",
  ].filter(Boolean);
  return parts.length ? `/calendar?${parts.join("&")}` : "/calendar";
}

/** The Gantt media after switching one, in FY_MEDIA order; null when that would switch off the last one. */
export function toggleMedium(media: FyMedium[], m: FyMedium): FyMedium[] | null {
  const next = FY_MEDIA.filter((x) => (x === m ? !media.includes(x) : media.includes(x)));
  return next.length ? next : null;
}

type Cards = NonNullable<CalendarView["cards"]>;

/** FY to date card: "4 months: Jul'26 to Oct'26", or "1 month: Jul'26". */
export function monthsNote(c: Cards): string {
  return c.uploadedCount === 1 ? `1 month: ${c.firstLabel}` : `${c.uploadedCount} months: ${c.firstLabel} to ${c.lastLabel}`;
}

/** Latest month card: "▲ 12.3% vs Sep'26", "▼ 4.0% vs Sep'26", or "Latest month" with nothing to compare. */
export function changeNote(last: Cards["last"]): string {
  if (last.changePct === null || last.prevLabel === null) return "Latest month";
  const arrow = last.changePct > 0 ? "▲ " : last.changePct < 0 ? "▼ " : "";
  return `${arrow}${Math.abs(last.changePct).toFixed(1)}% vs ${last.prevLabel}`;
}

/** A Gantt brand cell's hover text: brand and month, one line per medium on, then the total; or No activity. */
export function cellTitle(brand: string, label: string, cell: NonNullable<Cell>): string {
  const on = cell.lanes.filter((l) => l.on).map((l) => `${l.medium}: ${formatMn(cell.media[FY_MEDIA.indexOf(l.medium)])}`);
  return [`${brand} · ${label}`, ...(on.length ? [...on, `Total: ${formatMn(cell.total)}`] : ["No activity"])].join("\n");
}

/** A change % to 1 decimal, half away from zero, never -0. */
const pct1 = (x: number) => { const a = Math.round(Math.abs(x) * 10) / 10; return a === 0 ? 0 : Math.sign(x) * a; };

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
  // A brand listed under two businesses is one brand for the owner.
  const activeCount = (live: (b: Brand) => boolean) => new Set(allBrands.filter(live).map((b) => normName(b.name))).size;

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
        changePct: prevTotal ? pct1(((lastTotal - prevTotal) / prevTotal) * 100) : null,
      },
      activeLast: activeCount((b) => sum(b.mv[last]) > 0),
      activeFy: activeCount((b) => upIdx.some((i) => sum(b.mv[i]) > 0)),
      mix: FY_MEDIA.map((medium, n) => ({ medium, pct: lastTotal ? Math.round((lastMedia[n] / lastTotal) * 100) : 0 })),
    };
  }

  // Gantt: only the switched-on media count. Normalised here too, whoever built the params.
  const asked = FY_MEDIA.filter((m) => params.media.includes(m));
  const media = asked.length ? asked : [...FY_MEDIA];
  const on = media.map((m) => FY_MEDIA.indexOf(m));
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

  // Sheet: one uploaded month or FY to date, every brand listed, the Business filter only (never the media toggles).
  const latest = upIdx.length ? monthKeys[upIdx[upIdx.length - 1]] : null;
  const choice = params.sheet === "fytd" ? "fytd" : params.sheet && byKey.has(params.sheet) && monthKeys.includes(params.sheet) ? params.sheet : latest ?? "fytd";
  const range = upIdx.length ? ` (${upIdx.length > 1 ? `${monthLabels[upIdx[0]]} to ` : ""}${monthLabels[upIdx[upIdx.length - 1]]})` : "";
  const ci = choice === "fytd" ? -1 : monthKeys.indexOf(choice);
  const line = (v: number[]) => ({ v, t: r6(sum(v)) });
  const addUp = (vs: number[][]) => line(FY_MEDIA.map((_, n) => r6(sum(vs.map((v) => v[n])))));
  const sheetGroups = groups.filter((g) => g.brands.size).map((g) => {
    const brands = [...g.brands.values()].map((b) => ({ name: b.name, ...(ci >= 0 ? line([...b.mv[ci]]) : addUp(upIdx.map((i) => b.mv[i]))) }));
    return { name: g.name, brands, total: addUp(brands.map((b) => b.v)) };
  });

  return {
    fyLabel: fyName(fyStart),
    monthKeys,
    monthLabels,
    uploaded,
    currentIndex: monthKeys.indexOf(today),
    empty: rowsInBusiness === 0,
    cards,
    gantt: { media, groups: ganttGroups, total: { months: totalMonths, fytd: r6(sum(totalMonths.map((x) => x ?? 0))) } },
    sheet: {
      choice,
      choices: [...upIdx.map((i) => ({ key: monthKeys[i], label: monthLabels[i] })), { key: "fytd", label: "FY to date" }],
      title: choice === "fytd" ? `FY ${fyName(fyStart)} to date${range}` : formatMonth(choice),
      groups: sheetGroups,
      grand: addUp(sheetGroups.map((g) => g.total.v)),
      notes: ci >= 0 ? parseNotes(byKey.get(choice)!.notes) : null,
      notesLabel: ci >= 0 ? monthLabels[ci] : null,
    },
    chart,
  };
}
