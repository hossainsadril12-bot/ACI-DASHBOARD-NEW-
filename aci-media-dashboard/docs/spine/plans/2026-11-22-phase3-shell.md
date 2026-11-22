# Phase 3 Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app the PRD's structure: a numbered PRD sidebar, a working "being built" page for every PRD page, a shared Business filter, a shared "No data yet" empty state, one BDT Mn formatter and a "Data updated" line.

**Architecture:** One registry (`src/components/shell/nav-items.ts`) describes every PRD page: number, name, route, files it reads, Data Entry card and whether the Business filter shows. The sidebar, top bar breadcrumb, being-built view and tests all read that registry. Pure functions (active link, business filter view, data updated line, money format) carry the logic and the tests; React components only render them.

**Tech Stack:** Next.js 16 App Router (cacheComponents on: anything reading cookies or the store renders inside `<Suspense>` after `await connection()`), React 19, TypeScript strict, Tailwind 4, shadcn on base-ui, lucide-react icons, Vitest, Playwright.

Spec: `docs/spine/specs/2026-11-22-phase3-shell-design.md`. Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md: this Next.js has breaking changes).

## Global Constraints

- Sidebar numbers and names exactly as the spec's Sidebar section. 7.1 User Settings is not in the sidebar.
- Old pages (Performance `/performance`, Digital Data `/digital`, Competitor Tracking `/competitors`, Plan `/plan`, Spend `/spend`, old Billing `/billing`, Uploads `/uploads`) leave the sidebar. Their routes keep working until Phase 6.
- The old Home moves from `/` to `/old-home` (not in the sidebar). `/` shows the being-built view for 1 Home. (This changes the spec's assumption "Old Home content is replaced"; the old Home's own tests keep running until Phase 6 deletes it.)
- Copy, exact strings:
  - "This page is being built."
  - "It will read: "
  - "No data yet"
  - "This page needs the <file> file."
  - "Upload it"
  - "Not uploaded yet. The admin uploads it in Data Entry."
  - "All businesses"
  - "Search businesses"
  - "Data updated: "
  - "Menu"
- No em-dash or en-dash characters in any visible text.
- Money on pages: `formatBdtMn` ("12.34 BDT Mn"). FY is July to June. No projections.
- Business filter: buttons when 1 to 4 visible businesses, dropdown with search when 5 or more, hidden when 0. It is hidden on 4.x Channel Wise, 6.x Data Entry (incl. Businesses & Brands) and 7.x Settings.
- UI follows the existing Wix/Mixpanel look and shared components (`EmptyState`, `SegmentedButtons`, `PageHeader`, `Button`, `Dialog`, `DropdownMenu`). Touch targets of at least 40px. Phone and desktop checked.
- Tests only on the in-memory test store (`createTestStore()`) or the Playwright temp store. Never the real data dir, never Neon.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Security constraints (from security-standard section 1, the parts this plan touches):**
- Viewers are read-only. No task adds a write action. The Business filter is a view cookie written by the browser and is never trusted as a permission. The server validates the cookie value against the visible catalog before use, and an unknown value means "All businesses".
- The admin-only link on the being-built view is hidden for viewers for clarity only. It points to a page that already enforces admin on every write.
- No secrets in code or tests. No new dependencies.
- Section 2 checklist items for this branch:
  - Task 5 adds a cookie (`aci-business`): path `/`, `samesite=lax`, max-age 60 days, value checked against the catalog on read.
  - Task 3 adds routes: read-only, no params trusted.

---

## File structure and seams

- `src/components/shell/nav-items.ts` (rewrite). Seam: `PRD_SECTIONS`, `PRD_PAGES`, `prdPage(href)`, `activeHref(pathname, tab)`, `OLD_PAGE_TITLES`. Pure data and functions only.
- `src/components/shell/sidebar.tsx` (rewrite). Seam: `Sidebar({ quickActionsSlot, footerSlot, onNavigate? })`. Client component.
- `src/components/shell/mobile-menu.tsx` (new). Seam: `MobileMenu({ children })`. Client component; a Menu button that opens its children in a left drawer.
- `src/components/shell/top-bar.tsx` (modify). Breadcrumb from `activeHref` and `prdPage`, plus a new `menuSlot` prop.
- `src/components/shell/data-updated.ts` (new, pure). Seam: `dataUpdatedLine(active: ActiveVersion[]): string | null`.
- `src/components/shell/data-updated-line.tsx` (new, server). Seam: `DataUpdatedLine()`.
- `src/components/shell/being-built.tsx` (new, server). Seam: `BeingBuilt({ href })`, `beingBuiltMetadata(href)`.
- `src/components/data/no-data-yet.tsx` (new, server-safe). Seam: `NoDataYet({ fileName, card, admin })`.
- `src/lib/money.ts` (modify). Seam: `formatBdtMn(taka: number): string`, `BDT_MN`.
- `src/lib/business-filter.ts` (new, pure). Seam: `BUSINESS_COOKIE`, `businessFilterView(businesses, saved)`.
- `src/components/shell/business-filter.tsx` (new). Seams: `BusinessFilter()` (server), `getBusinessChoice()` (server helper for pages), `BusinessFilterControl({ view })` (client, in `business-filter-control.tsx`).
- Route files: one `page.tsx` per unbuilt PRD page. The old Home moves to `src/app/(modules)/old-home/`.

---

### Task 1: PRD page registry and active-link logic

**Files:**
- Rewrite: `src/components/shell/nav-items.ts`
- Rewrite: `src/components/shell/nav-items.test.ts`
- Modify: `src/app/(modules)/data-entry/logic.test.ts:430-436` (the test that reads `NAV_ITEMS`)

**Interfaces:**
- Consumes: `CardKey` from `src/lib/ingest/cards.ts`.
- Produces:

```ts
import type { CardKey } from "@/lib/ingest/cards";

export type PrdPage = {
  code: string;            // "2.1"
  label: string;           // "ATL Media Performance"
  href: string;            // "/atl"
  files: string | null;    // "the 13 ATL files (2026 Dash Board)"; null = reads no file
  card: CardKey | null;    // Data Entry card for the admin link; null = no single card
  businessFilter: boolean; // shows the shared Business filter
  built: boolean;          // false = renders the being-built view
  note?: string;           // replaces the "It will read" line when files is null
};
export type PrdSection = { code: string; label: string; pages: PrdPage[] }; // a one-page section (Home) has pages.length === 1 and renders as a plain link
export const PRD_SECTIONS: readonly PrdSection[];
export const PRD_PAGES: readonly PrdPage[];                 // PRD_SECTIONS flattened, in order
export function prdPage(href: string): PrdPage | undefined;  // exact href match
/** The sidebar href to highlight for this location, or null. Longest matching prefix wins; "/" only on "/"; Data Entry uses tab. */
export function activeHref(pathname: string, tab: string | null): string | null;
/** Breadcrumb titles for pages that are not in the sidebar. */
export const OLD_PAGE_TITLES: Readonly<Record<string, string>>;
```

