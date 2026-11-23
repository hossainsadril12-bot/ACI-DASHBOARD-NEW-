# 3.1 Monthly Activity Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3.1 Monthly Activity Calendar page. It has four cards, a Gantt view with medium lanes, an Excel-like Sheet view with month notes, and a month-on-month chart. It is filtered by the shared Business filter and its totals match his sheets (Oct'26 Grand Total 39.327 Mn).

**Architecture:** A pure builder `src/lib/pages/calendar.ts` turns the stored `calendar` data, the catalog lookups, the FY start, today's month and the view choices into a plain view model. All numbers and rules live there and are unit-tested, including against his real file. The page `src/app/(modules)/calendar/` reads the store and the address, calls the builder and renders. View choices are address parameters, so the page is fully server-rendered with links and needs no client state.

**Tech Stack:** Next.js 16 App Router (cacheComponents: `await connection()` before store, cookie, searchParams or `new Date()` reads, inside `<Suspense>`), React 19, TypeScript strict, Tailwind 4, shadcn on base-ui, Vitest, Playwright.

Spec: `docs/spine/specs/2026-11-23-activity-calendar-design.md` (it holds the exact copy for every card, view and control). Read `node_modules/next/dist/docs/` before Next.js code (AGENTS.md). The model page to copy patterns from is 3.2 FY Media Spend: `src/lib/pages/fy-spend.ts`, `src/app/(modules)/fy-spend/page.tsx`, `fy-table.tsx`, `e2e/fy-spend.spec.ts`.

## Global Constraints

- **Copy:** exactly as in the spec's Page section. Use "BDT Mn" as the unit in cards, chart titles and tooltips. Write "to" instead of a dash in ranges ("Jul'26 to Oct'26"). The only dash allowed is the single-character "–" zero marker in Gantt business-row cells (as on 3.2). No other em or en dashes.
- **Numbers:**
  - Values keep 6 decimals in data and view, and are rounded only at display.
  - Cards and tooltips use `formatMn` from `src/lib/pages/fy-spend.ts`.
  - The Gantt brand-cell number and the business-row and Total-row numbers use 2 decimals with en-US grouping (`formatMn` without the unit).
  - The Sheet view uses `formatSheet(n)` = en-US, minimum 2 and maximum 3 decimals, blank for 0.
  - The change % has 1 decimal; the mix % is a whole number.
- **FY:**
  - The FY comes from `fyStartOf(active, now)`. Months and labels come from `fyMonths` / `fyMonthLabels` / `fyName` (`src/lib/manual/rules.ts`). Never hard-code a year.
  - Months not in the data are "not uploaded": hatched in the Gantt, absent from the Sheet choices and the chart. No projections.
- **Media:** `FY_MEDIA` order TV, Digital, Print, OOH, matching `v[0..3]`.
- **Business and brand:** groups follow the first appearance of their key across all months in month order. A row's key is its looked-up list business slug, else its normalised own name (`normName`). Brand names come from `brandOf(...)?.name ?? b`, and rows of the same brand in a group are added. The Business filter keeps rows whose looked-up slug equals the choice.
- **Address parameters, never trusted:**
  - `view`: "sheet", else "gantt".
  - `media`: comma list filtered to the four, kept in FY_MEDIA order; empty or invalid means all four.
  - `inactive`: "1" means true.
  - `sheet`: an uploaded "YYYY-MM" or "fytd"; anything else means the latest uploaded month.
- **Look:**
  - Shared components and the existing look.
  - Touch targets of at least 40px.
  - No page sideways scroll at 375px; tables and the chart scroll inside their cards.
  - Medium colours: TV `bg-teal-600`, Digital `bg-rose-600`, Print `bg-amber-500`, OOH `bg-emerald-600` (from `src/lib/channel-colors.ts`).
  - Hatching is a CSS repeating-linear-gradient in a neutral grey.
