# Manual Entry view controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Manual Entry tables get three view-only controls: quarter buttons on Channel cost and FY media spend, a Submit Date month range on OOH bills, and a Columns menu on OOH bills. None of them changes what a save sends.

**Architecture:** Pure, unit-tested helpers in `manual-drafts.ts` do all the work: quarter month indexes, the default quarter, the Submit Date month list, the range filter (composed into `billsToShow`), and the bill column set with a safe localStorage read and write. The Manual Entry shell holds the shared quarter and the bill range (as it already holds the bill search), so both survive the remount after a save. The editors render only the chosen month columns and bill columns; their drafts still hold all 12 months and every bill field, so the save payloads are byte-for-byte what they were.

**Tech Stack:** Next.js 16.4.6 App Router (cacheComponents), React 19, TypeScript strict, Tailwind 4, shadcn on base-ui (`@base-ui/react` Menu), Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-22-manual-entry-view-controls-design.md`. **Branch:** `feat/manual-entry-view` (already checked out), from `main` at 552c6c7, with the spec commit f19b81e.

## Global Constraints

Project rules, verbatim from the spec:
- "They change only what the tables show, never the data that is saved."
- Quarter buttons: "A joined button row above the table: "Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun", "Full year". Only the chosen quarter's month columns show (3 months, or 12 for Full year)."
- "It opens on the quarter that today (Asia/Dhaka) falls in, when today is inside the FY the editor shows. Otherwise it opens on "Full year"."
- "One choice is shared by the Channel cost and FY media spend sections (it lives in the Manual Entry shell). It is not remembered after a reload."
- "The FY table always keeps its "Last FY" column. The Channel table always keeps SL, the name column and the remove button."
- Range: "In the bills toolbar: "Submitted from" [month] "to" [month], on each bill's Submit Date." "Each list starts with "Any", then every month that appears in the bills' Submit Dates, oldest first, shown as Mon'YY." "It opens on Any to Any, which shows every bill. A bill with no Submit Date shows only when both ends are Any." ""From" alone means that month and later; "to" alone means up to and including that month. If From is later than To, no bill matches." "It works together with the search box and the 40-row "Show all N" rule. A count line shows "N of M bills" when a filter or search is active." "When nothing matches, the table body shows "No bills match.""
- Columns: "A "Columns" button opens a tick list." "SL, Vendor, Status and Edit always show and are not in the list." "The list has PO, Bill No, PO Amount, Bill Amount, Brand, Location, in that order." "It opens with Bill No and Bill Amount ticked. The browser remembers the ticks (per browser, wrapped in try/catch, falling back to the default)."
- "**View only.** Hiding a month or a column never removes data. Saving still sends all 12 months and every bill field, exactly as before."
- "**Viewers** can use all three controls; they change only the view."
- "**Phone (375 px).** The quarter row and the bills toolbar wrap or scroll inside their own box, with no page side scroll."
- Out of scope (spec section 2): "save rules and the server; uploads and every other page; a Columns menu on Channel cost or FY media spend; a sticky Edit column; remembering the quarter after reload."
- "The Columns menu uses the shared `DropdownMenuCheckboxItem`."

Exact UI strings (spec section 4, verbatim): "Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun", "Full year"; "Submitted from", "to", "Any"; "Columns"; "N of M bills"; "No bills match." The dashes in the quarter labels are en dashes (U+2013). The column names in the Columns list are the table's existing headers: "PO", "Bill No", "PO Amount", "Bill Amount", "Brand", "Location".

Names this plan adds that are not on screen (change them here if wanted): the quarter row's group name "Quarter" (its accessible name); test ids `quarter-row` and `bills-toolbar`; the localStorage key `aci-manual-bill-columns`.

Project rules from earlier plans, still in force:
- App folder `aci-media-dashboard/`; run every command from there. Next.js 16 has breaking changes (`AGENTS.md`). The one Next.js point this plan touches: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md` says a Client Component that reads the clock is a problem only when it would land in the static shell. `ManualEntry` renders inside `DataEntryContent`, which calls `await connection()` inside a `<Suspense>` (`page.tsx`), so it renders per request and never prerenders. Reading `new Date()` in a `useState` initializer there is fine, as `bill-dialog.tsx` already does. Do not add `io()`, `"use cache"` or a new Suspense boundary.
- UI uses the shared components: `SegmentedButtons` from `@/components/data/segmented` (the joined button row already used for the section switch), `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` and `DropdownMenuCheckboxItem` from `@/components/ui/dropdown-menu`, `buttonVariants` from `@/components/ui/button`, native `<select>` with the same classes as the FY brand select. Check desktop and the 375 px phone.
- Keep every existing aria-label and test id: `Manual Entry sections`, `Channel cost sheets`, `channel-table`, `fy-table`, `FY brand`, `Search bills`, `manual-bills-table`, `manual-channel`, `manual-fy`, `manual-bills`, the `<column> <n> <Mon'YY>` and `<Media> <Mon'YY>` box labels, `<Media> Last FY`, `Edit bill …`. Existing e2e tests that touch a month a quarter now hides are updated in the same task (Task 2).
- Store-heavy Vitest files close the stores they open (`afterAll`), as `src/server/ingest.test.ts` does. This plan adds no store test; the rule applies if one is touched.
- Commits are small Conventional Commits. The message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with a heredoc through the Bash tool (`git commit -F - <<'EOF' … EOF`). Stage exact paths only; quote paths that contain `(modules)`. Never stage `netlify.toml`, `.env*`, `Asset/`, `.spine/`, `test-results/`, `e2e/.auth/`. If `next dev` (started by Playwright) rewrites `AGENTS.md`, leave it out of these commits and mention it in the task report.
- A hook blocks Bash commands that mention merge or push next to backticks or `$(...)`. Keep those words out of commit messages and command lines.

Security constraints (security-standard section 1; a violation is Critical). **This plan touches no server or data path:** no server action, route, store function, zod schema, cookie, upload or dependency changes. The server zod schemas (`ChannelSaveSchema`, `FySaveSchema`, `BillChangeSchema`) are unchanged, so the client must keep sending what they require.
- **Rule 1:** "No secrets in code. API keys, tokens, passwords, signing secrets and connection strings live only in git-ignored env files and the host's secret store. Never in source, tests, docs, fixtures, client bundles or commit history." localStorage holds only the six column keys, never data or identity.
- **Rule 3:** "Every route is authenticated and authorised on the server. … No route relies on the client hiding a button." The viewer may use the view controls; saves stay behind `requireAdmin()` in the existing actions, untouched.
- **Rule 9:** "Input is validated on the server, and the database enforces key invariants itself." Saves must still send all 12 months for every Channel and FY row and every bill field: `channelInput`, `fyInput` and `billInput` are not changed, and Task 1 and Task 2 each prove a hidden month is still sent.
- **Rule 10:** "No process-global side effects from a product module." The Columns listener set in `billboard-editor.tsx` is browser-only module state: no timers, no global listeners at import (the `storage` listener is added in `subscribe` and removed on unsubscribe).
- **Rule 11:** "Tests never touch production." Vitest helpers are pure (no store); Playwright uses the temp data folder from `playwright.config.ts`.
- **Rule 13:** "No claim without proof." "View only" is proved by tests: the unit test that a month outside the quarter is in `channelInput`/`fyInput`, and the browser test that an edit made, then hidden, is saved.
- Section 2 checklist for every task: no secret in the diff; no new route, cookie or dependency; no module-level side effects.

---

## File Structure

- `src/app/(modules)/data-entry/manual-drafts.ts` (modify, pure, browser-safe). **Seam adds:** `Quarter`, `QUARTER_TABS`, `quarterMonths`, `defaultQuarter`; `ANY_MONTH`, `BillRange`, `ANY_RANGE`, `submitMonthOptions`, `inBillRange`, `billFilterActive`, `billsCount`; `billsToShow` gains an optional `range`; `BILL_COLUMNS`, `BillColumn`, `DEFAULT_BILL_COLUMNS`, `BILL_COLUMNS_KEY`, `parseBillColumns`, `readStoredColumns`, `writeBillColumns`, `toggleBillColumn`. Nothing existing changes behaviour.
- `src/app/(modules)/data-entry/manual-drafts.test.ts` (modify): the unit tests for every helper above.
- `src/app/(modules)/data-entry/quarter-buttons.tsx` (new). **Seam:** `QuarterButtons({ value, onChange })`, the joined row in its own scroll box (test id `quarter-row`, group name "Quarter").
- `src/app/(modules)/data-entry/manual-entry.tsx` (modify). **Seam unchanged:** `ManualEntry({ admin, data })`. It now also holds `quarter` (Task 2) and `billRange` (Task 3).
- `src/app/(modules)/data-entry/channel-editor.tsx`, `fy-editor.tsx` (modify). **Seam adds** the props `quarter: Quarter; onQuarter: (q: Quarter) => void`.
- `src/app/(modules)/data-entry/billboard-editor.tsx` (modify). **Seam adds** the props `range: BillRange; onRange: (r: BillRange) => void`. Inside: the range selects, the Columns menu, the count line, "No bills match." and the browser-only Columns store.
- `e2e/manual-entry.spec.ts` (modify): helpers `quarterButton`, `pickQuarter`, `openingQuarter`; tests 4 to 6; the viewer and phone tests extended.

