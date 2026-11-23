# 3.2 FY Media Spend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3.2 FY Media Spend page with four medium cards and a brand by month table, grouped by business. It is filtered by the shared Business filter and by medium, matches the client's file to the cent, and never guesses unreported months.

**Architecture:** A pure view builder in `src/lib/pages/fy-spend.ts` turns the stored `fy` rows, the Businesses & Brands list, the FY start, the chosen business and the chosen medium into a plain view model. The page at `src/app/(modules)/fy-spend/page.tsx` reads the store, calls the builder and renders the view model with the shared components. All rules live in the builder and are unit-tested, including against the client's real file.

**Tech Stack:** Next.js 16 App Router (cacheComponents on: store and cookie reads go after `await connection()` inside `<Suspense>`), React 19, TypeScript strict, Tailwind 4, shadcn on base-ui, Vitest, Playwright.

Spec: `docs/spine/specs/2026-11-23-fy-media-spend-design.md`. Content reference: `docs/page-specs/02-ooh-calendar-fy-channel.md` section 3.2. Read `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md).

## Global Constraints

**Copy, exact:**
- "3.2 FY Media Spend"
- "BDT Mn by brand and month · FY <this> vs FY <last>"
- "All media", "TV", "Digital", "Print", "OOH"
- "Brand × month spend"
- "Darker cells = higher spend · months after <Mon'YY> not reported yet"
- "Brand", "FY to date", "FY <last> full year", "% of FY <last>"
- "<Business> total", "Grand total"
- "FY <last> full year: <x.xx> BDT Mn"
- "No spend for <business> in FY <this> yet."
- In these strings `<this>` and `<last>` are `fyName(fyStart)` and `fyName(fyStart - 1)`, for example "2026-27" and "2025-26".

**Numbers:**
- Amounts are BDT Mn with 2 decimals and thousands separators.
- Cards use `formatMn` (Task 1), for example "12.34 BDT Mn".
- Table cells show the number only, because the unit is in the subline and headers.
- A zero in a reported month shows "–" (U+2013 is allowed ONLY as this single-character empty marker, as Manual Entry and his file use it; no other dashes in text).
- A month that is not reported yet is an empty cell. No projections.
- The percentage is the whole number `Math.round(fytd / py * 100)` followed by "%", or "–" when `py` is 0.

**FY:**
- July to June.
- The FY comes from `fyStartOf(active, now)`; labels come from `fyName` and `fyMonthLabels`, all in `src/lib/manual/rules.ts`.
- Never hard-code a year.

**Media:** `FY_MEDIA` = TV, Digital, Print, OOH (`src/lib/manual/rules.ts`). Rows store "Print" (the reader maps "Press" to "Print").

**Business:**
- The row's stored `biz` is looked up with `catalog.businessOf`. Hidden businesses still group their rows.
- **Amended 23 Nov (owner decision, after Task 2):** groups follow the FY file's own business order (first appearance in the rows, before any filter), not the catalog list order. An unknown `biz` keeps its own name and sits at its first appearance. `fySpendView` no longer takes `businesses`. Values keep 6 decimals (reader, `cleanFy` and the builder) and are rounded only at display. The spec's Data section is the source of truth; the Task 1 interface text below predates these changes.
- The Business filter choice comes from `getBusinessChoice()` (`src/components/shell/business-filter.tsx`), which returns `{ slug, name } | null`.
- When a business is chosen, only rows whose looked-up business slug equals it count.

**Brand:** the name shown is `catalog.brandOf(b)?.name ?? b`. Rows with the same business and shown name are added together month by month, and `py` is added too.

**Look:**
- Shared components and the existing Wix/Mixpanel look.
- Touch targets of at least 40px.
- No page sideways scroll at 375px.
- The table scrolls inside its card.

**Tests:** only on the in-memory test store or the Playwright temp store. Never the real data dir, never Neon.

**Security constraints:**
- The page is read-only.
- The `media` query value is never trusted: anything other than the four media means "All".
- The Business filter cookie is only used through `getBusinessChoice()`, which validates it against the catalog.
- No new write action, no new dependency, no secrets.

---

## File structure and seams

- `src/lib/pages/fy-spend.ts` (new, pure). Seam: `fySpendView(input): FySpendView`, `parseMedia(v)`, `formatMn(n)`.
- `src/lib/pages/fy-spend.test.ts` (new). Synthetic cases plus a real-file case.
- `src/app/(modules)/fy-spend/page.tsx` (rewrite). Server page: reads the store, renders the view.
- `src/app/(modules)/fy-spend/fy-table.tsx` (new). Server component for the table card.
- `src/components/shell/nav-items.ts` (modify). 3.2 becomes `built: true`. `src/components/shell/nav-items.test.ts` changes its built list to match.
- `e2e/phase3-shell.spec.ts` (modify). 3.2 is no longer a being-built page; it gets its own empty-state test.
- `e2e/fy-spend.spec.ts` (new). Runs in the `chromium` project and uploads his real FY file.

---

### Task 1: Pure FY Media Spend view builder

**Files:**
- Create: `src/lib/pages/fy-spend.ts`, `src/lib/pages/fy-spend.test.ts`

**Interfaces:**
- Consumes: `FyRow` (`src/lib/ingest/readers/fy.ts`: `{ biz: string; b: string; med: string; m: number[]; py: number }`), `FY_MEDIA`, `fyName`, `fyMonthLabels` (`src/lib/manual/rules.ts`).
- Produces:

```ts
export type FyMedium = (typeof FY_MEDIA)[number]; // "TV" | "Digital" | "Print" | "OOH"
export type MediaChoice = "All" | FyMedium;
export function parseMedia(v: unknown): MediaChoice;          // exact "TV" | "Digital" | "Print" | "OOH", else "All"
export function formatMn(n: number): string;                   // 12.3456 -> "12.35 BDT Mn"; 1234.5 -> "1,234.50 BDT Mn"; -0.001 -> "0.00 BDT Mn"