- [ ] **Step 1: Write the failing tests** in `src/components/shell/nav-items.test.ts` (replace the file):

```ts
import { describe, expect, it } from "vitest";
import { PRD_PAGES, PRD_SECTIONS, activeHref, prdPage } from "./nav-items";

describe("PRD_SECTIONS", () => {
  it("follows the PRD numbering, 1 to 7, without 7.1", () => {
    expect(PRD_SECTIONS.map((s) => `${s.code} ${s.label}`)).toEqual([
      "1 Home", "2 Campaign Performance", "3 Media Spend", "4 Channel Wise Spend",
      "5 Billing & Statement", "6 Data Entry", "7 Settings",
    ]);
    expect(PRD_PAGES.map((p) => p.code)).toEqual([
      "1", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "4.1", "4.2", "4.3",
      "5.1", "5.2", "5.3", "5.4", "6.1", "6.2", "6.3", "6.4", "7.2", "7.3",
    ]);
  });

  it("gives every page a unique route", () => {
    const hrefs = PRD_PAGES.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(prdPage("/atl")?.label).toBe("ATL Media Performance");
    expect(prdPage("/data-entry?tab=manual")?.label).toBe("Manual Entry");
    expect(prdPage("/businesses")?.code).toBe("6.4");
  });

  it("names a file or a note on every unbuilt page", () => {
    for (const p of PRD_PAGES.filter((x) => !x.built)) expect(p.files ?? p.note, p.code).toBeTruthy();
  });

  it("marks only Data Entry, Businesses & Brands and Settings 7.2 as built", () => {
    expect(PRD_PAGES.filter((p) => p.built).map((p) => p.code)).toEqual(["6.1", "6.2", "6.3", "6.4", "7.2"]);
  });

  it("hides the Business filter on Channel Wise, Data Entry and Settings", () => {
    expect(PRD_PAGES.filter((p) => !p.businessFilter).map((p) => p.code)).toEqual([
      "4.1", "4.2", "4.3", "6.1", "6.2", "6.3", "6.4", "7.2", "7.3",
    ]);
  });

  it("does not list the old sample pages", () => {
    const hrefs = PRD_PAGES.map((p) => p.href);
    for (const old of ["/performance", "/digital", "/competitors", "/plan", "/spend", "/billing", "/uploads"]) expect(hrefs).not.toContain(old);
  });
});

describe("activeHref", () => {
  it("matches Home only on /", () => {
    expect(activeHref("/", null)).toBe("/");
    expect(activeHref("/atl", null)).toBe("/atl");
  });
  it("uses the tab on Data Entry", () => {
    expect(activeHref("/data-entry", null)).toBe("/data-entry");
    expect(activeHref("/data-entry", "manual")).toBe("/data-entry?tab=manual");
    expect(activeHref("/data-entry", "history")).toBe("/data-entry?tab=history");
    expect(activeHref("/data-entry", "nonsense")).toBe("/data-entry");
  });
  it("keeps a sub page under its parent and prefers the longest match", () => {
    expect(activeHref("/businesses/salt", null)).toBe("/businesses");
    expect(activeHref("/settings/access", null)).toBe("/settings/access");
    expect(activeHref("/settings", null)).toBe("/settings");
    expect(activeHref("/billing/overview", null)).toBe("/billing/overview");
  });
  it("highlights nothing on an old page", () => {
    for (const p of ["/billing", "/spend", "/old-home", "/digital"]) expect(activeHref(p, null), p).toBeNull();
  });
});
```

In `src/app/(modules)/data-entry/logic.test.ts`, replace the test that reads `NAV_ITEMS` (around line 430) with this one, and change the import to `import { PRD_PAGES } from "@/components/shell/nav-items";`:

```ts
  it("lists Data Entry right before Businesses & Brands in the sidebar", () => {
    const i = PRD_PAGES.findIndex((n) => n.href === "/data-entry");
    expect(PRD_PAGES[i].label).toBe("Upload Data");
    expect(PRD_PAGES.findIndex((n) => n.href === "/businesses")).toBe(i + 3);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/shell/nav-items.test.ts "src/app/(modules)/data-entry/logic.test.ts"`
Expected: FAIL. `PRD_SECTIONS` and `PRD_PAGES` are not exported.

- [ ] **Step 3: Write `src/components/shell/nav-items.ts`**