---

### Task 1: Pure view-control helpers

**Files:**
- Modify: `src/app/(modules)/data-entry/manual-drafts.ts`
- Test: `src/app/(modules)/data-entry/manual-drafts.test.ts`

**Interfaces:**
- Consumes: `monthLabel` from `@/lib/ingest/cells` (`"2026-10"` → `"Oct'26"`); `currentFyStart(now: Date): number` and `dhakaDate(now: Date): string` from `@/lib/manual/rules`; `BillboardRow` (its `sb: string | null` is the Submit Date, `"YYYY-MM-DD"`); `normName` from `@/lib/names-normal`; the existing `billMatches`, `BILLS_SHOWN`, `channelDraft`, `setChannelAmount`, `channelInput`, `fyDraft`, `setFyAmount`, `fyInput`.
- Produces:
```ts
export type Quarter = "q1" | "q2" | "q3" | "q4" | "full";
export const QUARTER_TABS: readonly { key: Quarter; label: string }[];   // Q1 Jul–Sep … Full year
export function quarterMonths(q: Quarter): number[];                     // month indexes, 0 = Jul … 11 = Jun
export function defaultQuarter(now: Date, fyStart: number): Quarter;    // today's quarter in Dhaka, or "full" outside that FY
export const ANY_MONTH: "";
export type BillRange = { from: string; to: string };                    // "YYYY-MM" or ANY_MONTH
export const ANY_RANGE: BillRange;
export function submitMonthOptions(rows: BillboardRow[], range?: BillRange): { value: string; label: string }[];
export function inBillRange(r: BillboardRow, range: BillRange): boolean;
export function billsToShow(rows: BillboardRow[], query: string, showAll: boolean, range?: BillRange):
  { shown: BillboardRow[]; matching: number };                           // range defaults to ANY_RANGE
export function billFilterActive(query: string, range: BillRange): boolean;
export function billsCount(n: number, total: number): string;            // "N of M bills"
export const BILL_COLUMNS: readonly [{ key: "po"; label: "PO" }, { key: "bill"; label: "Bill No" }, { key: "poa"; label: "PO Amount" },
  { key: "ba"; label: "Bill Amount" }, { key: "b"; label: "Brand" }, { key: "loc"; label: "Location" }];
export type BillColumn = "po" | "bill" | "poa" | "ba" | "b" | "loc";
export const DEFAULT_BILL_COLUMNS: readonly BillColumn[];                // ["bill", "ba"]
export const BILL_COLUMNS_KEY: "aci-manual-bill-columns";
export function parseBillColumns(raw: string | null): BillColumn[];      // table order; anything bad gives the default
export function readStoredColumns(storage: Pick<Storage, "getItem"> | null): string | null;   // never throws
export function writeBillColumns(storage: Pick<Storage, "setItem"> | null, cols: readonly BillColumn[]): boolean;  // false when not stored
export function toggleBillColumn(cols: readonly BillColumn[], key: BillColumn, on: boolean): BillColumn[];
```

- [ ] **Step 1: Write the failing tests.** In `src/app/(modules)/data-entry/manual-drafts.test.ts`, replace the `import { … } from "./manual-drafts";` block (lines 4 to 7) with:

```ts
import {
  ANY_MONTH, ANY_RANGE, BILL_COLUMNS, BILL_COLUMNS_KEY, CHANNEL_TABS, DEFAULT_BILL_COLUMNS, NEW_BRAND, QUARTER_TABS, addChannelRow, addFyBrand,
  amountText, billFilterActive, billForm, billInput, billMatches, billsCaption, billsCount, billsToShow, brandChoices, brandToAdd, channelDraft,
  channelInput, defaultQuarter, fyBrandGroups, fyDraft, fyInput, fyTable, inBillRange, isDirty, newBillForm, parseBillColumns, quarterMonths,
  readAmount, readStoredColumns, removeChannelRow, setChannelAmount, setChannelName, setFyAmount, submitMonthOptions, toggleBillColumn,
  withCurrent, writeBillColumns,
} from "./manual-drafts";
```

Then append at the end of the file:

```ts
describe("view controls", () => {
  const bill = (sl: number, sb: string | null): BillboardRow => ({
    sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 1000, ba: 800, diff: 200, st: null, en: null, sb, pr: null,
    stR: null, enR: null, biz: "Salt", bz: "Salt", b: "ACI Salt", billc: null, chq: null, loc: "Gulshan", cm: "", show: "", status: "Payment Done", sl,
  });

  it("names the quarter buttons in FY order and maps each to its months (0 = Jul … 11 = Jun)", () => {
    expect(QUARTER_TABS.map((q) => [q.key, q.label])).toEqual([
      ["q1", "Q1 Jul–Sep"], ["q2", "Q2 Oct–Dec"], ["q3", "Q3 Jan–Mar"], ["q4", "Q4 Apr–Jun"], ["full", "Full year"],
    ]);
    expect(quarterMonths("q1")).toEqual([0, 1, 2]);
    expect(quarterMonths("q2")).toEqual([3, 4, 5]);
    expect(quarterMonths("q3")).toEqual([6, 7, 8]);
    expect(quarterMonths("q4")).toEqual([9, 10, 11]);
    expect(quarterMonths("full")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("opens on today's quarter in Dhaka when today is in the FY shown, else Full year", () => {
    expect(defaultQuarter(new Date("2026-11-22T06:00:00Z"), 2026)).toBe("q2");
    expect(defaultQuarter(new Date("2026-07-01T00:00:00Z"), 2026)).toBe("q1");
    expect(defaultQuarter(new Date("2027-02-10T06:00:00Z"), 2026)).toBe("q3");
    expect(defaultQuarter(new Date("2027-05-31T06:00:00Z"), 2026)).toBe("q4");
    // Dhaka is UTC+6: 30 Sep 17:59 UTC is still 30 Sep there, 18:00 UTC is 1 Oct.
    expect(defaultQuarter(new Date("2026-09-30T17:59:00Z"), 2026)).toBe("q1");
    expect(defaultQuarter(new Date("2026-09-30T18:00:00Z"), 2026)).toBe("q2");
    // Outside the FY the editor shows.
    expect(defaultQuarter(new Date("2026-11-22T06:00:00Z"), 2025)).toBe("full");
    expect(defaultQuarter(new Date("2027-06-30T17:59:00Z"), 2026)).toBe("q4");
    expect(defaultQuarter(new Date("2027-06-30T18:00:00Z"), 2026)).toBe("full"); // 1 Jul 2027 in Dhaka: FY 2027-28
  });

  it("keeps every month in the draft and in what Save sends, whichever quarter shows", () => {
    const data = { elec: { rows: [{ sl: 1, n: "ATN Bangla", m: months(100000) }], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } };
    // Aug (index 1) is outside Q2 Oct–Dec, the quarter on screen; its edit is still sent with all 12 months.
    expect(quarterMonths("q2")).not.toContain(1);
    const out = channelInput(setChannelAmount(channelDraft(data), "elec", "elec-0", 1, "4321"));
    expect(out.ok && out.data.elec[0].m).toEqual([100000, 4321, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Feb (index 7) is outside Q1 Jul–Sep; the FY row still sends 12 months and the Last FY total.
    expect(quarterMonths("q1")).not.toContain(7);
    const fy = fyInput(setFyAmount(fyDraft([]), { biz: "Salt", b: "ACI Salt" }, "TV", 7, "2"));
    expect(fy.ok && fy.rows[0]).toEqual({ biz: "Salt", b: "ACI Salt", med: "TV", m: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], py: 0 });
  });

  it("lists the Submit Date months after Any: blanks skipped, each month once, oldest first, as Mon'YY", () => {
    const rows = [bill(1, "2026-10-20"), bill(2, null), bill(3, "2026-08-15"), bill(4, "2026-10-01"), bill(5, ""), bill(6, "2027-01-05")];
    expect(submitMonthOptions(rows)).toEqual([
      { value: "2026-08", label: "Aug'26" }, { value: "2026-10", label: "Oct'26" }, { value: "2027-01", label: "Jan'27" },
    ]);
    // A month already chosen stays on its list after its last bill goes, so the select never shows a value it does not list.
    expect(submitMonthOptions([bill(1, "2026-10-20")], { from: "2026-07", to: ANY_MONTH }).map((o) => o.value)).toEqual(["2026-07", "2026-10"]);
  });

  it("filters on the Submit Date month: Any to Any, From only, To only, both, reversed, and a bill with no Submit Date", () => {
    const rows = [bill(1, "2026-08-15"), bill(2, "2026-10-20"), bill(3, "2027-01-05"), bill(4, null)];
    const keep = (from: string, to: string) => rows.filter((r) => inBillRange(r, { from, to })).map((r) => r.sl);
    expect(keep(ANY_MONTH, ANY_MONTH)).toEqual([1, 2, 3, 4]);
    expect(keep("2026-10", ANY_MONTH)).toEqual([2, 3]);
    expect(keep(ANY_MONTH, "2026-10")).toEqual([1, 2]);
    expect(keep("2026-08", "2026-10")).toEqual([1, 2]);
    expect(keep("2026-10", "2026-10")).toEqual([2]);
    expect(keep("2027-01", "2026-08")).toEqual([]);
  });

  it("works with the search and the first-40 rule, and says N of M bills only when a filter or search is on", () => {
    const rows = [...Array.from({ length: 45 }, (_, i) => bill(i + 1, "2026-10-20")), bill(46, "2026-08-15"), bill(47, null)];
    const oct = billsToShow(rows, "", false, { from: "2026-10", to: "2026-10" });
    expect([oct.shown.length, oct.matching, oct.shown[0].sl]).toEqual([40, 45, 45]);
    expect(billsToShow(rows, "", true, { from: "2026-10", to: "2026-10" }).shown).toHaveLength(45);
    expect(billsToShow(rows, "vendor 46", false, { from: "2026-08", to: ANY_MONTH }).shown.map((r) => r.sl)).toEqual([46]);
    expect(billsToShow(rows, "vendor 46", false, { from: "2026-10", to: ANY_MONTH }).matching).toBe(0);
    expect(billsToShow(rows, "", false).matching).toBe(47);
    expect(billsToShow(rows, "", false, ANY_RANGE).matching).toBe(47);
    expect(billFilterActive("", ANY_RANGE)).toBe(false);
    expect(billFilterActive("   ", ANY_RANGE)).toBe(false);
    expect(billFilterActive("gulshan", ANY_RANGE)).toBe(true);
    expect(billFilterActive("", { from: ANY_MONTH, to: "2026-10" })).toBe(true);
    expect(billsCount(2, 169)).toBe("2 of 169 bills");
  });

  it("lists the hideable bill columns in table order and opens with Bill No and Bill Amount", () => {
    expect(BILL_COLUMNS.map((c) => c.label)).toEqual(["PO", "Bill No", "PO Amount", "Bill Amount", "Brand", "Location"]);
    expect(DEFAULT_BILL_COLUMNS).toEqual(["bill", "ba"]);
    expect(toggleBillColumn(["bill", "ba"], "b", true)).toEqual(["bill", "ba", "b"]);
    expect(toggleBillColumn(["bill", "ba", "b"], "bill", false)).toEqual(["ba", "b"]);
    expect(toggleBillColumn(["loc"], "po", true)).toEqual(["po", "loc"]);
  });

  it("reads stored ticks, falling back to the default for a missing or bad value", () => {
    expect(parseBillColumns(null)).toEqual(["bill", "ba"]);
    expect(parseBillColumns('["loc","b"]')).toEqual(["b", "loc"]);
    expect(parseBillColumns("[]")).toEqual([]);
    for (const bad of ["not json", "{}", '"b"', '["b","sl"]', "[1]", "null"]) expect(parseBillColumns(bad), bad).toEqual(["bill", "ba"]);
  });

  it("reads and writes the browser's ticks without ever throwing", () => {
    const box = new Map<string, string>();
    const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
    expect(readStoredColumns(storage)).toBeNull();
    expect(writeBillColumns(storage, ["b", "loc"])).toBe(true);
    expect(box.get(BILL_COLUMNS_KEY)).toBe('["b","loc"]');
    expect(parseBillColumns(readStoredColumns(storage))).toEqual(["b", "loc"]);
    const blocked = {
      getItem: (): string | null => { throw new Error("blocked"); },
      setItem: (): void => { throw new Error("full"); },
    };
    expect(readStoredColumns(blocked)).toBeNull();
    expect(writeBillColumns(blocked, ["b"])).toBe(false);
    expect(readStoredColumns(null)).toBeNull();
    expect(writeBillColumns(null, ["b"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**

Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`
Expected: FAIL. The new names are not exported (`QUARTER_TABS`, `defaultQuarter` and the rest are undefined), so the file fails to import or every new test fails.