export type FySpendInput = {
  rows: FyRow[];
  fyStart: number;
  businesses: { slug: string; name: string }[];                 // catalog list order (hidden included)
  businessOf: (name: string) => { slug: string; name: string } | null;
  brandOf: (name: string) => { name: string } | null;
  business: { slug: string; name: string } | null;              // Business filter; null = all
  media: MediaChoice;
};
export type FyLine = { name: string; m: (number | null)[]; fytd: number; py: number; pct: number | null };
// m: 12 values; null = month not reported yet; numbers already rounded to 4 decimals
export type FySpendView = {
  fyLabel: string;            // "2026-27"
  lastFyLabel: string;        // "2025-26"
  monthLabels: string[];      // 12, "Jul'26" .. "Jun'27"
  reported: number;           // count of reported months (0..12), from ALL rows (not filtered)
  lastReportedLabel: string | null; // "Oct'26", null when reported = 0
  cards: { medium: FyMedium; fytd: number; py: number }[];        // 4, FY_MEDIA order, follow business only
  groups: { name: string; lines: FyLine[]; total: FyLine }[];     // follow business AND media; empty groups dropped
  grandTotal: FyLine;
  maxCell: number;            // biggest brand-line month value on screen (for tint), 0 when none
  empty: boolean;             // true when groups is empty
};
export function fySpendView(input: FySpendInput): FySpendView;
```

- [ ] **Step 1: Write the failing tests** in `src/lib/pages/fy-spend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { fySpendView, formatMn, parseMedia, type FySpendInput } from "./fy-spend";

const z = (...v: number[]) => [...v, ...Array(12 - v.length).fill(0)];
const BIZ = [{ slug: "toiletries", name: "Toiletries" }, { slug: "hygiene", name: "Hygiene" }];
const base = (rows: FyRow[], over: Partial<FySpendInput> = {}): FySpendInput => ({
  rows, fyStart: 2026, businesses: BIZ,
  businessOf: (n) => BIZ.find((b) => b.name.toLowerCase() === n.toLowerCase()) ?? (n === "Toilet" ? BIZ[0] : null),
  brandOf: (n) => (n === "Savlon HW" ? { name: "Savlon Handwash" } : null),
  business: null, media: "All", ...over,
});
const ROWS: FyRow[] = [
  { biz: "Toiletries", b: "Savlon HW", med: "TV", m: z(1, 2, 0, 3), py: 10 },
  { biz: "Toilet", b: "Savlon HW", med: "Digital", m: z(0.5, 0, 0, 0.5), py: 0 },
  { biz: "Toiletries", b: "Lux", med: "Print", m: z(4), py: 0 },
  { biz: "Hygiene", b: "Angel", med: "OOH", m: z(0, 1), py: 2 },
  { biz: "Foods", b: "Pure Salt", med: "TV", m: z(0, 0, 2), py: 0 },
  { biz: "Hygiene", b: "Ghost", med: "TV", m: z(), py: 0 },
];