```ts
import type { CardKey } from "@/lib/ingest/cards";

// The PRD v2.1 sidebar (sections 1 to 7). One registry for the sidebar, the breadcrumb,
// the being-built pages and the tests. 7.1 User Settings is left out: per-person access is off.

export type PrdPage = {
  code: string;
  label: string;
  href: string;
  files: string | null;
  card: CardKey | null;
  businessFilter: boolean;
  built: boolean;
  note?: string;
};
export type PrdSection = { code: string; label: string; pages: PrdPage[] };

const page = (code: string, label: string, href: string, files: string | null, card: CardKey | null, businessFilter: boolean, built = false, note?: string): PrdPage =>
  ({ code, label, href, files, card, businessFilter, built, ...(note ? { note } : {}) });

const CHANNEL = "the Channel Cost file, or Manual Entry";
const BILLING = "the Dashboard Media Final file";

export const PRD_SECTIONS: readonly PrdSection[] = [
  { code: "1", label: "Home", pages: [page("1", "Home", "/", "the CB Media Spent Report, the ATL files and the Digital files", null, true)] },
  { code: "2", label: "Campaign Performance", pages: [
    page("2.1", "ATL Media Performance", "/atl", "the 13 ATL files (2026 Dash Board)", "atl", true),
    page("2.2", "Digital Media Performance", "/digital-performance", "the Digital files", "digital", true),
    page("2.3", "OOH Media Performance", "/ooh", "the Billboard master sheet", null, true),
    page("2.4", "Influencer Campaign Performance", "/influencer", "the Digital files", "digital", true),
  ] },
  { code: "3", label: "Media Spend", pages: [
    page("3.1", "Monthly Activity Calendar", "/calendar", "the All Activity Calendar file", "calendar", true),
    page("3.2", "FY Media Spend", "/fy-spend", "the CB Media Spent Report, or Manual Entry", "fy", true),
  ] },
  { code: "4", label: "Channel Wise Spend", pages: [
    page("4.1", "Electronic Media", "/channel/electronic", CHANNEL, "channel", false),
    page("4.2", "Digital Media", "/channel/digital", CHANNEL, "channel", false),
    page("4.3", "Press & Radio", "/channel/press-radio", CHANNEL, "channel", false),
  ] },
  { code: "5", label: "Billing & Statement", pages: [
    page("5.1", "Billing Overview", "/billing/overview", BILLING, "billing", true),
    page("5.2", "Vendor Statement", "/billing/vendors", BILLING, "billing", true),
    page("5.3", "Media Billing Data Sheet", "/billing/sheet", BILLING, "billing", true),
    page("5.4", "OOH Media Bill Details", "/billing/ooh", "the Billboard Billing Status file, or Manual Entry", "billboard", true),
  ] },
  { code: "6", label: "Data Entry", pages: [
    page("6.1", "Upload Data", "/data-entry", null, null, false, true),
    page("6.2", "Manual Entry", "/data-entry?tab=manual", null, null, false, true),
    page("6.3", "Upload History", "/data-entry?tab=history", null, null, false, true),
    page("6.4", "Businesses & Brands", "/businesses", null, null, false, true),
  ] },
  { code: "7", label: "Settings", pages: [
    page("7.2", "Data Sources", "/settings", null, null, false, true),
    page("7.3", "My Access", "/settings/access", null, null, false, false, "Shows who can see what. Per-person access is switched off for now."),
  ] },
];

export const PRD_PAGES: readonly PrdPage[] = PRD_SECTIONS.flatMap((s) => s.pages);

export function prdPage(href: string): PrdPage | undefined {
  return PRD_PAGES.find((p) => p.href === href);
}

const DATA_ENTRY_TABS = new Set(["manual", "history"]);

export function activeHref(pathname: string, tab: string | null): string | null {
  if (pathname === "/") return "/";
  if (pathname === "/data-entry") return tab && DATA_ENTRY_TABS.has(tab) ? `/data-entry?tab=${tab}` : "/data-entry";
  let best: string | null = null;
  for (const p of PRD_PAGES) {
    if (p.href === "/" || p.href.includes("?")) continue;
    const hit = pathname === p.href || pathname.startsWith(`${p.href}/`);
    if (hit && (!best || p.href.length > best.length)) best = p.href;
  }
  return best;
}

export const OLD_PAGE_TITLES: Readonly<Record<string, string>> = {
  "/old-home": "Old Home",
  "/performance": "Performance",
  "/digital": "Digital Data",
  "/competitors": "Competitor Tracking",
  "/plan": "Plan",
  "/spend": "Spend",
  "/billing": "Billing (old)",
  "/uploads": "Uploads & History",
};
```

- [ ] **Step 4: Run the tests.** The same command now passes. `npx tsc --noEmit` will report errors in `sidebar.tsx` and `top-bar.tsx` (they still import `NAV_ITEMS`). Task 2 fixes those, so leave them; this task commits only the registry and its tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/nav-items.ts src/components/shell/nav-items.test.ts "src/app/(modules)/data-entry/logic.test.ts"
git commit -m "feat(shell): PRD page registry and active-link rule"
```

---

### Task 2: PRD sidebar, breadcrumb, phone Menu drawer and Data updated line

**Files:**
- Rewrite: `src/components/shell/sidebar.tsx`
- Create: `src/components/shell/mobile-menu.tsx`
- Modify: `src/components/shell/top-bar.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/components/shell/data-updated.ts`, `src/components/shell/data-updated.test.ts`
- Create: `src/components/shell/data-updated-line.tsx`
- Modify: `e2e/settings.spec.ts` (the "sidebar shows all sections" test)
- Modify: `e2e/remember-month.spec.ts:20` (it clicks the old "Spend" sidebar link)

**Interfaces:**
- Consumes: `PRD_SECTIONS`, `PRD_PAGES`, `activeHref`, `prdPage`, `OLD_PAGE_TITLES` (Task 1); `ActiveVersion`, `listActiveVersions` (`src/store/datasets.ts`); `FILE_TYPES`, `FileType` (`src/lib/ingest/file-types.ts`); `getStore` (`src/store/client.ts`).
- Produces:

```ts
// sidebar.tsx ("use client")
export function Sidebar(props: { quickActionsSlot?: ReactNode; footerSlot?: ReactNode }): JSX.Element;
// mobile-menu.tsx ("use client")
export function MobileMenu(props: { children: ReactNode }): JSX.Element; // "Menu" button, md:hidden; drawer closes on route or tab change
// top-bar.tsx: TopBar gains `menuSlot?: ReactNode`, rendered first in the bar, before the breadcrumb
// data-updated.ts
export function dataUpdatedLine(active: ActiveVersion[]): string | null;
// data-updated-line.tsx (server)
export async function DataUpdatedLine(): Promise<JSX.Element | null>;
```

- [ ] **Step 1: Write the failing unit test** `src/components/shell/data-updated.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActiveVersion } from "@/store/datasets";
import { dataUpdatedLine } from "./data-updated";

const v = (datasetKey: string, kind: string, iso: string): ActiveVersion =>
  ({ datasetKey, kind, label: datasetKey, fileName: null, createdAt: new Date(iso), source: "upload" });