- [ ] **Step 3: Write the helpers.** In `src/app/(modules)/data-entry/manual-drafts.ts`:

Change the first import line from `import { round } from "@/lib/ingest/cells";` to:

```ts
import { monthLabel, round } from "@/lib/ingest/cells";
```

Change the rules import (line 7) to:

```ts
import {
  BAD_AMOUNT, CHANNEL_SHEETS, FY_MEDIA, VENDOR_REQUIRED, currentFyStart, dhakaDate, type BillInput, type ChannelInput, type ChannelKey,
} from "@/lib/manual/rules";
```

Replace the existing `billsToShow` (the doc comment and function, currently lines 212 to 216) with:

```ts
/** The bills to list: matching the search and the Submit Date range, newest (highest SL) first, the first 40 unless Show all. */
export function billsToShow(rows: BillboardRow[], query: string, showAll: boolean, range: BillRange = ANY_RANGE): { shown: BillboardRow[]; matching: number } {
  const hits = rows.filter((r) => billMatches(r, query) && inBillRange(r, range)).sort((a, b) => b.sl - a.sl);
  return { shown: showAll ? hits : hits.slice(0, BILLS_SHOWN), matching: hits.length };
}
```

Append at the end of the file:

```ts
// ---- View controls (design 1). They change only what the tables show; nothing here touches what a save sends. --------

export type Quarter = "q1" | "q2" | "q3" | "q4" | "full";
/** The quarter buttons above Channel cost and FY media spend, in FY order. */
export const QUARTER_TABS: readonly { key: Quarter; label: string }[] = [
  { key: "q1", label: "Q1 Jul–Sep" },
  { key: "q2", label: "Q2 Oct–Dec" },
  { key: "q3", label: "Q3 Jan–Mar" },
  { key: "q4", label: "Q4 Apr–Jun" },
  { key: "full", label: "Full year" },
];
const QUARTER_KEYS: readonly Quarter[] = ["q1", "q2", "q3", "q4"];

/** The month indexes a quarter shows: 0 is Jul, 11 is Jun. */
export function quarterMonths(q: Quarter): number[] {
  if (q === "full") return Array.from({ length: 12 }, (_, i) => i);
  const first = QUARTER_KEYS.indexOf(q) * 3;
  return [first, first + 1, first + 2];
}

/** The quarter Manual Entry opens on: the one today (Asia/Dhaka) falls in when today is inside the FY shown, else Full year. */
export function defaultQuarter(now: Date, fyStart: number): Quarter {
  if (currentFyStart(now) !== fyStart) return "full";
  const month = Number(dhakaDate(now).slice(5, 7)); // 1..12; Jul (7) is index 0
  return QUARTER_KEYS[Math.floor(((month + 5) % 12) / 3)];
}

/** "Any" in the Submitted from / to lists. */
export const ANY_MONTH = "";
/** The Submit Date range: "YYYY-MM" months, or ANY_MONTH. */
export type BillRange = { from: string; to: string };
export const ANY_RANGE: BillRange = { from: ANY_MONTH, to: ANY_MONTH };

const MONTH = /^\d{4}-\d{2}$/;
const submitMonth = (r: BillboardRow): string | null => (r.sb && /^\d{4}-\d{2}/.test(r.sb) ? r.sb.slice(0, 7) : null);

/** The months after Any: every Submit Date month in the bills (and any month already chosen), oldest first, as Mon'YY. */
export function submitMonthOptions(rows: BillboardRow[], range: BillRange = ANY_RANGE): { value: string; label: string }[] {
  const months = new Set<string>();
  for (const r of rows) {
    const m = submitMonth(r);
    if (m) months.add(m);
  }
  for (const m of [range.from, range.to]) if (MONTH.test(m)) months.add(m);
  return [...months].sort().map((value) => ({ value, label: monthLabel(value) }));
}

/** Any to Any keeps every bill; otherwise a bill needs a Submit Date month from From to To, both included. */
export function inBillRange(r: BillboardRow, range: BillRange): boolean {
  if (range.from === ANY_MONTH && range.to === ANY_MONTH) return true;
  const m = submitMonth(r);
  if (!m) return false;
  return (range.from === ANY_MONTH || m >= range.from) && (range.to === ANY_MONTH || m <= range.to);
}

/** True when the search has text or either end of the range is not Any: then the count line shows. */
export const billFilterActive = (query: string, range: BillRange): boolean =>
  normName(query) !== "" || range.from !== ANY_MONTH || range.to !== ANY_MONTH;

/** "N of M bills". */
export const billsCount = (n: number, total: number): string => `${n} of ${total} bills`;

/** The bill columns the Columns menu can hide, in table order. SL, Vendor, Status and Edit always show. */
export const BILL_COLUMNS = [
  { key: "po", label: "PO" },
  { key: "bill", label: "Bill No" },
  { key: "poa", label: "PO Amount" },
  { key: "ba", label: "Bill Amount" },
  { key: "b", label: "Brand" },
  { key: "loc", label: "Location" },
] as const;
export type BillColumn = (typeof BILL_COLUMNS)[number]["key"];
export const DEFAULT_BILL_COLUMNS: readonly BillColumn[] = ["bill", "ba"];
/** Where this browser keeps the ticks. */
export const BILL_COLUMNS_KEY = "aci-manual-bill-columns";

const isBillColumn = (x: unknown): x is BillColumn => BILL_COLUMNS.some((c) => c.key === x);
const inTableOrder = (keep: (k: BillColumn) => boolean): BillColumn[] => BILL_COLUMNS.map((c) => c.key).filter(keep);

/** Stored ticks as columns in table order; nothing stored, or anything that is not a list of known columns, gives the default. */
export function parseBillColumns(raw: string | null): BillColumn[] {
  if (raw === null) return [...DEFAULT_BILL_COLUMNS];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || !v.every(isBillColumn)) return [...DEFAULT_BILL_COLUMNS];
    return inTableOrder((k) => v.includes(k));
  } catch {
    return [...DEFAULT_BILL_COLUMNS];
  }
}

/** The stored ticks, or null when there are none or the browser will not read them. Never throws. */
export function readStoredColumns(storage: Pick<Storage, "getItem"> | null): string | null {
  try {
    return storage ? storage.getItem(BILL_COLUMNS_KEY) : null;
  } catch {
    return null;
  }
}

/** Stores the ticks; false when there is no storage or the browser refuses. Never throws. */
export function writeBillColumns(storage: Pick<Storage, "setItem"> | null, cols: readonly BillColumn[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BILL_COLUMNS_KEY, JSON.stringify(cols));
    return true;
  } catch {
    return false;
  }
}

/** Ticks or unticks one column, keeping table order. */
export const toggleBillColumn = (cols: readonly BillColumn[], key: BillColumn, on: boolean): BillColumn[] =>
  inTableOrder((k) => (k === key ? on : cols.includes(k)));
```