describe("parseMedia and formatMn", () => {
  it("accepts only the four media", () => {
    expect(parseMedia("TV")).toBe("TV");
    expect(parseMedia("tv")).toBe("All");
    expect(parseMedia(["TV"])).toBe("All");
    expect(parseMedia(undefined)).toBe("All");
  });
  it("formats BDT Mn with 2 decimals and no negative zero", () => {
    expect(formatMn(12.3456)).toBe("12.35 BDT Mn");
    expect(formatMn(1234.5)).toBe("1,234.50 BDT Mn");
    expect(formatMn(-0.001)).toBe("0.00 BDT Mn");
  });
});

describe("fySpendView", () => {
  it("labels the FY from fyStart and finds the reported months from all rows", () => {
    const v = fySpendView(base(ROWS));
    expect(v.fyLabel).toBe("2026-27");
    expect(v.lastFyLabel).toBe("2025-26");
    expect(v.monthLabels[0]).toBe("Jul'26");
    expect(v.monthLabels[11]).toBe("Jun'27");
    expect(v.reported).toBe(4);
    expect(v.lastReportedLabel).toBe("Oct'26");
  });

  it("groups by list business in list order, unknown businesses after, full brand names, media added together", () => {
    const v = fySpendView(base(ROWS));
    expect(v.groups.map((g) => g.name)).toEqual(["Toiletries", "Hygiene", "Foods"]);
    const t = v.groups[0];
    expect(t.lines.map((l) => l.name)).toEqual(["Savlon Handwash", "Lux"]); // 7 before 4: biggest first
    expect(t.lines[0].m.slice(0, 5)).toEqual([1.5, 2, 0, 3.5, null]);
    expect(t.lines[0].fytd).toBe(7);
    expect(t.lines[0].py).toBe(10);
    expect(t.lines[0].pct).toBe(70);
    expect(t.lines[1].pct).toBeNull();
    expect(t.total.name).toBe("Toiletries total");
    expect(t.total.fytd).toBe(11);
  });

  it("leaves out brands with no spend and no last year", () => {
    const v = fySpendView(base(ROWS));
    expect(v.groups[1].lines.map((l) => l.name)).toEqual(["Angel"]);
  });

  it("keeps future months empty in every line, totals included", () => {
    const v = fySpendView(base(ROWS));
    for (const line of [...v.groups.flatMap((g) => [...g.lines, g.total]), v.grandTotal]) {
      expect(line.m.slice(4).every((x) => x === null)).toBe(true);
    }
    expect(v.grandTotal.m.slice(0, 4)).toEqual([5.5, 3, 2, 3.5]);
    expect(v.grandTotal.fytd).toBe(14);
    expect(v.grandTotal.py).toBe(12);
  });

  it("filters the table by medium; the cards ignore the medium", () => {
    const v = fySpendView(base(ROWS, { media: "TV" }));
    expect(v.groups.map((g) => g.name)).toEqual(["Toiletries", "Foods"]);
    expect(v.groups[0].lines[0].fytd).toBe(6);
    expect(v.cards.map((c) => [c.medium, c.fytd, c.py])).toEqual([["TV", 8, 10], ["Digital", 1, 0], ["Print", 4, 0], ["OOH", 1, 2]]);
  });

  it("filters cards and table by the chosen business", () => {
    const v = fySpendView(base(ROWS, { business: { slug: "hygiene", name: "Hygiene" } }));
    expect(v.groups.map((g) => g.name)).toEqual(["Hygiene"]);
    expect(v.cards.find((c) => c.medium === "TV")!.fytd).toBe(0);
    expect(v.cards.find((c) => c.medium === "OOH")!.fytd).toBe(1);
    expect(v.reported).toBe(4); // still from all rows
  });

  it("reports empty when nothing matches, and handles no rows at all", () => {
    expect(fySpendView(base(ROWS, { business: { slug: "hygiene", name: "Hygiene" }, media: "Print" })).empty).toBe(true);
    const none = fySpendView(base([]));
    expect(none.empty).toBe(true);
    expect(none.reported).toBe(0);
    expect(none.lastReportedLabel).toBeNull();
    expect(none.maxCell).toBe(0);
  });

  it("finds the biggest brand month cell on screen for the tint", () => {
    expect(fySpendView(base(ROWS)).maxCell).toBe(4);
    expect(fySpendView(base(ROWS, { media: "TV" })).maxCell).toBe(3);
  });
});
```

Add a real-file case in the same file, using the helpers already used by `src/lib/ingest/readers/fy.test.ts` (`clientFile`, `hasClientFiles` from `src/lib/ingest/test-workbooks`, `openWorkbook` from `src/lib/ingest/workbook`, `readFy`):

```ts
import { readFy } from "@/lib/ingest/readers/fy";
import { openWorkbook } from "@/lib/ingest/workbook";
import { clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";

const FILE = "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx";
describe.skipIf(!hasClientFiles)("fySpendView with his real FY file", () => {
  it("matches the Grand Total row of his Final Report sheet, month by month", () => {
    const wb = openWorkbook(new Uint8Array(clientFile(FILE)));
    const rows = readFy(wb).data;
    const v = fySpendView({ rows, fyStart: 2026, businesses: [], businessOf: () => null, brandOf: () => null, business: null, media: "All" });
    const sheet = wb.sheet(wb.sheets.findIndex((s) => /final report/i.test(s.name) && s.visible))!;
    let gt = 0;
    for (let r = 1; r <= sheet.maxRow; r++) if (/^grand total$/i.test(String(sheet.v(r, 1) ?? "").trim())) { gt = r; break; }
    expect(gt).toBeGreaterThan(0);
    for (let i = 0; i < v.reported; i++) {
      const cell = sheet.v(gt, 3 + i);
      expect(v.grandTotal.m[i]).toBeCloseTo(typeof cell === "number" ? cell : 0, 2);
    }
    const tv = rows.filter((r) => r.med === "TV").reduce((t, r) => t + r.m.reduce((a, c) => a + c, 0), 0);
    expect(v.cards[0].fytd).toBeCloseTo(tv, 4);
  });
});
```

(Check `src/lib/ingest/workbook.ts` for the exact `sheet()`/`v()` signatures and adapt the lookup if they differ; keep the assertion: every reported month of the page's Grand total equals the file's Grand Total row to 2 decimals.)

- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/lib/pages/fy-spend.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/lib/pages/fy-spend.ts`**

```ts
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
```

(A brand left out for having no spend and no `py` adds nothing to the grand total, so summing all shown rows equals summing the shown groups.)

- [ ] **Step 4: Run the tests and watch them pass.** Run `npx vitest run src/lib/pages/fy-spend.test.ts`. Expected: PASS (the real-file case skips when `Asset/xlsx` is missing, and it is present on this machine).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages/fy-spend.ts src/lib/pages/fy-spend.test.ts
git commit -m "feat(fy-spend): pure FY Media Spend view, checked against his real file"
```

---

### Task 2: The 3.2 FY Media Spend page

**Files:**
- Rewrite: `src/app/(modules)/fy-spend/page.tsx`
- Create: `src/app/(modules)/fy-spend/fy-table.tsx`
- Modify: `src/components/shell/nav-items.ts` (3.2 `built: true`), `src/components/shell/nav-items.test.ts` (built list becomes `["3.2", "6.1", "6.2", "6.3", "6.4", "7.2"]`)
- Modify: `e2e/phase3-shell.spec.ts` (the sidebar loop already skips built pages; add the 3.2 empty-state test below)

**Interfaces:**
- Consumes:
  - `fySpendView`, `parseMedia`, `formatMn`, `FySpendView` (Task 1);
  - `getActiveData<FyRow[]>(store, "fy")`, which returns `{ versionId, label, summary, createdAt, data } | null` (`src/store/datasets.ts`);
  - `getCatalog(store)` (`src/store/catalog.ts`: `businesses` in list order, `businessOf`, `brandOf`);
  - `getStore()` (`src/store/client.ts`);
  - `fyStartOf` (`src/lib/manual/rules.ts`);
  - `getBusinessChoice`, `BusinessFilter` (`src/components/shell/business-filter.tsx`);
  - `isAdmin` (`src/auth/admin.ts`);
  - `NoDataYet` (`src/components/data/no-data-yet.tsx`);
  - `EmptyState`;
  - `PageHeader`;
  - `SegmentedLinks` (`src/components/data/segmented.tsx`);
  - `StatCard`, `StatGrid` (`src/components/data/stat-card.tsx`; read the props);
  - `Card` parts (`src/components/ui/card.tsx`).
- Produces: the page.

Page rules (exact copy from Global Constraints):

**Metadata:** `{ title: "FY Media Spend" }`.

**Header.**
- `PageHeader` title "3.2 FY Media Spend" and subline "BDT Mn by brand and month · FY 2026-27 vs FY 2025-26" (labels from the view).
- Header children:
  - the `BusinessFilter` inside `<Suspense fallback={null}>`;
  - `SegmentedLinks` label "Media", items All media / TV / Digital / Print / OOH. Each href is `/fy-spend` or `/fy-spend?media=TV` etc., and the value comes from `parseMedia`. Wrap it in `max-w-full overflow-x-auto`, with each item at least 40px tall, as the Business filter does.

**Body, in one `<Suspense>` with `PageSkeleton`, after `await connection()`.**
- Read the active `fy` data, the catalog, `getBusinessChoice()`, `isAdmin()` and `searchParams.media`.
- **No `fy` data:** render `<NoDataYet fileName="CB Media Spent Report" card="fy" admin={admin} />` and nothing else.
- **Otherwise:** `view = fySpendView({ rows: data, fyStart: fyStartOf(active, new Date()), businesses: catalog.businesses, businessOf: catalog.businessOf, brandOf: catalog.brandOf, business: choice, media })`.
- **Cards:** `StatGrid` with one `StatCard` per entry in `view.cards` (the four media, plus "Other" when the view includes it; Task 1's fix made `cards` `{ medium: FyMedium | "Other"; fytd; py }[]`):
  - label is the medium;
  - value is `formatMn(card.fytd)`;
  - sub line is "FY 2025-26 full year: " + `formatMn(card.py)`.
- **Table card** with title "Brand × month spend" (+ " · TV" when a medium is chosen).
  - Sub line: "Darker cells = higher spend · months after Oct'26 not reported yet". When `lastReportedLabel` is null, use just "Darker cells = higher spend".
  - When `view.empty`, show `EmptyState` with title "No spend for <business name or 'this selection'> in FY 2026-27 yet." instead of the table.
  - Otherwise render `FyTable`.
- **`FyTable`:**
  - It is a `<table>` inside `div.overflow-x-auto`. The header row is: Brand, 12 month labels, "FY to date", "FY 2025-26 full year", "% of FY 2025-26".
  - Number columns are right-aligned with `tabular-nums`.
  - **Brand rows:** the name, then the months:
    - `null` gives an empty cell;
    - 0 gives "–";
    - otherwise `n.toFixed(2)` with en-US grouping, inside a span tinted with the accent colour at alpha `0.08 + 0.55 * v / maxCell` (inline style or a CSS variable; keep the same accent token the app uses for primary).
  - Brand rows end with FY to date (bold), py ("–" when 0) and pct ("–" when null, else "N%").
  - **Group total rows:** shaded (`bg-muted`), no tint.
  - **Grand total row:** stronger shading and bold.
  - The Brand column stays sticky on the left while the months scroll (`sticky left-0` with a background).
  - Add `data-testid="fy-table"` on the table, `data-testid="fy-grand-total"` on the grand total row, and `data-testid="fy-card-<medium>"` on each card.

- [ ] **Step 1: Update the registry and its test first.** In `nav-items.test.ts`, the built list becomes `["3.2", "6.1", "6.2", "6.3", "6.4", "7.2"]`. Run `npx vitest run src/components/shell` and watch it fail. Then set 3.2 `built: true` in `nav-items.ts` and watch it pass. `prd-routes.test.ts` now skips 3.2, because it only checks unbuilt pages.
- [ ] **Step 2: Write the page and `fy-table.tsx`** to the rules above. Keep every computation in Task 1's builder; the page only maps the view model to markup.
- [ ] **Step 3: Add the empty-store test** to `e2e/phase3-shell.spec.ts`, which runs before any upload:

```ts
test("3.2 FY Media Spend with no data names its file; the admin can open the FY card", async ({ page }) => {
  await page.goto("/fy-spend");
  await expect(page.getByRole("heading", { name: "3.2 FY Media Spend" })).toBeVisible();
  await expect(page.getByText("No data yet")).toBeVisible();
  await expect(page.getByText("This page needs the CB Media Spent Report file.")).toBeVisible();
  await page.getByRole("link", { name: "Upload it" }).click();
  await expect(page).toHaveURL(/\/data-entry#card-fy$/);
});
```

In its `viewer` describe, change the being-built check from `/fy-spend` to `/atl`, which is still being built. Also add `/fy-spend` showing "Not uploaded yet. The admin uploads it in Data Entry." and no "Upload it" link. The admin-link test in that file used `/fy-spend`; move it to `/calendar` with `#card-calendar`.
- [ ] **Step 4: Verify.**
  - `npx tsc --noEmit`, `npx vitest run` and `npx eslint "src/app/(modules)/fy-spend" src/components/shell` must all be clean.
  - Run `npx playwright test --project=empty-store`. Stop any localhost:3000 preview first; Playwright uses port 3100.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(modules)/fy-spend" src/components/shell/nav-items.ts src/components/shell/nav-items.test.ts e2e/phase3-shell.spec.ts
git commit -m "feat(fy-spend): 3.2 FY Media Spend page with cards, brand by month table and empty states"
```

---

### Task 3: Playwright flow with his real FY file

**Files:**
- Create: `e2e/fy-spend.spec.ts` (runs in the `chromium` project, after `phase2c`, so businesses exist)

**Interfaces:**
- Consumes: the upload helpers in `e2e/helpers.ts` (`openUpload`, `card`, `fileOf`, and the dialog helpers used by `e2e/phase2b-upload.spec.ts` to upload `CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx`). Read `phase2b-upload.spec.ts` and copy its FY upload steps, including any new-name decisions. Also `fySpendView`, `readFy`, `openWorkbook`, `clientFile` to compute the expected numbers from the same file inside the test.

Write one spec that:
1. Uploads his real FY file through the FY card. If it is already the active FY version with the same file, the upload may be skipped; check how phase2b handles the "same file" case and follow it.
2. Opens `/fy-spend` and resets the Business filter to "All businesses". Use the same `choose` helper approach as `e2e/phase3-business-filter.spec.ts`; extract it into `e2e/helpers.ts` as `chooseBusiness(page, name)` and use it in both specs.
3. Computes the expected view in the test with `fySpendView` on `readFy(file)` rows. Use the real catalog-free grouping, so compare only cards and the grand total, which do not depend on grouping. Asserts:
   - each `fy-card-<medium>` shows `formatMn(card.fytd)`;
   - the `fy-grand-total` row's month cells show the expected values for reported months and are empty after the last reported month.
4. Clicks the "TV" media button. The URL gets `media=TV`, the table title reads "Brand × month spend · TV", and the grand total FY to date equals the TV card's value.
5. Chooses a business that has FY rows: the first business group name shown in the table under All. The cards change, and every group heading left in the table is that business. Resets to "All businesses" at the end.
6. At 375×812, `document.documentElement.scrollWidth <= 375`, and the table's scroll container is wider than its client width (it scrolls inside).

- [ ] **Step 1: Write the spec.** Run `npx playwright test e2e/fy-spend.spec.ts e2e/phase3-business-filter.spec.ts` and get it passing. These are test-only changes.
- [ ] **Step 2: Run the full suite** in the background (about 4 to 8 minutes) and report the counts. Known: `competitors.spec.ts` can time out on the shared Neon dev branch (old page, Phase 6 removes it). Report it, do not fix it.
- [ ] **Step 3: Commit**

```bash
git add e2e/fy-spend.spec.ts e2e/helpers.ts e2e/phase3-business-filter.spec.ts
git commit -m "test(fy-spend): his real FY file on the page, media and business filters, phone width"
```

---

## After the tasks (controller)

- Whole-branch final review, then a browser QA walk on desktop and phone, with an empty store and then the dev store.
- Tick tracker p3-02 (FY Media Spend).
- Update the flows page.
- Merge `--no-ff` into main and push main and the branch to `personal`. No PR.