- **Tests:** only on the in-memory test store or the Playwright temp store. Never the real data dir, never Neon.
- **Security:**
  - The page is read-only.
  - The address parameters are allowlisted as above.
  - The Business cookie is used only through `getBusinessChoice()`.
  - No new write action, no new dependency (no chart library), no secrets.
  - Notes text from the file renders as React text only.

---

## File structure and seams

- `src/lib/ingest/readers/calendar.ts` (modify): 4 to 6 decimals.
- `src/lib/pages/calendar.ts` (new, pure). Seam: `calendarView(input): CalendarView`, `parseCalendarParams(sp)`, `parseNotes(notes)`, `formatSheet(n)`.
- `src/lib/pages/calendar.test.ts` (new).
- `src/app/(modules)/calendar/page.tsx` (rewrite), `gantt.tsx`, `sheet.tsx`, `spend-chart.tsx` (new server components).
- `src/components/shell/nav-items.ts` (3.1 `built: true`) and its test.
- `src/components/shell/being-built.test.tsx` and `e2e/phase3-shell.spec.ts`: move the being-built and admin-link fixtures from `/calendar` to `/atl` (card `atl`).
- `e2e/calendar.spec.ts` (new, chromium project).

### Builder interface (Tasks 1 and 2 implement it; Tasks 3 and 4 render it)

```ts
import type { CalendarData } from "@/lib/ingest/readers/calendar";
import type { FyMedium } from "@/lib/pages/fy-spend";

export type CalendarParams = { view: "gantt" | "sheet"; media: FyMedium[]; inactive: boolean; sheet: string | null };
export function parseCalendarParams(sp: Record<string, string | string[] | undefined>): CalendarParams;
export function formatSheet(n: number): string; // 0 -> ""; 39.327 -> "39.327"; 1.5 -> "1.50"; 1234.5678 -> "1,234.568"

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
  fyLabel: string;                 // "2026-27"
  monthKeys: string[];             // 12 "YYYY-MM"
  monthLabels: string[];           // 12 "Jul'26".."Jun'27"
  uploaded: boolean[];             // 12
  currentIndex: number;            // index of today in the FY, or -1
  empty: boolean;                  // true when no uploaded month has a row for the chosen business
  cards: {
    fytd: number; uploadedCount: number; firstLabel: string; lastLabel: string;
    last: { label: string; total: number; prevLabel: string | null; changePct: number | null };
    activeLast: number; activeFy: number;
    mix: { medium: FyMedium; pct: number }[];   // 4, FY_MEDIA order, whole numbers
  } | null;                                      // null when no uploaded month
  gantt: {
    media: FyMedium[];                           // switched on
    groups: { name: string; months: (number | null)[]; fytd: number; brands: { name: string; cells: Cell[]; fytd: number }[] }[];
    total: { months: (number | null)[]; fytd: number };
  };
  sheet: {
    choice: string;                              // "YYYY-MM" or "fytd"
    choices: { key: string; label: string }[];   // uploaded months then { key: "fytd", label: "FY to date" }
    title: string;                               // "October 2026" or "FY 2026-27 to date (Jul'26 to Oct'26)"
    groups: { name: string; brands: { name: string; v: number[]; t: number }[]; total: { v: number[]; t: number } }[];
    grand: { v: number[]; t: number };
    notes: { tvByBrand: { brand: string; count: number }[]; channels: string[]; digital: string[] } | null; // null for fytd
    notesLabel: string | null;                   // "Oct'26"
  };
  chart: { label: string; v: number[]; total: number }[]; // uploaded months only, chosen business
};
export function calendarView(input: CalendarInput): CalendarView;
export function parseNotes(notes: { tvCount?: string; channels?: string; digital?: string }): { tvByBrand: { brand: string; count: number }[]; channels: string[]; digital: string[] };
```

**Rules that need precision:**
- **Gantt brand cell for an uploaded month:**
  - `media` holds the four values;
  - `total` is the sum over the switched-on media only;
  - `lanes` has one entry per switched-on medium, with `on = value > 0`;
  - `start` = on and (it is the first month, or the previous month is not uploaded, or that medium is off there);
  - `end` = on and (it is the last month, or the next month is not uploaded, or that medium is off there).