`billsToShow` refers to `ANY_RANGE` and `inBillRange`, which are declared later in the same module. That is fine: they are read only when `billsToShow` runs, after the module has loaded.

- [ ] **Step 4: Run the tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`
Expected: PASS, every old test and the 9 new ones in "view controls".

- [ ] **Step 5: Type-check and lint.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry/manual-drafts.ts" "src/app/(modules)/data-entry/manual-drafts.test.ts"`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add "src/app/(modules)/data-entry/manual-drafts.ts" "src/app/(modules)/data-entry/manual-drafts.test.ts"
git commit -F - <<'EOF'
feat(manual-entry): view-control helpers for quarters, bill dates and columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Quarter row on Channel cost and FY media spend

**Files:**
- Create: `src/app/(modules)/data-entry/quarter-buttons.tsx`
- Modify: `src/app/(modules)/data-entry/manual-entry.tsx`
- Modify: `src/app/(modules)/data-entry/channel-editor.tsx`
- Modify: `src/app/(modules)/data-entry/fy-editor.tsx`
- Test: `e2e/manual-entry.spec.ts`

**Interfaces:**
- Consumes (Task 1): `type Quarter`, `QUARTER_TABS`, `quarterMonths(q: Quarter): number[]`, `defaultQuarter(now: Date, fyStart: number): Quarter`. Also `SegmentedButtons<T>({ label, items, value, onChange })` from `@/components/data/segmented` (renders `role="group"` with `aria-label={label}` and buttons with `aria-pressed`).
- Produces:
```ts
// quarter-buttons.tsx
export function QuarterButtons(props: { value: Quarter; onChange: (q: Quarter) => void }): React.JSX.Element;
//   <div data-testid="quarter-row" class="max-w-full overflow-x-auto"> + group "Quarter"
// channel-editor.tsx: ChannelEditor props add  quarter: Quarter; onQuarter: (q: Quarter) => void
// fy-editor.tsx:      FyEditor props add       quarter: Quarter; onQuarter: (q: Quarter) => void
// manual-entry.tsx:   holds const [quarter, setQuarter] = useState<Quarter>(() => defaultQuarter(new Date(), data.channel.fyStart))
// e2e helpers: quarterButton(section, label), pickQuarter(section, label), openingQuarter(fyStart), QUARTER_LABELS, MONTH_HEAD
```

- [ ] **Step 1: Write the failing browser tests.** In `e2e/manual-entry.spec.ts`:

Add after the existing imports (line 3):

```ts
import { currentFyStart, dhakaDate, fyMonthLabels } from "../src/lib/manual/rules";
```

Add after the `typeUntil` helper (after line 38):

```ts
/** A quarter button in a section's quarter row. */
const quarterButton = (section: Locator, label: string) =>
  section.getByRole("group", { name: "Quarter" }).getByRole("button", { name: label, exact: true });
/** Clicks a quarter button until it shows as chosen (a click before hydration is lost). */
const pickQuarter = async (section: Locator, label: string) => {
  const button = quarterButton(section, label);
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};
const QUARTER_LABELS = ["Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun"];
/** The quarter Manual Entry should open on for an FY (design 1.1), worked out here on its own as the test's oracle. */
const openingQuarter = (fyStart: number): string => {
  const now = new Date();
  if (currentFyStart(now) !== fyStart) return "Full year";
  const month = Number(dhakaDate(now).slice(5, 7));
  return QUARTER_LABELS[Math.floor(((month + 5) % 12) / 3)];
};
/** A month column head such as Jul'26. */
const MONTH_HEAD = /^[A-Z][a-z]{2}'\d\d$/;
```

In test "1. channel: …", the quarter now hides Jul'26 outside Q1. Replace:

```ts
  await expect(channel.getByLabel("Channel 1", { exact: true })).toHaveValue("E2E TV One");
  const jul = channel.getByLabel("Channel 1 Jul'26", { exact: true });
```

with:

```ts
  await expect(channel.getByLabel("Channel 1", { exact: true })).toHaveValue("E2E TV One");
  await pickQuarter(channel, "Full year");
  const jul = channel.getByLabel("Channel 1 Jul'26", { exact: true });
```

and replace the last two lines of test 1:

```ts
  await openManual(page);
  await expect(page.getByTestId("manual-channel").getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
```

with:

```ts
  await openManual(page);
  const restored = page.getByTestId("manual-channel");
  await pickQuarter(restored, "Full year");
  await expect(restored.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
```

In test "2. FY: …", replace:

```ts
  await fy.getByLabel(/^TV Jul'\d\d$/).fill("1.5");
```

with:

```ts
  await pickQuarter(fy, "Q1 Jul–Sep");
  await fy.getByLabel(/^TV Jul'\d\d$/).fill("1.5");
```

Add this test after test "3. bills: …" and before `test.describe("viewer", …)`:

```ts
/** channelBook's FY: its months are Jul'26 to Jun'27. */
const CHANNEL_FY = 2026;

test("4. quarters: Channel cost opens on today's quarter, Full year shows 12, and an edit in a hidden month is saved", async ({ page }) => {
  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  const table = channel.getByTestId("channel-table");
  const monthHeads = table.getByRole("columnheader", { name: MONTH_HEAD });
  const labels = fyMonthLabels(CHANNEL_FY);
  const opening = openingQuarter(CHANNEL_FY);
  const q = QUARTER_LABELS.indexOf(opening);
  await expect(quarterButton(channel, opening)).toHaveAttribute("aria-pressed", "true");
  await expect(monthHeads).toHaveText(q < 0 ? labels : labels.slice(q * 3, q * 3 + 3)); // 3 columns while today is in FY 2026-27
  await expect(table.getByRole("columnheader", { name: "SL", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Channel", exact: true })).toBeVisible();
  await expect(channel.getByRole("button", { name: "Remove E2E TV One" })).toBeVisible();

  await pickQuarter(channel, "Full year");
  await expect(monthHeads).toHaveText(labels);

  // Type Aug'26 in Q1, hide it with Q2, then save: Aug is still sent.
  await pickQuarter(channel, "Q1 Jul–Sep");
  await expect(monthHeads).toHaveText(["Jul'26", "Aug'26", "Sep'26"]);
  const aug = channel.getByLabel("Channel 1 Aug'26", { exact: true });
  await typeUntil(aug, "4321", channel.getByText("Unsaved changes"));
  await pickQuarter(channel, "Q2 Oct–Dec");
  await expect(monthHeads).toHaveText(["Oct'26", "Nov'26", "Dec'26"]);
  await expect(aug).toHaveCount(0);
  await expect(channel.getByText("Unsaved changes")).toBeVisible();
  await channel.getByRole("button", { name: "Save & publish" }).click();
  await expect(channel.getByText("All saved")).toBeVisible();
  await expect(quarterButton(channel, "Q2 Oct–Dec")).toHaveAttribute("aria-pressed", "true"); // the remount after a save keeps the choice

  // After a reload the stored version has the hidden months: Jul as it was, Aug as typed.
  await openManual(page);
  const again = page.getByTestId("manual-channel");
  await pickQuarter(again, "Q1 Jul–Sep");
  await expect(again.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
  await expect(again.getByLabel("Channel 1 Aug'26", { exact: true })).toHaveValue("4321");

  // FY media spend shares the choice and keeps Media and Last FY.
  const fy = await showView(page, "FY media spend", "manual-fy");
  await expect(quarterButton(fy, "Q1 Jul–Sep")).toHaveAttribute("aria-pressed", "true");
  await pickQuarter(fy, "Q3 Jan–Mar");
  const fyTable = fy.getByTestId("fy-table");
  await expect(fyTable.getByRole("columnheader", { name: MONTH_HEAD })).toHaveText([/^Jan'\d\d$/, /^Feb'\d\d$/, /^Mar'\d\d$/]);
  await expect(fyTable.getByRole("columnheader", { name: "Media", exact: true })).toBeVisible();
  await expect(fyTable.getByRole("columnheader", { name: "Last FY", exact: true })).toBeVisible();
  await expect(fy.getByLabel("TV Last FY", { exact: true })).toBeVisible();
  const channelAgain = await showView(page, "Channel cost", "manual-channel");
  await expect(quarterButton(channelAgain, "Q3 Jan–Mar")).toHaveAttribute("aria-pressed", "true");
});
```