describe("dataUpdatedLine", () => {
  it("is null for an empty store", () => {
    expect(dataUpdatedLine([])).toBeNull();
  });
  it("shows the latest date per file kind, in the file order, in Dhaka time", () => {
    const line = dataUpdatedLine([
      v("channel", "channel", "2026-11-11T05:00:00Z"),
      v("atl:lux", "atl", "2026-10-01T05:00:00Z"),
      v("atl:savlon-soap", "atl", "2026-10-20T20:30:00Z"), // 21 Oct in Dhaka (UTC+6)
      v("fy", "fy", "2026-10-27T05:00:00Z"),
    ]);
    expect(line).toBe("Data updated: ATL 21 Oct 2026 · FY spend 27 Oct 2026 · channel cost 11 Nov 2026");
  });
  it("ignores kinds it does not know", () => {
    expect(dataUpdatedLine([v("spend", "spend", "2026-10-01T05:00:00Z")])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/shell/data-updated.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Write `src/components/shell/data-updated.ts`**

```ts
import { FILE_TYPES, type FileType } from "@/lib/ingest/file-types";
import type { ActiveVersion } from "@/store/datasets";

const SHORT: Record<FileType, string> = {
  atl: "ATL", calendar: "activity calendar", fy: "FY spend", channel: "channel cost",
  billing: "billing", billboard: "OOH bills", digital: "digital", "ooh-sites": "OOH sites",
};

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });

/** "Data updated: ATL 21 Oct 2026 · FY spend 27 Oct 2026", latest publish per file kind; null when nothing is published. */
export function dataUpdatedLine(active: ActiveVersion[]): string | null {
  const latest = new Map<FileType, Date>();
  for (const a of active) {
    if (!(FILE_TYPES as readonly string[]).includes(a.kind)) continue;
    const k = a.kind as FileType;
    const prev = latest.get(k);
    if (!prev || a.createdAt > prev) latest.set(k, a.createdAt);
  }
  const parts = FILE_TYPES.filter((k) => latest.has(k)).map((k) => `${SHORT[k]} ${day(latest.get(k)!)}`);
  return parts.length ? `Data updated: ${parts.join(" · ")}` : null;
}
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Write `src/components/shell/data-updated-line.tsx`**

```tsx
import { connection } from "next/server";
import { getStore } from "@/store/client";
import { listActiveVersions } from "@/store/datasets";
import { dataUpdatedLine } from "./data-updated";

/** Sidebar footer: when each file was last published. Nothing for an empty store. */
export async function DataUpdatedLine() {
  await connection();
  const line = dataUpdatedLine(await listActiveVersions(await getStore()));
  if (!line) return null;
  return <p data-testid="data-updated" className="px-5 pb-5 text-xs leading-relaxed text-sidebar-foreground/60">{line}</p>;
}
```

- [ ] **Step 5: Rewrite `src/components/shell/sidebar.tsx`** to these rules. The implementation is the implementer's choice inside them.
  - Keep the brand block and `quickActionsSlot` at the top, exactly as today.
  - `<nav aria-label="Main">` lists `PRD_SECTIONS` in order.
    - A one-page section (Home) is a plain link.
    - Every other section is a group header button (`aria-expanded`, `aria-controls`) that shows "<code> <label>" with a chevron, followed by its page links.
  - Each link's accessible name is only the page label. The code ("2.1") goes in a span with `aria-hidden`, so `getByRole("link", { name: "Businesses & Brands", exact: true })` still matches.
  - **Icons:** one per section from lucide-react.
    - 1 House
    - 2 ChartColumn
    - 3 Wallet
    - 4 RadioTower
    - 5 ReceiptText
    - 6 FileUp
    - 7 Settings
  - **The active link** comes from `activeHref(usePathname(), useSearchParams().get("tab"))`. It gets `aria-current="page"` and keeps the current highlight style. Read path and search params in a small inner component inside `<Suspense>` (the current pattern), so the layout still prerenders. The Suspense fallback renders the same list with nothing active.
  - **Open groups:** a group starts open when it holds the active link, and the person can open or close any group. Keep open state in `useState`. When the active link moves into a closed group, open that group. Do not close a group the person opened.
  - **Size:** rows keep the 40px height. Page links are indented under their group.
  - **Bottom:** render `footerSlot` after the nav (`mt-auto`).
  - **Layout:** the component no longer needs the phone sideways row layout, because Step 6 moves phones to the drawer. Use the desktop column layout everywhere.

- [ ] **Step 6: Phone Menu drawer.** Create `src/components/shell/mobile-menu.tsx` (`"use client"`).
  - It renders a ghost `Button` with the `Menu` icon and the text "Menu", in a `md:hidden` wrapper.
  - The button opens a left-side, full-height drawer built from the existing `@/components/ui/dialog` primitives (read `src/components/ui/dialog.tsx` for its exports). The drawer is `bg-sidebar`, 18rem wide (`max-w-[85vw]`), and its dialog title "Menu" is visually hidden.
  - The drawer renders `children`.
  - It closes when pathname or `tab` changes. Watch them with `usePathname`/`useSearchParams` inside Suspense and set open to false in an effect.

Then in `src/app/layout.tsx`:
  - Make the `<aside>` `hidden md:block` (keep its current md classes).
  - Pass `footerSlot={<Suspense fallback={null}><DataUpdatedLine /></Suspense>}` to the desktop `Sidebar`.
  - Pass `TopBar` a `menuSlot` holding `<MobileMenu>` with a second `<Sidebar>` inside. That second Sidebar takes the same `quickActionsSlot` content and the same `footerSlot`.

In `top-bar.tsx`:
  - Add `menuSlot?: ReactNode` and render it before the breadcrumb.
  - The breadcrumb title is `prdPage(activeHref(pathname, tab) ?? "")?.label`. If that is empty, use the longest `OLD_PAGE_TITLES` key that `pathname` equals or starts with plus "/". If that is also empty, show nothing.
  - Read `tab` with `useSearchParams` inside the existing Suspense.
  - Delete `EXTRA_TITLES`.

- [ ] **Step 7: Update the e2e tests that read the old menu.**

In `e2e/settings.spec.ts`, replace the first test:

```ts
import { PRD_PAGES } from "../src/components/shell/nav-items";

test("sidebar shows every PRD page", async ({ page }) => {
  await page.goto("/data-entry");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const s of ["Campaign Performance", "Media Spend", "Channel Wise Spend", "Billing & Statement", "Settings"]) {
    const head = nav.getByRole("button", { name: new RegExp(s) });
    if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
  }
  for (const p of PRD_PAGES) await expect(nav.getByRole("link", { name: p.label, exact: true }), p.code).toBeVisible();
});
```

In `e2e/remember-month.spec.ts`, replace the sidebar click on "Spend" (line 20) with `await shown(page, "/spend");`.

- [ ] **Step 8: Check types, unit tests and the browser**

Run: `npx tsc --noEmit` (expected: no errors) and `npx vitest run` (expected: all pass).
Then start the preview (`preview_start` name `dev`) and check:
  - desktop and phone (375px) screenshots: groups open and close, the active link is highlighted, and the phone Menu opens the drawer, navigates and closes it;
  - the empty store shows no Data updated line.
Stop the preview before running Playwright.
Run: `npx playwright test e2e/settings.spec.ts e2e/phase2c-names.spec.ts e2e/remember-month.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/shell src/app/layout.tsx e2e/settings.spec.ts e2e/remember-month.spec.ts
git commit -m "feat(shell): PRD sidebar with groups, phone Menu drawer, Data updated line"
```

---

### Task 3: Being-built pages for every unbuilt PRD page, old Home moves to /old-home

**Files:**
- Create: `src/components/shell/being-built.tsx`, `src/components/shell/being-built.test.tsx`
- Move: `src/app/(modules)/page.tsx` to `src/app/(modules)/old-home/page.tsx`, and `src/app/(modules)/home-actions.tsx` to `src/app/(modules)/old-home/home-actions.tsx` (`git mv`; fix any import path that breaks)
- Create `page.tsx` at:
  - `src/app/(modules)/page.tsx` (new Home)
  - `atl/`
  - `digital-performance/`
  - `ooh/`
  - `influencer/`
  - `calendar/`
  - `fy-spend/`
  - `channel/electronic/`, `channel/digital/`, `channel/press-radio/`
  - `billing/overview/`, `billing/vendors/`, `billing/sheet/`, `billing/ooh/`
  - `settings/access/`

  All of these sit under `src/app/(modules)/`.
- Modify: `src/proxy.ts` (matcher: `"/"` becomes `"/old-home"`)
- Modify: `e2e/home.spec.ts`, `e2e/billing.spec.ts`, `e2e/remember-month.spec.ts`. Every `page.goto("/")` and `shown(page, "/")` that expects old Home content becomes `"/old-home"`. Leave `phase1-access.spec.ts` alone: it only needs `/` to load and to show the top bar.
- Modify: any link in `src/` that points to `/` for old Home content (for example quick actions or home links). Run `grep -rn 'href="/"' src` and keep the logo link on `/`.

**Interfaces:**
- Consumes: `prdPage`, `PrdPage` (Task 1); `PageHeader` (`src/components/shell/page-header.tsx`); `AdminOnly` (`src/components/shell/admin-only.tsx`); `buttonVariants` and `cn`.
- Produces:

```tsx
export function beingBuiltMetadata(href: string): Metadata; // { title: label }
export function BeingBuilt(props: { href: string; filterSlot?: ReactNode }): JSX.Element; // throws if href is not in PRD_PAGES
```

The card link target for the admin is `/data-entry#card-<card>`. Task 4 adds that `id` to the cards.

- [ ] **Step 1: Write the failing unit test** `src/components/shell/being-built.test.tsx`, rendering with `renderToStaticMarkup` from `react-dom/server` (as `card-face.test.ts` does). `AdminOnly` is async and reads cookies, so test the pure part. Export `BeingBuiltBody({ page, admin })` from `being-built.tsx` and test that:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prdPage } from "./nav-items";
import { BeingBuiltBody } from "./being-built";

describe("BeingBuiltBody", () => {
  it("names the file and links the admin to the card", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/fy-spend")!} admin />);
    expect(html).toContain("This page is being built.");
    expect(html).toContain("It will read: the CB Media Spent Report, or Manual Entry");
    expect(html).toContain('href="/data-entry#card-fy"');
  });
  it("gives a viewer no link", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/fy-spend")!} admin={false} />);
    expect(html).not.toContain("/data-entry#card-fy");
  });
  it("shows the note when the page reads no file", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/settings/access")!} admin />);
    expect(html).toContain("Per-person access is switched off for now.");
    expect(html).not.toContain("It will read");
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (`npx vitest run src/components/shell/being-built.test.tsx`; FAIL, module not found).

- [ ] **Step 3: Write `src/components/shell/being-built.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { Hammer } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { EmptyState } from "@/components/data/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { prdPage, type PrdPage } from "./nav-items";

const need = (href: string): PrdPage => {
  const p = prdPage(href);
  if (!p) throw new Error(`Not a PRD page: ${href}`);
  return p;
};

export function beingBuiltMetadata(href: string): Metadata {
  return { title: need(href).label };
}

export function BeingBuiltBody({ page, admin }: { page: PrdPage; admin: boolean }) {
  return (
    <EmptyState icon={Hammer} title="This page is being built." message={page.files ? `It will read: ${page.files}` : page.note}>
      {admin && page.card && (
        <Link href={`/data-entry#card-${page.card}`} className={cn(buttonVariants({ variant: "outline" }))}>Open its upload card</Link>
      )}
    </EmptyState>
  );
}