- **Business row months:** the sum of its shown brands' cell totals, or `null` when the month is not uploaded.
- **FYTD:** the sum over uploaded months.
- **Inactive brands:** hidden unless `inactive`, meaning a brand whose cell totals are 0 in every uploaded month for the switched-on media. A group with no brands left is dropped. The `total` row covers the shown brands.
- **Sheet groups:** follow the Business filter only, never the media toggles. All brands are listed, including zero ones.
  - For a month: the brand's `v` that month (0s if missing).
  - For fytd: the sum of `v` over uploaded months.
  - `t` is the sum of `v`.
- **Cards:** follow the Business filter only and use all four media.
  - `changePct` = `(last - prev) / prev * 100` rounded to 1 decimal, or null when there is no previous uploaded month or it is 0.
  - "Previous" means the uploaded month just before the last one in the data.
  - `mix` = `Math.round(medium / last * 100)` each, or 0 when last is 0.
  - `activeFy` counts brands with `t > 0` in any uploaded month.
- **parseNotes:**
  - `tvCount` "Leona: 09 ; Twinkle Baby Diaper: 12" gives `[{brand:"Leona",count:9},{brand:"Twinkle Baby Diaper",count:12}]`. Split on ";", then the last ":" on each part; skip parts without a number.
  - `channels`: the first line, split on ",", trimmed, empties dropped.
  - `digital`: split on ",", trimmed, empties dropped.
  - Missing fields give empty lists.

---

### Task 1: Calendar reader precision and the builder core (params, cards, Gantt, chart)

**Files:** modify `src/lib/ingest/readers/calendar.ts` and `calendar.test.ts`; create `src/lib/pages/calendar.ts` and `calendar.test.ts`.

- [ ] **Step 1: Reader.**
  - Write a failing test first if one fits. Change `r4` in `readCalendar` to 6 decimals (`Math.round(v * 1e6) / 1e6`) for `v` and `t`.
  - In `calendar.test.ts`, the answer-key comparison becomes: identity fields (`m`, `label`, `biz`, `b`, `notes`) exact, and numbers `toBeCloseTo(k, 4)`, with a comment that his built-in data is 4-decimal.
  - The 39.327 acceptance test stays.
- [ ] **Step 2: Write failing builder tests** in `src/lib/pages/calendar.test.ts` with synthetic data. Use `fyStart: 2026`, `today: "2026-10"`, and two businesses, where Toiletries appears first in the data and Hygiene second. Cover:
  - `parseCalendarParams`: defaults; `media=OOH,TV,bogus` gives `["TV","OOH"]`; `media=` gives all four; `view=sheet`; `inactive=1`; `sheet=fytd` / an uploaded month / junk (the builder falls back).
  - `formatSheet` cases from the interface comment.
  - `uploaded` and `currentIndex`, where Oct'26 is index 3; and -1 for a today outside the FY.
  - Cards:
    - fytd, uploadedCount, first and last labels;
    - changePct ▲ and ▼ and null (single month; previous month 0);
    - activeLast and activeFy;
    - mix rounding with a zero last month.
  - Gantt:
    - group order is first appearance;
    - two raw names of one brand merge (via `brandOf`);
    - a not-uploaded month gives a `null` cell;
    - lane start and end over a run Jul-Aug-Sep with Aug off for Print;
    - turning TV off changes cell totals and removes TV lanes;
    - an inactive brand is hidden by default and shown with `inactive`;
    - the business row and Total row sums.
  - Business filter narrows cards, Gantt and chart.
  - `empty` is true with no months, and also when the chosen business has no rows.
  - Chart: uploaded months only, with `v` and total.
- [ ] **Step 3: Real-file tests.**
  - Run `readCalendar` on `All_Activity_Calender_FY_26-27.xlsx` (helpers as in `src/lib/pages/fy-spend.test.ts`).
  - With an identity catalog, assert the chart's Oct'26 total formats as "39.327" with `formatSheet`.
  - Assert cards.uploadedCount is 4.