In the viewer describe, replace the first test:

```ts
  test("sees the tab read-only with the note, and no Save, Add or Remove", async ({ page }) => {
    await openManual(page);
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const channel = page.getByTestId("manual-channel");
    await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toBeDisabled();
```

with:

```ts
  test("sees the tab read-only with the note, no Save, Add or Remove, and can switch quarters", async ({ page }) => {
    await openManual(page);
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const channel = page.getByTestId("manual-channel");
    await pickQuarter(channel, "Q1 Jul–Sep");
    await expect(channel.getByLabel("Channel 1 Oct'26", { exact: true })).toHaveCount(0);
    await pickQuarter(channel, "Full year");
    await expect(channel.getByLabel("Channel 1 Oct'26", { exact: true })).toBeDisabled();
    await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toBeDisabled();
```

(the rest of that test stays as it is). In the viewer FY test, replace:

```ts
    await expect(fy.getByLabel(/^TV Jul'\d\d$/)).toBeDisabled();
```

with:

```ts
    await pickQuarter(fy, "Q1 Jul–Sep");
    await expect(fy.getByLabel(/^TV Jul'\d\d$/)).toBeDisabled();
```

In the phone describe, test "each editor's table scrolls …", replace its last three lines:

```ts
    // The 12-month channel table is wider than a phone: it scrolls inside its own box.
    const channel = await showView(page, "Channel cost", "manual-channel");
    expect(await tableBox(channel).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
```

with:

```ts
    // The 12-month channel table is wider than a phone: it scrolls inside its own box.
    const channel = await showView(page, "Channel cost", "manual-channel");
    await pickQuarter(channel, "Full year");
    expect(await tableBox(channel).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
```

- [ ] **Step 2: Run the browser tests to see them fail.**

Run: `npx playwright test e2e/manual-entry.spec.ts`
Expected: FAIL. Test 1 fails in `pickQuarter` (no "Quarter" group), and the serial tests after it are skipped.

- [ ] **Step 3: Create the shared quarter row** `src/app/(modules)/data-entry/quarter-buttons.tsx`:

```tsx
import { SegmentedButtons } from "@/components/data/segmented";
import { QUARTER_TABS, type Quarter } from "./manual-drafts";

/** The quarter row above the Channel cost and FY tables (design 1.1). It picks which month columns show, nothing else. */
export function QuarterButtons({ value, onChange }: { value: Quarter; onChange: (q: Quarter) => void }) {
  return (
    <div data-testid="quarter-row" className="max-w-full overflow-x-auto">
      <SegmentedButtons label="Quarter" items={[...QUARTER_TABS]} value={value} onChange={onChange} />
    </div>
  );
}
```

- [ ] **Step 4: Hold the quarter in the shell.** Replace `src/app/(modules)/data-entry/manual-entry.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SegmentedButtons } from "@/components/data/segmented";
import type { ChannelKey } from "@/lib/manual/rules";
import { BillboardEditor } from "./billboard-editor";
import { ChannelEditor } from "./channel-editor";
import { FyEditor } from "./fy-editor";
import { defaultQuarter, type ManualEntryData, type Quarter } from "./manual-drafts";

type View = "channel" | "fy" | "bills";
const VIEWS: { key: View; label: string }[] = [
  { key: "channel", label: "Channel cost" },
  { key: "fy", label: "FY media spend" },
  { key: "bills", label: "OOH / billboard bills" },
];

/**
 * Manual Entry (design 3). Every editor stays mounted (only hidden), so unsaved edits survive switching. A viewer sees the
 * same editors with the inputs off; the server refuses a viewer's save anyway.
 */
export function ManualEntry({ admin, data }: { admin: boolean; data: ManualEntryData }) {
  const [view, setView] = useState<View>("channel");
  const [sheet, setSheet] = useState<ChannelKey>("elec");
  const [fyBrand, setFyBrand] = useState<string | null>(null);
  const [billQuery, setBillQuery] = useState("");
  // One quarter for Channel cost and FY media spend (view controls design 1.1), from the Channel cost FY, the section that
  // opens first. Not remembered after a reload. This renders per request (page.tsx awaits connection()), so the clock read is
  // never in a static shell.
  const [quarter, setQuarter] = useState<Quarter>(() => defaultQuarter(new Date(), data.channel.fyStart));
  return (
    <div className="min-w-0 space-y-4">
      {!admin && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <Lock className="size-4 shrink-0 text-gray-500" aria-hidden />
          <span>Only the admin can change data. Sign in to edit.</span>
          <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2">Sign in</Link>
        </p>
      )}
      <div className="max-w-full overflow-x-auto">
        <SegmentedButtons label="Manual Entry sections" items={VIEWS} value={view} onChange={setView} />
      </div>
      <section data-testid="manual-channel" hidden={view !== "channel"} className="min-w-0">
        <ChannelEditor key={`channel-${data.channel.versionId ?? "none"}`} {...data.channel} readOnly={!admin} sheet={sheet} onSheet={setSheet}
          quarter={quarter} onQuarter={setQuarter} />
      </section>
      <section data-testid="manual-fy" hidden={view !== "fy"} className="min-w-0">
        <FyEditor key={`fy-${data.fy.versionId ?? "none"}`} {...data.fy} businesses={data.businesses} readOnly={!admin} brand={fyBrand} onBrand={setFyBrand}
          quarter={quarter} onQuarter={setQuarter} />
      </section>
      <section data-testid="manual-bills" hidden={view !== "bills"} className="min-w-0">
        <BillboardEditor key={`bills-${data.billboard.versionId ?? "none"}`} {...data.billboard} businesses={data.businesses} readOnly={!admin}
          query={billQuery} onQuery={setBillQuery} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Show only the chosen months in Channel cost.** Replace `src/app/(modules)/data-entry/channel-editor.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SegmentedButtons } from "@/components/data/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import { fyMonthLabels, type ChannelKey } from "@/lib/manual/rules";
import { saveChannelAction } from "./actions";
import {
  CHANNEL_TABS, addChannelRow, channelDraft, channelInput, isDirty, quarterMonths, removeChannelRow, setChannelAmount, setChannelName,
  type Quarter,
} from "./manual-drafts";
import { QuarterButtons } from "./quarter-buttons";
import { SaveBar } from "./save-bar";

/**
 * Channel cost (design 3.1). All three sheets are one draft and one save; edits survive switching sheets.
 * Keyed by its version id: a save re-renders the page with the new version, which remounts this with what was stored.
 * The quarter only picks which month columns show: the draft and the save always hold all 12 months.
 */