async function WithAdmin({ page }: { page: PrdPage }) {
  await connection();
  return <BeingBuiltBody page={page} admin={await isAdmin()} />;
}

/** A PRD page whose link works but whose content is not built yet (spec: Pages not built yet). */
export function BeingBuilt({ href, filterSlot }: { href: string; filterSlot?: ReactNode }) {
  const page = need(href);
  return (
    <>
      <PageHeader title={`${page.code} ${page.label}`}>{filterSlot}</PageHeader>
      <Suspense fallback={<BeingBuiltBody page={page} admin={false} />}>
        <WithAdmin page={page} />
      </Suspense>
    </>
  );
}
```

(Check `PageHeader`'s props in `src/components/shell/page-header.tsx`. If it needs a `subtitle` or names its children slot differently, match it. If `EmptyState.message` is not a string type, adjust.)

- [ ] **Step 4: Move the old Home.** Run `git mv "src/app/(modules)/page.tsx" "src/app/(modules)/old-home/page.tsx"` and `git mv "src/app/(modules)/home-actions.tsx" "src/app/(modules)/old-home/home-actions.tsx"`. In the moved page, set `metadata` to `{ title: "Old Home" }`. Fix every link inside it that builds `/?month=` so it becomes `/old-home?month=`. In `src/proxy.ts`, change the matcher entry `"/"` to `"/old-home"`.

- [ ] **Step 5: Create the route files.** Each one has exactly this shape, with its own href:

```tsx
import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/atl");