- [ ] **Step 4: Implement** `src/lib/pages/calendar.ts` (`parseCalendarParams`, `formatSheet`, `calendarView` without the `sheet` part). Return `sheet` with empty groups for now; Task 2 fills it. Make the tests pass.
- [ ] **Step 5:** run `npx vitest run src/lib/pages/calendar.test.ts src/lib/ingest/readers/calendar.test.ts` and `npx tsc --noEmit`. Commit `feat(calendar): calendar view builder (cards, Gantt, chart) and 6-decimal reader`.

### Task 2: Builder Sheet view and notes, checked against every Total row of his file

**Files:** modify `src/lib/pages/calendar.ts` and `calendar.test.ts`.

- [ ] **Step 1: Failing synthetic tests:**
  - sheet for a month, and for fytd (sums);
  - the choice fallback to the latest month for junk or a not-uploaded month;
  - `choices` order and the "FY to date" label;
  - titles "October 2026" and "FY 2026-27 to date (Jul'26 to Oct'26)";
  - zero brands are listed;
  - group totals and the grand total;
  - the Business filter;
  - the media toggles do NOT affect the sheet;
  - `notes` and `notesLabel` for a month, and null for fytd;
  - `parseNotes` cases (from the interface rules, including a part without a number, and missing fields).
- [ ] **Step 2: Failing real-file test.**
  - For each month sheet of his workbook (read the cells directly with `openWorkbook`), find each business block's "Total" row and the "Grand Total" row. Find the header row as the reader does, and the medium columns from the header text.
  - Compare the per-medium values and the total with the builder's `sheet.groups[i].total` and `sheet.grand`, as `formatSheet` text, for that month (identity catalog, `sheet` = that month).
  - Assert Oct'26 `sheet.grand.t` shows "39.327".
  - If his sheet's own totals disagree with his own rows anywhere (as his FY summary table did), the test must record it in a comment naming the month, business and both values, and assert the page follows the rows. Report it.
- [ ] **Step 3: Implement** the sheet part and `parseNotes`. Run the tests and tsc. Commit `feat(calendar): Sheet view and month notes, totals match his sheets`.

### Task 3: Page shell, cards and Gantt view

**Files:**
- rewrite `src/app/(modules)/calendar/page.tsx`;
- create `src/app/(modules)/calendar/gantt.tsx`;
- modify `src/components/shell/nav-items.ts` and `nav-items.test.ts` (3.1 built; the built list becomes `["3.1","3.2","6.1","6.2","6.3","6.4","7.2"]`);
- modify `src/components/shell/being-built.test.tsx` and `e2e/phase3-shell.spec.ts` (fixtures move from `/calendar` to `/atl`, card `atl`; add a 3.1 empty-state test like the 3.2 one: "No data yet", "This page needs the All Activity Calendar file.", "Upload it" goes to `#card-calendar` in the viewport, and no `calendar-gantt` testid).

**Page:**
- **Metadata:** `{ title: "Monthly Activity Calendar" }`.
- **Header:** as the spec, with the view switch as `SegmentedLinks` (`aria-label="Calendar view"`, items "Gantt chart" / "Sheet view"). Keep other parameters when switching; build hrefs with a small helper.
- **Body** inside `<Suspense>` after `connection()`:
  - no `calendar` data: `NoDataYet fileName="All Activity Calendar" card="calendar"`;
  - otherwise the cards (`StatGrid` / `StatCard`, testids `cal-card-fytd`, `cal-card-last`, `cal-card-active`, `cal-card-mix`), then the chosen view, then (Task 4) the chart;
  - when `view.empty` with a business chosen: an `EmptyState` "No activity for <business> in FY 2026-27 yet." instead of the views.
- **today:** `dhakaDate(new Date()).slice(0, 7)` (`src/lib/manual/rules.ts`).