export function ChannelEditor({ versionId, fyStart, data, readOnly, sheet, onSheet, quarter, onQuarter }: {
  versionId: number | null; fyStart: number; data: ChannelData; readOnly: boolean; sheet: ChannelKey; onSheet: (k: ChannelKey) => void;
  quarter: Quarter; onQuarter: (q: Quarter) => void;
}) {
  const [initial] = useState(() => channelDraft(data));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const months = fyMonthLabels(fyStart);
  const shown = quarterMonths(quarter);
  const tab = CHANNEL_TABS.find((t) => t.key === sheet) ?? CHANNEL_TABS[0];
  const rows = draft[tab.key];

  const save = () => {
    const built = channelInput(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    // A server action from an event handler runs in a transition (next/dist/docs/01-app/02-guides/server-actions.md).
    startTransition(async () => {
      const res = await saveChannelAction({ baseVersionId: versionId, data: built.data });
      if (res.error) setError(res.error);
      else toast.success("Channel cost saved and published.");
    });
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <SegmentedButtons label="Channel cost sheets" items={CHANNEL_TABS.map(({ key, label }) => ({ key, label }))} value={tab.key} onChange={onSheet} />
          </div>
          <QuarterButtons value={quarter} onChange={onQuarter} />
        </div>
        <div>
          <CardTitle>{`Channel cost · ${tab.label}`}</CardTitle>
          <p className="text-sm text-gray-500">BDT · type amounts, add or remove rows, then Save & publish</p>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <Table data-testid="channel-table">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead>
              <TableHead>{tab.column}</TableHead>
              {shown.map((j) => <TableHead key={months[j]} className="text-right">{months[j]}</TableHead>)}
              {!readOnly && <TableHead><span className="sr-only">Remove</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="text-right text-gray-500 tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <Input aria-label={`${tab.column} ${i + 1}`} value={r.n} maxLength={120} disabled={readOnly} className="w-48"
                    onChange={(e) => setDraft((d) => setChannelName(d, tab.key, r.key, e.target.value))} />
                </TableCell>
                {shown.map((j) => (
                  <TableCell key={months[j]}>
                    <Input aria-label={`${tab.column} ${i + 1} ${months[j]}`} inputMode="decimal" value={r.m[j]} disabled={readOnly} className="w-28 text-right tabular-nums"
                      onChange={(e) => setDraft((d) => setChannelAmount(d, tab.key, r.key, j, e.target.value))} />
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${r.n.trim() || `${tab.column} ${i + 1}`}`}
                      onClick={() => setDraft((d) => removeChannelRow(d, tab.key, r.key))}>Remove</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft((d) => addChannelRow(d, tab.key, crypto.randomUUID()))}>{tab.add}</Button>
        )}
      </CardContent>
      {!readOnly && (
        <SaveBar dirty={isDirty(draft, initial)} pending={pending} error={error} onSave={save}
          onDiscard={() => { setDraft(initial); setError(null); }} />
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Show only the chosen months in FY media spend, keeping Last FY.** Replace `src/app/(modules)/data-entry/fy-editor.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { fyMonthLabels, fyName } from "@/lib/manual/rules";
import { saveFyAction } from "./actions";
import { AddBrandDialog } from "./add-brand-dialog";
import {
  addFyBrand, fyBrandGroups, fyBrandKey, fyDraft, fyInput, fyTable, isDirty, quarterMonths, setFyAmount, type ManualBusiness, type Quarter,
} from "./manual-drafts";
import { QuarterButtons } from "./quarter-buttons";
import { SaveBar } from "./save-bar";

const SELECT = "h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm";

/**
 * FY media spend (design 3.2). Edits to several brands stay in one draft until Save & publish or Discard changes.
 * The quarter only picks which month columns show: Last FY always shows, and the save always sends all 12 months.
 */
export function FyEditor({ versionId, fyStart, rows, businesses, readOnly, brand, onBrand, quarter, onQuarter }: {
  versionId: number | null; fyStart: number; rows: FyRow[]; businesses: ManualBusiness[]; readOnly: boolean;
  brand: string | null; onBrand: (key: string) => void; quarter: Quarter; onQuarter: (q: Quarter) => void;
}) {
  const [initial] = useState(() => fyDraft(rows));
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = fyBrandGroups(draft);
  const selected = groups.flatMap((g) => g.brands).find((x) => fyBrandKey(x) === brand) ?? groups[0]?.brands[0] ?? null;
  const months = fyMonthLabels(fyStart);
  const shown = quarterMonths(quarter);

  const save = () => {
    const built = fyInput(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveFyAction({ baseVersionId: versionId, rows: built.rows, newBrands: built.newBrands });
      if (res.error) setError(res.error);
      else toast.success("FY media spend saved and published.");
    });
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {groups.length > 0 && (
            <select aria-label="FY brand" className={SELECT} value={selected ? fyBrandKey(selected) : ""} onChange={(e) => onBrand(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g.biz} label={g.biz}>
                  {g.brands.map((x) => <option key={fyBrandKey(x)} value={fyBrandKey(x)}>{x.b}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          {!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>+ Add brand</Button>}
        </div>
        {selected && <QuarterButtons value={quarter} onChange={onQuarter} />}
        <div>
          <CardTitle>{selected ? `FY media spend · ${selected.b}` : "FY media spend"}</CardTitle>
          {selected && <p className="text-sm text-gray-500">{`BDT Mn · ${selected.biz} · FY ${fyName(fyStart)} months Jul to Jun, plus the last FY total`}</p>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {selected ? (
          <Table data-testid="fy-table">
            <TableHeader>
              <TableRow>
                <TableHead>Media</TableHead>
                {shown.map((j) => <TableHead key={months[j]} className="text-right">{months[j]}</TableHead>)}
                <TableHead className="text-right">Last FY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fyTable(draft, selected).map((r) => (
                <TableRow key={r.med}>
                  <TableCell className="font-medium">{r.med}</TableCell>
                  {shown.map((j) => (
                    <TableCell key={months[j]}>
                      <Input aria-label={`${r.med} ${months[j]}`} inputMode="decimal" value={r.m[j]} disabled={readOnly} className="w-24 text-right tabular-nums"
                        onChange={(e) => setDraft((d) => setFyAmount(d, selected, r.med, j, e.target.value))} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Input aria-label={`${r.med} Last FY`} inputMode="decimal" value={r.py} disabled={readOnly} className="w-24 text-right tabular-nums"
                      onChange={(e) => setDraft((d) => setFyAmount(d, selected, r.med, "py", e.target.value))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-gray-500">{readOnly ? "No FY data yet." : "No brands yet. Add a brand to start."}</p>
        )}
      </CardContent>
      {!readOnly && (
        <>
          <SaveBar dirty={isDirty(draft, initial)} pending={pending} error={error} onSave={save}
            onDiscard={() => { setDraft(initial); setError(null); }} />
          <AddBrandDialog open={adding} onOpenChange={setAdding} draft={draft} businesses={businesses}
            onAdd={(b) => {
              setDraft((d) => addFyBrand(d, b));
              onBrand(fyBrandKey({ biz: b.businessName, b: b.name }));
              setAdding(false);
            }} />
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Run the tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry"` then `npx playwright test e2e/manual-entry.spec.ts`
Expected: PASS, including test 4 and the updated tests 1 and 2, the viewer tests and the phone tests. If the browser console in the dev server shows a hydration warning from the quarter row, check that the shell reads the date only in the `useState` initializer (Step 4) and nowhere else.

- [ ] **Step 8: Type-check and lint.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" e2e/manual-entry.spec.ts`
Expected: no errors.

- [ ] **Step 9: Commit.**

```bash
git add "src/app/(modules)/data-entry/quarter-buttons.tsx" "src/app/(modules)/data-entry/manual-entry.tsx" "src/app/(modules)/data-entry/channel-editor.tsx" "src/app/(modules)/data-entry/fy-editor.tsx" e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
feat(manual-entry): quarter buttons on Channel cost and FY media spend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Bills toolbar: Submit Date range, count line and Columns menu

**Files:**
- Modify: `src/app/(modules)/data-entry/manual-entry.tsx`
- Modify: `src/app/(modules)/data-entry/billboard-editor.tsx`
- Test: `e2e/manual-entry.spec.ts`

**Interfaces:**
- Consumes (Task 1): `ANY_MONTH`, `ANY_RANGE`, `type BillRange`, `submitMonthOptions`, `billsToShow(rows, query, showAll, range)`, `billFilterActive`, `billsCount`, `BILL_COLUMNS`, `type BillColumn`, `DEFAULT_BILL_COLUMNS`, `parseBillColumns`, `readStoredColumns`, `writeBillColumns`, `toggleBillColumn`. (Task 2): `pickQuarter`, `showView`, `openManual` in the e2e file. From `@/components/ui/dropdown-menu`: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuCheckboxItem` (Base UI `Menu.CheckboxItem`: `checked`, `onCheckedChange(checked: boolean)`, role `menuitemcheckbox`, stays open on click by default).
- Produces:
```ts
// billboard-editor.tsx: BillboardEditor props add  range: BillRange; onRange: (r: BillRange) => void
//   toolbar test id "bills-toolbar"; selects labelled "Submitted from" and "to"; button "Columns"
//   count line "N of M bills" while billFilterActive; "No bills match." row when bills exist and none match
// manual-entry.tsx: holds const [billRange, setBillRange] = useState<BillRange>(ANY_RANGE)
```

- [ ] **Step 1: Write the failing browser tests.** In `e2e/manual-entry.spec.ts`, add these two tests after test "4. quarters: …" and before `test.describe("viewer", …)`:

```ts
test("5. bills: the Submit Date range narrows the list and the count", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  const dialog = page.getByRole("dialog");
  for (const [no, sb] of [["E2E-RANGE-A", "2026-08-15"], ["E2E-RANGE-B", "2026-10-20"]]) {
    await bills.getByRole("button", { name: "+ Add bill" }).click();
    await dialog.getByLabel("Name of the Media / Vendor", { exact: true }).fill(`Vendor ${no}`);
    await dialog.getByLabel("Bill No", { exact: true }).fill(no);
    await dialog.getByLabel("Submit Date", { exact: true }).fill(sb);
    await dialog.getByRole("button", { name: "Save & publish" }).click();
    await expect(dialog).toHaveCount(0);
  }
  const table = bills.getByTestId("manual-bills-table");
  const rowA = table.locator("tbody tr").filter({ hasText: "E2E-RANGE-A" });
  const rowB = table.locator("tbody tr").filter({ hasText: "E2E-RANGE-B" });
  const count = bills.getByText(/^\d+ of \d+ bills$/);
  const from = bills.getByLabel("Submitted from", { exact: true });
  const to = bills.getByLabel("to", { exact: true });
  await expect(count).toHaveCount(0); // Any to Any and no search: no count line
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(from.locator("option").first()).toHaveText("Any");
  await expect(from.locator("option")).toContainText(["Any", "Aug'26", "Oct'26"]);
  await expect(to.locator("option")).toContainText(["Any", "Aug'26", "Oct'26"]);

  await bills.getByLabel("Search bills").fill("E2E-RANGE");
  await expect(count).toHaveText(/^2 of \d+ bills$/);
  await from.selectOption({ label: "Oct'26" });
  await expect(count).toHaveText(/^1 of \d+ bills$/);
  await expect(rowB).toHaveCount(1);
  await expect(rowA).toHaveCount(0);
  await from.selectOption({ label: "Any" });
  await to.selectOption({ label: "Aug'26" });
  await expect(count).toHaveText(/^1 of \d+ bills$/);
  await expect(rowA).toHaveCount(1);
  await expect(rowB).toHaveCount(0);
  await from.selectOption({ label: "Oct'26" }); // From later than To: nothing matches
  await expect(count).toHaveText(/^0 of \d+ bills$/);
  await expect(table.getByText("No bills match.", { exact: true })).toBeVisible();

  await from.selectOption({ label: "Any" });
  await to.selectOption({ label: "Any" });
  await expect(count).toHaveText(/^2 of \d+ bills$/); // the search alone still counts
  await bills.getByLabel("Search bills").fill("");
  await expect(count).toHaveCount(0);
  await expect(table.getByText("No bills match.", { exact: true })).toHaveCount(0);
});

test("6. bills: Columns adds Brand and hides Bill No, and this browser remembers it", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  const head = (name: string) => bills.getByTestId("manual-bills-table").getByRole("columnheader", { name, exact: true });
  for (const name of ["SL", "Vendor", "Bill No", "Bill Amount", "Status", "Edit"]) await expect(head(name)).toHaveCount(1);
  for (const name of ["PO", "PO Amount", "Brand", "Location"]) await expect(head(name)).toHaveCount(0);

  const menu = page.getByRole("menu");
  await expect(async () => {
    await bills.getByRole("button", { name: "Columns", exact: true }).click();
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(menu.getByRole("menuitemcheckbox")).toHaveText(["PO", "Bill No", "PO Amount", "Bill Amount", "Brand", "Location"]);
  const item = (name: string) => menu.getByRole("menuitemcheckbox", { name, exact: true });
  await expect(item("Bill No")).toHaveAttribute("aria-checked", "true");
  await expect(item("Bill Amount")).toHaveAttribute("aria-checked", "true");
  await expect(item("Brand")).toHaveAttribute("aria-checked", "false");
  await item("Brand").click();
  await expect(item("Brand")).toHaveAttribute("aria-checked", "true");
  await item("Bill No").click();
  await expect(item("Bill No")).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(head("Brand")).toHaveCount(1);
  await expect(head("Bill No")).toHaveCount(0);
  await expect(head("Bill Amount")).toHaveCount(1);

  await page.reload();
  const again = await showView(page, "OOH / billboard bills", "manual-bills");
  const headAgain = (name: string) => again.getByTestId("manual-bills-table").getByRole("columnheader", { name, exact: true });
  await expect(headAgain("Brand")).toHaveCount(1);
  await expect(headAgain("Bill No")).toHaveCount(0);
});
```

In the viewer describe, replace the bills test:

```ts
  test("sees the bills with no Add bill or Edit", async ({ page }) => {
    await openManual(page);
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    await expect(bills.getByTestId("manual-bills-table")).toBeVisible();
    await expect(bills.getByRole("button", { name: "+ Add bill" })).toHaveCount(0);
    await expect(bills.getByRole("button", { name: /^Edit bill/ })).toHaveCount(0);
    await expect(bills.getByLabel("Search bills")).toBeEnabled();
  });
```

with:

```ts
  test("sees the bills with no Add bill or Edit, and can still filter and pick columns", async ({ page }) => {
    await openManual(page);
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    await expect(bills.getByTestId("manual-bills-table")).toBeVisible();
    await expect(bills.getByRole("button", { name: "+ Add bill" })).toHaveCount(0);
    await expect(bills.getByRole("button", { name: /^Edit bill/ })).toHaveCount(0);
    await expect(bills.getByLabel("Search bills")).toBeEnabled();
    await expect(bills.getByLabel("Submitted from", { exact: true })).toBeEnabled();
    await expect(bills.getByLabel("to", { exact: true })).toBeEnabled();
    await bills.getByLabel("Submitted from", { exact: true }).selectOption({ label: "Oct'26" });
    await expect(bills.getByText(/^\d+ of \d+ bills$/)).toBeVisible();
    await expect(bills.getByRole("button", { name: "Columns", exact: true })).toBeEnabled();
  });
```

- [ ] **Step 2: Run the browser tests to see them fail.**

Run: `npx playwright test e2e/manual-entry.spec.ts`
Expected: FAIL at test 5 (no "Submitted from" select, so `toHaveValue("")` times out); tests 1 to 4 pass; later serial tests are skipped.

- [ ] **Step 3: Hold the range in the shell.** In `src/app/(modules)/data-entry/manual-entry.tsx`:

Replace the manual-drafts import:

```tsx
import { defaultQuarter, type ManualEntryData, type Quarter } from "./manual-drafts";
```

with:

```tsx
import { ANY_RANGE, defaultQuarter, type BillRange, type ManualEntryData, type Quarter } from "./manual-drafts";
```

Replace:

```tsx
  const [billQuery, setBillQuery] = useState("");
```

with:

```tsx
  const [billQuery, setBillQuery] = useState("");
  // The Submit Date range lives here with the search, so the remount after a bill save keeps both.
  const [billRange, setBillRange] = useState<BillRange>(ANY_RANGE);
```

Replace:

```tsx
          query={billQuery} onQuery={setBillQuery} />
```

with:

```tsx
          query={billQuery} onQuery={setBillQuery} range={billRange} onRange={setBillRange} />
```

- [ ] **Step 4: Build the toolbar, the count line, "No bills match." and the Columns menu.** Replace `src/app/(modules)/data-entry/billboard-editor.tsx` with:

```tsx
"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import { formatTaka } from "@/lib/money";
import { BillDialogForm } from "./bill-dialog";
import {
  ANY_MONTH, BILL_COLUMNS, DEFAULT_BILL_COLUMNS, billFilterActive, billsCaption, billsCount, billsToShow, parseBillColumns, readStoredColumns,
  submitMonthOptions, toggleBillColumn, writeBillColumns, type BillColumn, type BillRange, type ManualBusiness,
} from "./manual-drafts";

const SELECT = "h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** The cells the Columns menu can hide (view controls design 1.3). */
const CELLS: Record<BillColumn, { right: boolean; cell: (r: BillboardRow) => ReactNode }> = {
  po: { right: false, cell: (r) => r.po },
  bill: { right: false, cell: (r) => r.bill },
  poa: { right: true, cell: (r) => formatTaka(r.poa) },
  ba: { right: true, cell: (r) => formatTaka(r.ba) },
  b: { right: false, cell: (r) => r.b },
  loc: { right: false, cell: (r) => r.loc },
};

// The Columns ticks live in this browser. They are read on the client only, so the server render and the first paint use the
// default; a browser that refuses storage keeps the ticks for this page and is back on the default after a reload.
const columnListeners = new Set<() => void>();
const SERVER_COLUMNS: BillColumn[] = [...DEFAULT_BILL_COLUMNS];
let cachedColumns: { raw: string | null; columns: BillColumn[] } | null = null;
let unstoredColumns: BillColumn[] | null = null;
const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
/** The same array while the stored value is unchanged, as useSyncExternalStore needs. */
function columnsNow(): BillColumn[] {
  if (unstoredColumns) return unstoredColumns;
  const raw = readStoredColumns(browserStorage());
  if (!cachedColumns || cachedColumns.raw !== raw) cachedColumns = { raw, columns: parseBillColumns(raw) };
  return cachedColumns.columns;
}
function subscribeColumns(onChange: () => void): () => void {
  columnListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    columnListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function setColumns(columns: BillColumn[]): void {
  unstoredColumns = writeBillColumns(browserStorage(), columns) ? null : columns;
  columnListeners.forEach((f) => f());
}

/** OOH / billboard bills (design 3.3). Keyed by version id: after a save it remounts with the stored list. */
export function BillboardEditor({ versionId, data, businesses, readOnly, query, onQuery, range, onRange }: {
  versionId: number | null; data: BillboardData; businesses: ManualBusiness[]; readOnly: boolean; query: string; onQuery: (q: string) => void;
  range: BillRange; onRange: (r: BillRange) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ row: BillboardRow | null } | null>(null);
  const columns = useSyncExternalStore(subscribeColumns, columnsNow, () => SERVER_COLUMNS);
  const fromId = useId();
  const toId = useId();
  const { shown, matching } = billsToShow(data.rows, query, showAll, range);
  const months = submitMonthOptions(data.rows, range);
  const visible = BILL_COLUMNS.filter((c) => columns.includes(c.key));
  const span = 3 + visible.length + (readOnly ? 0 : 1); // SL, Vendor, Status, the ticked columns, and Edit for the admin
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>OOH / billboard bills</CardTitle>
          <p className="text-sm text-gray-500">{billsCaption(data.rows.length)}</p>
        </div>
        <div data-testid="bills-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
          <Input aria-label="Search bills" placeholder="Vendor, PO, bill no, brand or location" value={query} className="w-full sm:w-72"
            onChange={(e) => onQuery(e.target.value)} />
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-gray-600">
            <label htmlFor={fromId}>Submitted from</label>
            <select id={fromId} className={SELECT} value={range.from} onChange={(e) => onRange({ ...range, from: e.target.value })}>
              <option value={ANY_MONTH}>Any</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label htmlFor={toId}>to</label>
            <select id={toId} className={SELECT} value={range.to} onChange={(e) => onRange({ ...range, to: e.target.value })}>
              <option value={ANY_MONTH}>Any</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}>Columns</DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              {BILL_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem key={c.key} checked={columns.includes(c.key)}
                  onCheckedChange={(on) => setColumns(toggleBillColumn(columns, c.key, on))}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!readOnly && <Button type="button" onClick={() => setEditing({ row: null })}>+ Add bill</Button>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {billFilterActive(query, range) && <p className="text-sm text-gray-500">{billsCount(matching, data.rows.length)}</p>}
        <Table data-testid="manual-bills-table">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead>
              <TableHead>Vendor</TableHead>
              {visible.map((c) => <TableHead key={c.key} className={CELLS[c.key].right ? "text-right" : undefined}>{c.label}</TableHead>)}
              <TableHead>Status</TableHead>
              {!readOnly && <TableHead><span className="sr-only">Edit</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.sl}>
                <TableCell className="text-right tabular-nums">{r.sl}</TableCell>
                <TableCell className="font-medium">{r.v}</TableCell>
                {visible.map((c) => (
                  <TableCell key={c.key} className={CELLS[c.key].right ? "text-right tabular-nums" : undefined}>{CELLS[c.key].cell(r)}</TableCell>
                ))}
                <TableCell>{r.status}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" aria-label={`Edit bill ${r.bill || `SL ${r.sl}`}`} onClick={() => setEditing({ row: r })}>Edit</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {matching === 0 && data.rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={span} className="py-6 text-center text-gray-500">No bills match.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!showAll && matching > shown.length && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>{`Show all ${matching}`}</Button>
        )}
      </CardContent>
      {!readOnly && (
        <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            {editing && (
              <BillDialogForm key={editing.row?.sl ?? "new"} versionId={versionId} legend={data.legend} businesses={businesses} row={editing.row}
                onDone={() => setEditing(null)} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
```

The bill dialog, `billInput` and `changeBillboardAction` are untouched, so every bill field is still sent on each save, whatever columns show.

- [ ] **Step 5: Run the tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry"` then `npx playwright test e2e/manual-entry.spec.ts`
Expected: PASS, including tests 5 and 6 and the viewer bills test. Test 3 (add, edit, delete a bill) still passes with the default columns, which keep Bill No and Status.

- [ ] **Step 6: Type-check and lint.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" e2e/manual-entry.spec.ts`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add "src/app/(modules)/data-entry/manual-entry.tsx" "src/app/(modules)/data-entry/billboard-editor.tsx" e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
feat(manual-entry): Submit Date range and Columns menu on OOH bills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Phone layout and the full check

**Files:**
- Test: `e2e/manual-entry.spec.ts`
- Modify (only if a phone test fails): `src/app/(modules)/data-entry/quarter-buttons.tsx`, `channel-editor.tsx`, `fy-editor.tsx` or `billboard-editor.tsx`, whichever box overflows

**Interfaces:**
- Consumes: test ids `quarter-row` and `bills-toolbar`, the group "Quarter", the "Columns" button (Tasks 2 and 3); `pickQuarter`, `showView`, `openManual`; inside the phone describe, `VIEWS` and `noSideScroll`.
- Produces: no new code seam; the phone guarantee "The quarter row and the bills toolbar wrap or scroll inside their own box, with no page side scroll."

- [ ] **Step 1: Write the phone test.** In `e2e/manual-entry.spec.ts`, inside `test.describe("phone width (375 px)", …)`, add after the test "the bill dialog fits the screen":

```ts
  test("the quarter row and the bills toolbar stay inside the screen", async ({ page }) => {
    await openManual(page);
    for (const [label, id] of VIEWS.slice(0, 2)) {
      const section = await showView(page, label, id);
      const row = section.getByTestId("quarter-row");
      await expect(row).toBeVisible();
      expect(await row.evaluate((el) => el.getBoundingClientRect().right <= 375), label).toBe(true);
      await pickQuarter(section, "Q4 Apr–Jun"); // the last button: reached by scrolling inside the row's own box
      expect(await noSideScroll(page), label).toBe(true);
    }
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    const toolbar = bills.getByTestId("bills-toolbar");
    expect(await toolbar.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
    const menu = page.getByRole("menu");
    await expect(async () => {
      await bills.getByRole("button", { name: "Columns", exact: true }).click();
      await expect(menu).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    expect(await menu.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
  });
```

The existing "viewer on a phone" test already walks all three sections without side scroll, with the quarter row and toolbar now on screen.

- [ ] **Step 2: Run it.**

Run: `npx playwright test e2e/manual-entry.spec.ts`
Expected: PASS. If a box check fails, the overflowing element lacks its own scroll box or `min-w-0`. Fix it the way the existing rows are built: wrap the row in `<div className="max-w-full overflow-x-auto">…</div>` (as `QuarterButtons` does), or give the flex child `min-w-0` and `flex-wrap` (as the toolbar's range group does). Re-run, and add the fixed file to the commit.

- [ ] **Step 3: Look at it in the browser, desktop and phone.** Run `npm run dev`, sign in as the admin, open `http://localhost:3000/data-entry?tab=manual` and check, at desktop width and at 375 px (browser device toolbar): the quarter row sits above the Channel and FY tables and the chosen button is filled; Full year shows 12 months; the FY table keeps Last FY; the bills toolbar wraps on the phone; the Columns menu opens inside the screen; the count line and "No bills match." read exactly as the spec words them. Stop the dev server afterwards.

- [ ] **Step 4: Run the whole suite and the build.**

Run: `npx vitest run` then `npx tsc --noEmit` then `npx eslint e2e src` then `npx playwright test e2e/manual-entry.spec.ts e2e/phase2a-upload.spec.ts e2e/phase2b-upload.spec.ts e2e/phase2c-names.spec.ts` then `npm run build`
Expected: all green. The Phase 2 upload specs pass unchanged, and the build compiles the changed client components with no prerender error (the quarter's clock read is under `connection()`).

- [ ] **Step 5: Spec check (self-review).** Confirm each spec point has a passing test:
  - 1.1 quarter buttons, labels and month columns: unit "names the quarter buttons…"; e2e test 4.
  - 1.1 default quarter, inside and outside the FY, at the Dhaka day edge: unit "opens on today's quarter…"; e2e test 4 (against the oracle).
  - 1.1 one shared choice, Last FY kept, SL / name / Remove kept: e2e test 4.
  - 1.2 month list, Any first, oldest first, Mon'YY: unit "lists the Submit Date months…"; e2e test 5.
  - 1.2 Any/Any, From only, To only, both, reversed, blank Submit Date: unit "filters on the Submit Date month…"; e2e test 5.
  - 1.2 search, 40-row rule, "N of M bills", "No bills match.": unit "works with the search…"; e2e test 5.
  - 1.3 Columns list, order, defaults, remembered, bad stored value: units "lists the hideable bill columns…", "reads stored ticks…", "reads and writes the browser's ticks…"; e2e test 6.
  - 4 view only, all 12 months and every bill field sent: unit "keeps every month in the draft…"; e2e test 4 (hidden Aug saved); `billInput` and the bill dialog unchanged.
  - 5 viewers use all three controls: viewer tests (quarters on Channel and FY, range select, Columns enabled).
  - 6 phone: the phone tests.

- [ ] **Step 6: Commit.**

```bash
git add e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
test(manual-entry): phone layout for the quarter row and the bills toolbar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

(Add any component fixed in Step 2 to the `git add`, with its quoted path.)

---

## Decisions this plan makes where the spec is silent

- **Which FY sets the opening quarter.** The two editors can show different FYs but share one choice. The opening quarter uses the Channel cost FY, the section that opens first.
- **"N of M bills".** N is every bill that matches (not only the 40 shown), M is all bills. The words stay exactly "N of M bills", also when M is 1.
- **"No bills match."** shows when there are bills and none match the search and range. An empty bill list shows the empty table, as before.
- **Edit column for viewers.** "Edit always shows" applies to the admin; a viewer still has no Edit column, as today.
- **A chosen month whose last bill goes** stays on its list, so a select never holds a value it does not show.
- **The FY quarter row** shows only when a brand is on screen (there is no table to narrow otherwise).
- **The range lives in the shell** with the search, so it survives the remount after a bill save; "Show all" still resets, as today.
- **The browser test for the opening quarter** works out today's quarter on its own from the date in Dhaka. While today is in FY 2026-27 (the test file's FY), it checks 3 month columns; after June 2027 it checks Full year with 12.