export default function Page() {
  return <BeingBuilt href="/atl" />;
}
```

The hrefs are:
- `/` in `(modules)/page.tsx`
- `/atl`
- `/digital-performance`
- `/ooh`
- `/influencer`
- `/calendar`
- `/fy-spend`
- `/channel/electronic`, `/channel/digital`, `/channel/press-radio`
- `/billing/overview`, `/billing/vendors`, `/billing/sheet`, `/billing/ooh`
- `/settings/access`

Check that the nested `billing/*` and `settings/access` routes do not inherit a layout that breaks them. There is no `layout.tsx` in those folders today.

- [ ] **Step 6: Update e2e paths** in `home.spec.ts`, `billing.spec.ts` and `remember-month.spec.ts`, as listed under Files.

- [ ] **Step 7: Verify.**
  - `npx tsc --noEmit` and `npx vitest run`: all pass.
  - Preview check: `/`, `/fy-spend`, `/billing/overview` and `/settings/access` show their title and line. `/old-home` shows the old Home. `/billing` still shows the old Billing page.
  - Stop the preview, then run `npx playwright test e2e/home.spec.ts e2e/billing.spec.ts e2e/remember-month.spec.ts e2e/phase1-access.spec.ts`: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A "src/app/(modules)" src/components/shell/being-built.tsx src/components/shell/being-built.test.tsx src/proxy.ts e2e/home.spec.ts e2e/billing.spec.ts e2e/remember-month.spec.ts
git commit -m "feat(shell): every PRD page has a working being-built page; old Home moves to /old-home"
```

---

### Task 4: Shared "No data yet" empty state, card anchors and the BDT Mn formatter

**Files:**
- Create: `src/components/data/no-data-yet.tsx`, `src/components/data/no-data-yet.test.tsx`
- Modify: `src/app/(modules)/data-entry/card-face.tsx:19` (add `id`), `src/app/(modules)/data-entry/card-face.test.ts` (assert it)
- Modify: `src/lib/money.ts`; create `src/lib/money.test.ts` if it does not exist (otherwise add to it)

**Interfaces:**
- Consumes: `CardKey` (`src/lib/ingest/cards.ts`), `EmptyState`.
- Produces:

```ts
export const BDT_MN = "BDT Mn";
export function formatBdtMn(taka: number): string; // 12_340_000 -> "12.34 BDT Mn"; 1_234_560_000 -> "1,234.56 BDT Mn"; -500_000 -> "-0.50 BDT Mn"
export function NoDataYet(props: { fileName: string; card: CardKey | null; admin: boolean }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests.**

`src/lib/money.test.ts` (add this describe block):

```ts
import { describe, expect, it } from "vitest";
import { BDT_MN, formatBdtMn } from "./money";

describe("formatBdtMn", () => {
  it("shows taka as millions with 2 decimals and the unit", () => {
    expect(formatBdtMn(12_340_000)).toBe("12.34 BDT Mn");
    expect(formatBdtMn(1_234_560_000)).toBe("1,234.56 BDT Mn");
    expect(formatBdtMn(0)).toBe("0.00 BDT Mn");
    expect(formatBdtMn(-500_000)).toBe("-0.50 BDT Mn");
    expect(BDT_MN).toBe("BDT Mn");
  });
});
```

`src/components/data/no-data-yet.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoDataYet } from "./no-data-yet";

describe("NoDataYet", () => {
  it("names the file and gives the admin an Upload it link to the card", () => {
    const html = renderToStaticMarkup(<NoDataYet fileName="CB Media Spent Report" card="fy" admin />);
    expect(html).toContain("No data yet");
    expect(html).toContain("This page needs the CB Media Spent Report file.");
    expect(html).toContain('href="/data-entry#card-fy"');
    expect(html).toContain("Upload it");
  });
  it("tells a viewer it is not uploaded yet, with no link", () => {
    const html = renderToStaticMarkup(<NoDataYet fileName="CB Media Spent Report" card="fy" admin={false} />);
    expect(html).toContain("Not uploaded yet. The admin uploads it in Data Entry.");
    expect(html).not.toContain("Upload it");
  });
});
```

In `card-face.test.ts`, next to the existing `data-card-id="atl"` assertion, add `expect(html).toContain('id="card-atl"');`.

- [ ] **Step 2: Run them and watch them fail** (`npx vitest run src/lib/money.test.ts src/components/data/no-data-yet.test.tsx "src/app/(modules)/data-entry/card-face.test.ts"`).

- [ ] **Step 3: Implement.**

Append to `src/lib/money.ts`:

```ts
export const BDT_MN = "BDT Mn";

/** Page amounts: taka shown as millions, 2 decimals, always with the unit (PRD currency rule). */
export function formatBdtMn(taka: number): string {
  const mn = taka / 1_000_000;
  return `${mn.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${BDT_MN}`;
}
```

`src/components/data/no-data-yet.tsx`:

```tsx
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import type { CardKey } from "@/lib/ingest/cards";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

/** A built page with no data: names the file; the admin can jump to its upload card. */
export function NoDataYet({ fileName, card, admin }: { fileName: string; card: CardKey | null; admin: boolean }) {
  return (
    <EmptyState icon={FileSpreadsheet} title="No data yet" message={`This page needs the ${fileName} file.`}>
      {admin && card ? (
        <Link href={`/data-entry#card-${card}`} className={cn(buttonVariants())}>Upload it</Link>
      ) : (
        !admin && <p className="text-sm text-gray-500">Not uploaded yet. The admin uploads it in Data Entry.</p>
      )}
    </EmptyState>
  );
}
```

In `card-face.tsx`, add `id={`card-${state.id}`}` to the `<Card data-testid="upload-card" ...>` element. Also add `scroll-mt-20` so the sticky top bar does not cover a card opened by its link.

- [ ] **Step 4: Run the tests. Expected: PASS.** Then run `npx vitest run` for the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts src/components/data/no-data-yet.tsx src/components/data/no-data-yet.test.tsx "src/app/(modules)/data-entry/card-face.tsx" "src/app/(modules)/data-entry/card-face.test.ts"
git commit -m "feat(shell): No data yet empty state, upload card anchors, BDT Mn formatter"
```

---

### Task 5: Business filter (buttons up to 4, dropdown with search above), remembered across pages

**Files:**
- Create: `src/lib/business-filter.ts`, `src/lib/business-filter.test.ts`
- Create: `src/components/shell/business-filter.tsx` (server), `src/components/shell/business-filter-control.tsx` (client)
- Modify: `src/components/shell/being-built.tsx`. `BeingBuilt` renders `<Suspense fallback={null}><BusinessFilter /></Suspense>` as `filterSlot` when `page.businessFilter` is true. Do this inside `BeingBuilt` itself; the route files stay unchanged.