**Gantt (`gantt.tsx`, server component, `data-testid="calendar-gantt"`):**
- **Controls:**
  - medium toggle links (`aria-pressed`, colour square, at least 40px; the last remaining one is rendered disabled);
  - a "Show inactive brands" link styled as a checkbox toggle (`role="switch"`/`aria-checked`, or a link with a check icon), at least 40px.
- **Table** in `overflow-x-auto`:
  - sticky Brand column;
  - business rows shaded;
  - brand cells with the number on top and the lanes below (h-1.5 bars, full cell width, rounded at start and end only; adjacent `on` cells meet with no gap);
  - not-uploaded cells hatched;
  - the current month column outlined;
  - cell `title` tooltips as the spec;
  - a Total row;
  - a legend.
- **Testids:** `gantt-brand-row`, `gantt-total-row`, and `data-month` on cells. Every lane also gets `data-medium="TV"` etc. and `data-on="true|false"`.

- [ ] **Steps:** tests for the registry first (red, then green). Build the page and Gantt. Run `npx tsc --noEmit`, `npx vitest run`, eslint on the calendar folder and shell, and `npx playwright test --project=empty-store` (no dev server on 3000). Commit `feat(calendar): 3.1 page with cards and the Gantt view`.

### Task 4: Sheet view, notes card and month-on-month chart

**Files:** create `src/app/(modules)/calendar/sheet.tsx` and `spend-chart.tsx`; modify `page.tsx` to render them.

- **Sheet view (`data-testid="calendar-sheet"`):**
  - the month choice is `SegmentedLinks` (`aria-label="Sheet month"`), 40px, scrolling inside;
  - the title and sub line come from the spec;
  - an Excel-like table: a green header row; the business name on the first brand row only; amber Total rows; a green Grand Total row (`data-testid="sheet-grand-total"`);
  - numbers via `formatSheet`;
  - the notes card under it for a single month, with chips; each group shows only when it has entries.
- **Chart (`data-testid="calendar-chart"`):**
  - a card with a fixed-height (200px) row of stacked columns, one per uploaded month;
  - each segment's height is proportional to its value, scaled to the biggest month total, in medium colours, with a `title` tooltip;
  - the total is printed above each column with 2 decimals, and the month label sits below;
  - the card scrolls inside on a phone.
- [ ] **Steps:** build both and check types and lint. Visually, no sideways page scroll at 375px (the controller takes screenshots). Commit `feat(calendar): Sheet view with notes, and the month-on-month chart`.

### Task 5: Playwright flow with his real calendar file

**Files:** create `e2e/calendar.spec.ts` (chromium project). Copy the upload approach from `e2e/fy-spend.spec.ts` / `e2e/phase2b-upload.spec.ts`, using the helpers in `e2e/helpers.ts`, including `chooseBusiness`.

Expected values must come straight from his workbook cells or plain sums over `readCalendar` rows, never from `calendarView`. Assert:
- the cards: FY to date equals the sum of all rows' `t`; the last-month card names Oct'26 with its total;
- the Gantt: hatched (not uploaded) cells for Nov'26 onward, and a brand with TV spend in Oct has a TV lane `data-on="true"`;
- the TV toggle switched off: the URL `media` has no TV, and no lane `data-medium="TV"` remains;
- the Sheet view for Oct'26: the Grand Total cell shows "39.327"; FY to date's Grand Total equals the sum of the four months;
- the Business filter narrows the cards (reset to All in `finally`);
- at 375×812, `scrollWidth <= 375`.

- [ ] Run the spec, then the full suite in the background, and report the counts. The known `competitors.spec.ts` Neon timeout is reported, not fixed. Commit `test(calendar): his real calendar file on the page, both views, toggles, phone width`.

## After the tasks (controller)

- Whole-branch final review, browser QA on desktop and phone.
- Tick tracker p3-03.
- Update the flows page.
- Merge and push. No PR.
- Tell Sadril to re-upload the calendar file once on the dev store (6-decimal precision).