**Interfaces:**
- Consumes: `getCatalog`, `CatalogBusiness` (`src/store/catalog.ts`), `getStore`, `SegmentedButtons`, `DropdownMenu` parts (`src/components/ui/dropdown-menu.tsx`), `KEEP_SECONDS` (`src/lib/view-cookies.ts`).
- Produces:

```ts
// src/lib/business-filter.ts (pure)
export const BUSINESS_COOKIE = "aci-business";
export const BUTTONS_MAX = 4;
export type BusinessFilterView = {
  mode: "none" | "buttons" | "dropdown";
  options: { slug: string; name: string }[]; // visible businesses in catalog order; "All businesses" is NOT in this list
  value: string;                             // "" = All businesses, else a slug from options
};
export function businessFilterView(businesses: { slug: string; name: string; hidden: boolean }[], saved: string | undefined): BusinessFilterView;

// src/components/shell/business-filter.tsx (server)
export async function getBusinessChoice(): Promise<{ slug: string; name: string } | null>; // null = All businesses; for pages built next
export async function BusinessFilter(): Promise<JSX.Element | null>;                     // null when mode is "none"

// src/components/shell/business-filter-control.tsx ("use client")
export function BusinessFilterControl(props: { view: BusinessFilterView }): JSX.Element;
```

- [ ] **Step 1: Write the failing test** `src/lib/business-filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { businessFilterView } from "./business-filter";

const biz = (n: number, hiddenAt: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ slug: `b${i}`, name: `Business ${i}`, hidden: hiddenAt.includes(i) }));

describe("businessFilterView", () => {
  it("is none when there are no visible businesses", () => {
    expect(businessFilterView([], undefined).mode).toBe("none");
    expect(businessFilterView(biz(2, [0, 1]), undefined).mode).toBe("none");
  });
  it("uses buttons up to 4 and a dropdown from 5", () => {
    expect(businessFilterView(biz(4), undefined).mode).toBe("buttons");
    expect(businessFilterView(biz(5), undefined).mode).toBe("dropdown");
    expect(businessFilterView(biz(5, [4]), undefined).mode).toBe("buttons"); // counts visible only
  });
  it("leaves hidden businesses out, keeping list order", () => {
    expect(businessFilterView(biz(3, [1]), undefined).options.map((o) => o.slug)).toEqual(["b0", "b2"]);
  });
  it("keeps a saved choice that is still visible, else falls back to All", () => {
    expect(businessFilterView(biz(3), "b2").value).toBe("b2");
    expect(businessFilterView(biz(3, [2]), "b2").value).toBe("");
    expect(businessFilterView(biz(3), "gone").value).toBe("");
    expect(businessFilterView(biz(3), undefined).value).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail** (`npx vitest run src/lib/business-filter.test.ts`).

- [ ] **Step 3: Write `src/lib/business-filter.ts`**

```ts
// The shared Business filter (spec: Business filter). A view control: it never changes saved data.
export const BUSINESS_COOKIE = "aci-business";
export const BUTTONS_MAX = 4; // more than this and buttons get crowded (Hick's law): use a dropdown

export type BusinessFilterView = {
  mode: "none" | "buttons" | "dropdown";
  options: { slug: string; name: string }[];
  value: string;
};

export function businessFilterView(businesses: { slug: string; name: string; hidden: boolean }[], saved: string | undefined): BusinessFilterView {
  const options = businesses.filter((b) => !b.hidden).map(({ slug, name }) => ({ slug, name }));
  const mode = options.length === 0 ? "none" : options.length <= BUTTONS_MAX ? "buttons" : "dropdown";
  const value = saved && options.some((o) => o.slug === saved) ? saved : "";
  return { mode, options, value };
}
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Write the server part** `src/components/shell/business-filter.tsx`:

```tsx
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import { BUSINESS_COOKIE, businessFilterView } from "@/lib/business-filter";
import { BusinessFilterControl } from "./business-filter-control";

async function view() {
  await connection();
  const saved = (await cookies()).get(BUSINESS_COOKIE)?.value;
  return businessFilterView((await getCatalog(await getStore())).businesses, saved);
}

/** For the pages built next: the business the person chose, or null for All businesses. Checked against the catalog. */
export async function getBusinessChoice(): Promise<{ slug: string; name: string } | null> {
  const v = await view();
  return v.options.find((o) => o.slug === v.value) ?? null;
}

export async function BusinessFilter() {
  const v = await view();
  return v.mode === "none" ? null : <BusinessFilterControl view={v} />;
}
```

- [ ] **Step 5: Write the client part** `src/components/shell/business-filter-control.tsx` (`"use client"`).

How it applies a choice: write the cookie
`document.cookie = `${BUSINESS_COOKIE}=${slug}; path=/; max-age=${KEEP_SECONDS}; samesite=lax``
(an empty slug clears it with `max-age=0`), then call `router.refresh()` from `useRouter`. Use `useTransition` so the control can show pending state.

What it renders in each mode:
- **"buttons":** `SegmentedButtons` with `label="Business"` and items "All businesses" (key `""`) followed by each option.
- **"dropdown":** a `DropdownMenu`.
  - The trigger is an outline pill button with the `Building2` icon. Its accessible name is "Business: <current name or All businesses>" and it shows the current name.
  - The content starts with an `Input` labelled "Search businesses", which filters the list by name, case-insensitive.
  - Next comes an "All businesses" item, then each matching option as a radio item that is checked when it is the current value.
  - Typing in the search box must not move focus or trigger menu typeahead: stop key events from bubbling out of the input, except Escape.
  - When nothing matches, show "No business matches."
  - Choosing an item applies it and closes the menu.

- [ ] **Step 6: Wire it into `BeingBuilt`** (Task 3's file). When `page.businessFilter` is true, pass `filterSlot={<Suspense fallback={null}><BusinessFilter /></Suspense>}` to `PageHeader`.

- [ ] **Step 7: Verify in the browser** (preview, signed-in admin, real dev store):
  - With today's businesses, `/fy-spend` shows the filter. A choice there is still selected on `/atl` and after a refresh.
  - `/channel/electronic` and `/data-entry` show no filter.
  - Hide a business on Businesses & Brands and confirm it leaves the filter, and that a remembered choice of it falls back to "All businesses".
  - Add businesses until there are 5 visible: the dropdown appears and the search works. Afterwards, hide the test businesses again (hide only: businesses are never deleted).
  - Take phone and desktop screenshots.

Run: `npx tsc --noEmit`, `npx vitest run`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/business-filter.ts src/lib/business-filter.test.ts src/components/shell/business-filter.tsx src/components/shell/business-filter-control.tsx src/components/shell/being-built.tsx
git commit -m "feat(shell): shared Business filter, buttons up to 4 and a searchable dropdown above"
```

---

### Task 6: Phase 3 shell user flow as Playwright tests (empty store first)

**Files:**
- Create: `e2e/phase3-shell.spec.ts` (runs on the empty store), `e2e/phase3-business-filter.spec.ts` (runs after the other specs have created businesses)
- Modify: `playwright.config.ts`. Add a project `empty-store`:
  - `testMatch: /phase3-shell\.spec\.ts/`, admin storage state, Desktop Chrome, `dependencies: ["admin-setup"]`;
  - make `fresh-store` depend on `["admin-setup", "empty-store"]`;
  - add `/phase3-shell\.spec\.ts/` to `chromium`'s `testIgnore`.
  - The empty-store project must not create businesses, brands or ATL categories, and must not upload. `phase2c` relies on empty lists.

**Interfaces:**
- Consumes: `PRD_PAGES` (Task 1), the Copy strings in Global Constraints.

- [ ] **Step 1: Write `e2e/phase3-shell.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { PRD_PAGES } from "../src/components/shell/nav-items";

// Phase 3 shell flow from an EMPTY store (runs before any upload). Do not create businesses or upload here.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const openAllGroups = async (page: Page) => {
  for (const head of await nav(page).getByRole("button").all()) {
    if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
  }
};

test("every sidebar link opens its page; unbuilt pages name their file", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("data-updated")).toHaveCount(0); // empty store
  for (const p of PRD_PAGES) {
    await openAllGroups(page);
    await nav(page).getByRole("link", { name: p.label, exact: true }).click();
    await expect(nav(page).getByRole("link", { name: p.label, exact: true }), p.code).toHaveAttribute("aria-current", "page");
    if (!p.built) {
      await expect(page.getByRole("heading", { name: `${p.code} ${p.label}` })).toBeVisible();
      await expect(page.getByText("This page is being built.")).toBeVisible();
      await expect(page.getByText(p.files ? `It will read: ${p.files}` : p.note!)).toBeVisible();
    }
  }
});

test("the admin gets the upload card link, and it opens that card", async ({ page }) => {
  await page.goto("/fy-spend");
  await page.getByRole("link", { name: "Open its upload card" }).click();
  await expect(page).toHaveURL(/\/data-entry#card-fy$/);
  await expect(page.locator("#card-fy")).toBeInViewport();
});

test.describe("viewer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("sees the being-built note with no upload link", async ({ page }) => {
    await page.goto("/fy-spend");
    await expect(page.getByText("This page is being built.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open its upload card" })).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("the Menu drawer opens, navigates and closes", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page)).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: /Media Spend/ }).click();
    await drawer.getByRole("link", { name: "FY Media Spend", exact: true }).click();
    await expect(page).toHaveURL(/\/fy-spend$/);
    await expect(drawer).toBeHidden();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(375);
  });
});
```

(When the desktop `<aside>` is `hidden md:block`, the phone page has exactly one "Main" nav, inside the drawer. If both render in the DOM, scope the desktop checks to the visible one. Adjust the locator, not the behaviour.)

- [ ] **Step 2: Write `e2e/phase3-business-filter.spec.ts`** (chromium project; businesses exist from earlier specs):

```ts
import { test, expect, type Page } from "@playwright/test";

// The shared Business filter keeps its choice across pages and a refresh, and is absent where the PRD hides it.

const choose = async (page: Page, name: string) => {
  const buttons = page.getByRole("group", { name: "Business" });
  if (await buttons.count()) return buttons.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: /^Business: / }).click();
  await page.getByLabel("Search businesses").fill(name);
  await page.getByRole("menuitemradio", { name, exact: true }).click();
};
const current = async (page: Page, name: string) => {
  const buttons = page.getByRole("group", { name: "Business" });
  if (await buttons.count()) return expect(buttons.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  return expect(page.getByRole("button", { name: `Business: ${name}` })).toBeVisible();
};

test("the Business filter is remembered across pages and refreshes", async ({ page }) => {
  await page.goto("/fy-spend");
  const first = page.getByRole("group", { name: "Business" }).getByRole("button").nth(1);
  const name = (await first.count())
    ? (await first.textContent())!.trim()
    : "Toiletries";
  await choose(page, name);
  await current(page, name);
  await page.goto("/atl");
  await current(page, name);
  await page.reload();
  await current(page, name);
  await choose(page, "All businesses");
  await current(page, "All businesses");
});

test("pages the PRD keeps unfiltered show no Business filter", async ({ page }) => {
  for (const p of ["/channel/electronic", "/data-entry", "/settings/access"]) {
    await page.goto(p);
    await expect(page.getByRole("group", { name: "Business" }), p).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Business: / }), p).toHaveCount(0);
  }
});
```

(In dropdown mode, "Toiletries" is a visible business in every e2e run: phase2c adds it. If it is not, pick the first `menuitemradio` after opening the menu.)

- [ ] **Step 3: Run the new specs, then the whole suite.** First stop any preview on port 3000.
  - Run `npx playwright test e2e/phase3-shell.spec.ts e2e/phase3-business-filter.spec.ts`. Expected: PASS.
  - Run `npx playwright test` in the background. Expected: all pass (72 earlier plus the new ones).

- [ ] **Step 4: Commit**

```bash
git add e2e/phase3-shell.spec.ts e2e/phase3-business-filter.spec.ts playwright.config.ts
git commit -m "test(shell): Phase 3 shell flow from an empty store, and the remembered Business filter"
```

---

## After the tasks (controller)

- Whole-branch final review (opus), then the browser QA walk on desktop and phone: an empty store first, then the dev store.
- Tick the tracker: p3-01 (shell) and p3-20 (mobile and laptop layout, sidebar part only; leave it open if the dark mode toggle is still missing, and say so in its note).
- Update the flows artifact: Phase 3 shell is built.
- Finish: merge `--no-ff` into main, push main and the branch to `personal`, no PR.
