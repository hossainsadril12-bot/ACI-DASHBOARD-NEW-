# Manual Entry (Phase 2 Part E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Data Entry gets a Manual Entry tab where the admin types in or corrects Channel cost, FY media spend and OOH / billboard bills; each save publishes a new version of the same dataset with source "manual", shown in Upload History as "Manual edit" and restorable like any upload.

**Architecture:** Pure save rules (`src/lib/manual/rules.ts`) turn what an editor sends into exactly the shapes the readers produce (`ChannelData`, `FyRow[]`, `BillboardData`), reusing the readers' own summary and label builders. A server module (`src/server/manual-entry.ts`) parses every input with zod. Inside one write transaction it checks that the dataset's active version is still the one the admin opened, adds any new brand, and publishes with source "manual" through `publishVersionsTx`. Three admin-only server actions call it. The Data Entry page loads the active versions and the catalog on the server and hands them to a client shell with three editors. Each editor is keyed by its version id, so a successful save remounts it with what the server stored.

**Tech Stack:** Next.js 16.4.6 App Router (cacheComponents), React 19, TypeScript strict, Tailwind 4, shadcn (base-ui), Drizzle + SQLite (`@libsql/client`), zod 4, Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-19-manual-entry-design.md`. **Branch:** `feat/manual-entry`, from `main` at 6b05820.

## Global Constraints

Project rules, verbatim from the spec:
- "Data Entry gets a third tab between the other two: **Upload Data**, **Manual Entry**, **Upload History**. Admin only. A viewer sees the tab read-only, with inputs turned off and the note "Only the admin can change data. Sign in to edit.""
- "Manual Entry edits the **same datasets** the uploads fill: `channel`, `fy` and `billboard`. A save publishes a new version of that dataset with source "manual". That version shows in Upload History as "Manual edit", and it can be restored like any upload."
- "It works with nothing uploaded yet. The tables start empty and the admin can add rows."
- "Billing (Dashboard Media Final), ATL, Digital and the Activity Calendar have no manual entry."
- "Deleting a bill asks for confirmation first." "The business choices come from the Businesses & Brands list, not a fixed list."
- "A save checks that nobody published that dataset after the admin opened it. If someone did, nothing is saved and the screen says "This data changed after you opened it. Reload to see the latest, then make your change again.""
- "The dataset shapes stay the same as the readers produce (`ChannelData`, `FyRow[]`, `BillboardData`), so the Phase 3 pages read manual and uploaded data the same way."
- Channel: "Rows with no name are dropped, names are trimmed and SL is renumbered from 1." "A blank amount counts as 0." Summary "Electronic x Mn · Digital y Mn · Press & Radio z Mn".
- FY: "rows with every value 0 are dropped; values are rounded to 4 decimals; the summary is "N brands · FY spend x Mn"".
- Bills: "publishes the whole `billboard` dataset, with the bills renumbered from 1; a blank Bill Difference becomes PO minus Bill; a blank PO Amount or Bill Amount becomes 0." Summary "Added bill <no> · <vendor> · <status>", "Edited …" or "Deleted …". "A new bill starts with: Status "Finance/Audit" and today's date as the Submit Date."

Exact UI strings (spec copy, verbatim): tabs "Upload Data", "Manual Entry", "Upload History"; switch "Channel cost", "FY media spend", "OOH / billboard bills"; "Electronic", "Digital", "Press & Radio"; "Channel cost · <name>"; "BDT · type amounts, add or remove rows, then Save & publish"; columns "Channel" / "Platform" / "Newspaper / station"; "+ Add channel", "+ Add platform", "+ Add newspaper / station"; "Unsaved changes", "All saved", "Discard changes", "Save & publish"; "+ Add brand"; "FY media spend · <brand>"; "BDT Mn · <business> · FY <year> months Jul to Jun, plus the last FY total"; "Last FY"; "OOH / billboard bills"; "N bills · add a bill or change a status. Each save publishes."; "+ Add bill"; bill columns "SL, Vendor, PO, Bill No, PO Amount, Bill Amount, Brand, Location, Status" + Edit; "Show all N"; dialog fields "Name of the Media / Vendor", "Purchase Order", "Bill No", "Brand", "Bill", "Cheque", "Location", "Comments", "PO Amount", "Bill Amount", "Bill Difference (blank = PO − Bill)", "Start Date", "End Date", "Submit Date", "Payment Request Date", "Business", "Status"; "Delete bill", "Cancel".

New strings this plan adds (the only ones; change them here if the owner wants other words): `VENDOR_REQUIRED` "Enter the name of the media / vendor."; `BAD_AMOUNT` "Amounts must be numbers."; `BAD_DATE` "Dates must be real dates."; `BAD_STATUS` "Pick a status from the list."; `NO_BILL` "That bill no longer exists. Reload to see the latest."; `INVALID_INPUT` "Some values could not be saved. Check them and try again."; "Pick the business."; "Pick a brand or type a new name."; "<name> is already in the FY data."; "No brands yet. Add a brand to start." (admin) / "No FY data yet." (viewer); delete confirm "Delete bill <no>? You can bring it back from Upload History."; toasts "Channel cost saved and published.", "FY media spend saved and published.", and the bill summary.

Project rules from earlier plans, still in force:
- App folder `aci-media-dashboard/`; run every command from there. Next.js 16 has breaking changes. Read `AGENTS.md` and `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` before Task 3. Relevant points: an action called from an event handler runs inside `startTransition`; `revalidatePath` in an action re-renders the current route in the same response; every action is an untrusted POST and must authorise and validate itself. The body limit is set in `next.config.ts` (`serverActions.bodySizeLimit: "4mb"`), which every payload in this plan stays well under.
- **Readers stay faithful.** Tasks 1 changes the channel and billboard readers only to export helpers they already compute; their output is unchanged (their tests prove it).
- UI follows the existing Data Entry / Businesses style with the shared components (`Card`, `Button`, `Dialog`, `Input`, `Table`, `SegmentedButtons`, native `<select>`). Check desktop and 375 px phone.
- Store-heavy Vitest files close the stores they open (`afterAll`), as `src/server/ingest.test.ts` does, because libSQL clients left open can crash the worker on Windows.
- Commits are small Conventional Commits. The message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with a heredoc through the Bash tool (`git commit -F - <<'EOF' … EOF`). Stage exact paths only; quote paths that contain `(modules)`. Never stage `netlify.toml`, `.env*`, `Asset/`, `.spine/`, `test-results/`, `e2e/.auth/`.

Security constraints (security-standard section 1, verbatim where they apply; a violation is Critical):
- **Rule 1:** "No secrets in code. API keys, tokens, passwords, signing secrets and connection strings live only in git-ignored env files and the host's secret store. Never in source, tests, docs, fixtures, client bundles or commit history."
- **Rule 2:** "Server env never reaches the client." The editors receive only dataset data and visible catalog names.
- **Rule 3:** "Every route is authenticated and authorised on the server. … Admin routes check an audited admin list where one exists, or an explicit admin role. No route relies on the client hiding a button." Every new server action calls `requireAdmin()` before anything else (Task 3). `src/auth/guard-every-action.test.ts` covers them automatically. Task 3 adds a mutation proof.
- **Rule 4:** "Object-level access on every id. Every id that arrives in a URL **or a request body** is checked … before it is read, written or joined." This single-tenant app has no tenants, so the check is that each id names a real, current object:
  - `baseVersionId` is checked against the dataset's active version.
  - A bill's `sl` is checked against the bills in that active version.
  - A new brand's `businessSlug`, and a bill's business name, must be visible businesses on the list (a bill's own current value is also accepted).
  - Each check has a refusing test.
- **Rule 6:** "Parameterised queries only. No string-built SQL." All reads and writes go through the Drizzle query builder and the existing store functions.
- **Rule 8:** "State changes that move money, stock or approvals are guarded inside the transaction … so a double submit or race can never apply twice or overwrite a concurrent decision." Bill statuses and amounts are money. Every save re-reads the active version inside the write transaction (`BEGIN IMMEDIATE`, libSQL's default "write" mode) and refuses with the stale message when it moved. Task 2 has a two-saves race test and a mutation proof.
- **Rule 9:** "Input is validated on the server, and the database enforces key invariants itself." Every action parses with zod (lengths, row counts, 12 months, finite bounded amounts, real ISO dates). The existing CHECK constraints (`dataset_version_source_valid`, key lengths, append-only triggers) still back the store.
- **Rule 10:** "No process-global side effects from a product module." No global zod config. Messages are set per schema.
- **Rule 11:** "Tests never touch production." Vitest uses `createTestStore()` (in-memory); Playwright uses the temp data folder from `playwright.config.ts`.
- **Rule 13:** "No claim without proof." The admin guard and the stale guard are each mutation-proved: break the guard on a working copy, see the test go red, restore from a backup copy (never `git checkout`).
- Section 2 items for the three new actions (Task 3): behind `requireAdmin`; ids from the body checked (above); refusals return `{ error: <plain message> }`, never a stack, SQL or path; no new dependency; tests on the temp store only.

---

## File Structure

- `src/lib/ingest/readers/channel.ts` (modify). **Seam adds:** `channelSummary(data: ChannelData): string`, `channelLabel(months: string[]): string`. `readChannel` uses them; its output is unchanged.
- `src/lib/ingest/readers/billboard.ts` (modify). **Seam adds:** `DEFAULT_BILL_STATUSES: readonly string[]`, `businessGroup(biz: string): string`, `billboardLabel(n: number): string`. `readBillboard` uses them; its output is unchanged.
- `src/lib/manual/rules.ts` (new, pure, browser-safe, relative imports). **Seam:** the save rules and FY-year helpers. `channelVersion`, `fyVersion`, `applyBillChange`, `billboardVersion`, `fyStartOf`, `currentFyStart`, `fyMonths`, `fyMonthLabels`, `fyName`, `dhakaDate`, the message constants and the input types.
- `src/store/datasets.ts` (modify). **Seam adds:** `STALE_MESSAGE`, `activeIfCurrentTx<T>(tx, datasetKey, baseVersionId)`. `getActiveData` now takes a store or a transaction and returns `summary`.
- `src/server/manual-entry.ts` (new, server). **Seam:** `ChannelSaveSchema`, `FySaveSchema`, `BillChangeSchema`, `INVALID_INPUT`, `ManualSaved`, `saveChannel(store, input, now?)`, `saveFy(store, input, now?)`, `changeBillboard(store, input)`.
- `src/server/action-state.ts` (modify). **Seam adds:** `ManualSaveState`.
- `src/app/(modules)/data-entry/actions.ts` (modify). **Seam adds:** `saveChannelAction(input: unknown)`, `saveFyAction(input: unknown)`, `changeBillboardAction(input: unknown)`, each returning `Promise<ManualSaveState>`.
- `src/app/(modules)/data-entry/history-table.tsx` (modify): the "Manual edit" tag in the File column.
- `src/app/(modules)/data-entry/manual-drafts.ts` (new, pure, browser-safe). **Seam:** the editor state. Types `ManualBusiness` and `ManualEntryData`; amount parsing; channel, FY and bill draft functions; the Add brand rule; bill search and paging.
- `src/app/(modules)/data-entry/manual-data.ts` (new, server). **Seam:** `loadManualEntry(store, now?): Promise<ManualEntryData>`.
- `src/app/(modules)/data-entry/manual-entry.tsx` (new, client). **Seam:** `ManualEntry({ admin, data })`. It holds the switch, the viewer note and the three editor sections.
- `src/app/(modules)/data-entry/save-bar.tsx` (new). **Seam:** `SaveBar({ dirty, pending, error, onDiscard, onSave })`.
- `src/app/(modules)/data-entry/channel-editor.tsx`, `fy-editor.tsx`, `add-brand-dialog.tsx`, `billboard-editor.tsx`, `bill-dialog.tsx` (new, client). **Seams:** one exported component each (signatures in Tasks 4–6).
- `src/app/(modules)/data-entry/page.tsx` (modify): third tab, the manual branch, the header tab bar in a scroll box.
- `src/components/shell/page-header.tsx` (modify): the actions box may not be wider than the page (`min-w-0 max-w-full`).
- `e2e/manual-entry.spec.ts` (new): the browser tests (runs in the `chromium` project).

---

### Task 1: Save rules and the readers' shared builders

**Files:**
- Modify: `src/lib/ingest/readers/channel.ts`
- Modify: `src/lib/ingest/readers/billboard.ts`
- Create: `src/lib/manual/rules.ts`
- Test: `src/lib/manual/rules.test.ts`, `src/lib/ingest/readers/channel.test.ts`, `src/lib/ingest/readers/billboard.test.ts`

**Interfaces:**
- Consumes: `monthLabel`, `pad2`, `round` from `src/lib/ingest/cells.ts`; `ChannelData`, `BillboardData`, `BillboardRow`, `FyRow`; `ValidationError` from `src/server/errors.ts`.
- Produces:
```ts
// channel.ts
export function channelSummary(data: ChannelData): string;   // "Electronic x Mn · Digital y Mn · Press & Radio z Mn"
export const channelLabel: (months: string[]) => string;      // "Channel Cost, Jul'26 to Nov'26" | "Channel Cost"
// billboard.ts
export const DEFAULT_BILL_STATUSES: readonly string[];        // his five, legend order
export const businessGroup: (biz: string) => string;          // Toiletries | Hygiene | Salt | Others
export const billboardLabel: (n: number) => string;           // "Billboard billing, N bills"
// src/lib/manual/rules.ts
export const VENDOR_REQUIRED: string; export const BAD_AMOUNT: string; export const BAD_DATE: string;
export const BAD_STATUS: string; export const NO_BILL: string;
export const CHANNEL_SHEETS: readonly ["elec", "dig", "press"];
export type ChannelKey = "elec" | "dig" | "press";
export type ChannelInput = Record<ChannelKey, { n: string; m: number[] }[]>;
export const FY_MEDIA: readonly ["TV", "Digital", "Print", "OOH"];
export type BillInput = { v: string; po: string; bill: string; b: string; billc: string; chq: string; loc: string; cm: string;
  poa: number | null; ba: number | null; diff: number | null; st: string; en: string; sb: string; pr: string; biz: string; status: string };
export type BillChange = { op: "add"; bill: BillInput } | { op: "edit"; sl: number; bill: BillInput } | { op: "delete"; sl: number };
export type ManualSummary = { summary: string; months: string[]; rowCount: number; warnings: string[]; fyStart?: number };
export type ManualVersion<T> = { datasetKey: string; kind: string; label: string; summary: ManualSummary; data: T };
export function dhakaDate(now: Date): string;                 // "YYYY-MM-DD" in Asia/Dhaka
export function currentFyStart(now: Date): number;
export function fyStartOf(active: { label: string; summary: Record<string, unknown> } | null, now: Date): number;
export function fyMonths(fyStart: number): string[];          // "2026-07" … "2027-06"
export function fyMonthLabels(fyStart: number): string[];     // "Jul'26" … "Jun'27"
export function fyName(fyStart: number): string;              // "2026-27"
export function cleanChannel(input: ChannelInput): ChannelData;
export function channelVersion(input: ChannelInput, fyStart: number): ManualVersion<ChannelData>;
export function cleanFy(rows: FyRow[]): FyRow[];
export function fySummary(rows: FyRow[]): string;             // "N brands · FY spend x Mn"
export function fyVersion(rows: FyRow[], fyStart: number): ManualVersion<FyRow[]>;
export function applyBillChange(data: BillboardData | null, change: BillChange,
  businessOf: (raw: string, prev: BillboardRow | null) => string): { data: BillboardData; summary: string };
export function billboardVersion(data: BillboardData, summary: string): ManualVersion<BillboardData>;
```

- [ ] **Step 1: Write the failing reader tests.** In `src/lib/ingest/readers/channel.test.ts`, change the import to `import { channelLabel, channelSummary, readChannel, type ChannelData } from "./channel";` and add inside `describe("Channel Cost read errors", …)` after the last `it`:

```ts
  it("builds its label and summary with the shared builders", () => {
    const months = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name", ...months], [], [1, "ATN Bangla", 1500000, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1500200]] }]);
    const r = readChannel(open(b));
    expect(r.label).toBe("Channel Cost, Jul'26 to Aug'26");
    expect(r.label).toBe(channelLabel(r.months));
    expect(r.summary).toBe("Electronic 1.50 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn");
    expect(r.summary).toBe(channelSummary(r.data));
    expect(channelLabel([])).toBe("Channel Cost");
  });
```

In `src/lib/ingest/readers/billboard.test.ts`, change the import to `import { DEFAULT_BILL_STATUSES, billboardLabel, businessGroup, readBillboard, type BillboardData } from "./billboard";` and append:

```ts
describe("Billboard shared helpers", () => {
  it("has his five standard statuses in his legend order", () => {
    expect(DEFAULT_BILL_STATUSES).toEqual(["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"]);
  });
  it("groups a business as Toiletries, Hygiene or Salt, else Others", () => {
    expect(["Toiletries", "Hygiene", "Salt", "AI", "Foods", ""].map(businessGroup)).toEqual(["Toiletries", "Hygiene", "Salt", "Others", "Others", "Others"]);
  });
  it("labels the dataset by its bill count, as the reader does", () => {
    expect(billboardLabel(169)).toBe("Billboard billing, 169 bills");
  });
});
```

- [ ] **Step 2: Write the failing rules test** `src/lib/manual/rules.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { BillboardData, BillboardRow } from "../ingest/readers/billboard";
import type { FyRow } from "../ingest/readers/fy";
import {
  BAD_STATUS, NO_BILL, applyBillChange, billboardVersion, channelVersion, currentFyStart, dhakaDate, fyMonthLabels, fyMonths, fyName,
  fyStartOf, fyVersion, type BillInput,
} from "./rules";

const NOW = new Date("2026-11-19T06:00:00Z");
const months = (jul: number, aug = 0) => [jul, aug, ...Array.from({ length: 10 }, () => 0)];
const zeros = () => months(0);

describe("FY helpers", () => {
  it("reads the day and the FY in Dhaka time (UTC+6)", () => {
    expect(dhakaDate(new Date("2026-06-30T18:30:00Z"))).toBe("2026-07-01");
    expect(currentFyStart(new Date("2026-06-30T18:30:00Z"))).toBe(2026);
    expect(currentFyStart(new Date("2026-06-30T17:00:00Z"))).toBe(2025);
    expect(currentFyStart(NOW)).toBe(2026);
  });
  it("finds the FY of a version: its own fyStart, then 'FY yyyy-yy' in its label, then its first month, then today", () => {
    expect(fyStartOf({ label: "Channel Cost", summary: { fyStart: 2024, months: ["2026-07"] } }, NOW)).toBe(2024);
    expect(fyStartOf({ label: "FY spend, FY 2025-26", summary: { months: [] } }, NOW)).toBe(2025);
    expect(fyStartOf({ label: "Channel Cost, Jan'27 to Feb'27", summary: { months: ["2027-01", "2027-02"] } }, NOW)).toBe(2026);
    expect(fyStartOf({ label: "Channel Cost", summary: {} }, NOW)).toBe(2026);
    expect(fyStartOf(null, NOW)).toBe(2026);
  });
  it("lists an FY's months Jul to Jun", () => {
    expect(fyMonths(2026)).toHaveLength(12);
    expect([fyMonths(2026)[0], fyMonths(2026)[5], fyMonths(2026)[6], fyMonths(2026)[11]]).toEqual(["2026-07", "2026-12", "2027-01", "2027-06"]);
    expect([fyMonthLabels(2026)[0], fyMonthLabels(2026)[11]]).toEqual(["Jul'26", "Jun'27"]);
    expect(fyName(2026)).toBe("2026-27");
    expect(fyName(2099)).toBe("2099-00");
  });
});

describe("channelVersion", () => {
  it("drops nameless rows, trims names, renumbers SL per sheet, rounds to 2 decimals and clears the notes", () => {
    const v = channelVersion({
      elec: [{ n: "  ATN Bangla ", m: months(100000.456) }, { n: "   ", m: months(5) }, { n: "Channel i", m: months(0, 250000) }],
      dig: [{ n: "Facebook", m: months(1000000) }],
      press: [],
    }, 2026);
    expect(v.data).toEqual({
      elec: { rows: [{ sl: 1, n: "ATN Bangla", m: months(100000.46) }, { sl: 2, n: "Channel i", m: months(0, 250000) }], notes: [] },
      dig: { rows: [{ sl: 1, n: "Facebook", m: months(1000000) }], notes: [] },
      press: { rows: [], notes: [] },
    });
    expect(v).toMatchObject({ datasetKey: "channel", kind: "channel", label: "Channel Cost, Jul'26 to Aug'26" });
    expect(v.summary).toEqual({
      summary: "Electronic 0.35 Mn · Digital 1.00 Mn · Press & Radio 0.00 Mn", months: ["2026-07", "2026-08"], rowCount: 3, warnings: [], fyStart: 2026,
    });
  });
  it("labels a sheet set with no amounts 'Channel Cost' and still records its FY", () => {
    const v = channelVersion({ elec: [{ n: "ATN Bangla", m: zeros() }], dig: [], press: [] }, 2025);
    expect(v.label).toBe("Channel Cost");
    expect(v.summary).toMatchObject({ months: [], fyStart: 2025 });
  });
});

describe("fyVersion", () => {
  it("drops rows with every value 0, rounds to 4 decimals and gives the short summary", () => {
    const rows: FyRow[] = [
      { biz: "Toiletries", b: " Savlon Soap ", med: "TV", m: months(1.23456), py: 0 },
      { biz: "Toiletries", b: "Savlon Soap", med: "Digital", m: zeros(), py: 0 },
      { biz: "Hygiene", b: "Septex", med: "OOH", m: zeros(), py: 2.5 },
    ];
    const v = fyVersion(rows, 2026);
    expect(v.data).toEqual([
      { biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.2346), py: 0 },
      { biz: "Hygiene", b: "Septex", med: "OOH", m: zeros(), py: 2.5 },
    ]);
    expect(v).toMatchObject({ datasetKey: "fy", kind: "fy", label: "FY spend, FY 2026-27" });
    expect(v.summary).toEqual({ summary: "2 brands · FY spend 1.23 Mn", months: ["2026-07"], rowCount: 2, warnings: [], fyStart: 2026 });
  });
});

const row = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
  sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 100, ba: 100, diff: 0, st: null, en: null, sb: null, pr: null,
  stR: "12..3.26", enR: null, biz: "Salt", bz: "Salt", b: "ACI Salt", billc: 123, chq: "", loc: "Dhaka", cm: "", show: "Show",
  status: "Payment Done", sl, ...over,
});
const input = (over: Partial<BillInput> = {}): BillInput => ({
  v: " Vendor C ", po: "PO-3", bill: "B-3", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", poa: 1000, ba: 800, diff: null,
  st: "2026-07-01", en: "", sb: "2026-08-02", pr: "", biz: "AI", status: "Finance/Audit", ...over,
});
const base = (): BillboardData => ({ legend: ["Payment Done", "Finance/Audit"], rows: [row(1), row(2)] });
const same = (raw: string) => raw.trim();

describe("applyBillChange", () => {
  it("adds a bill at the end with the next SL, Bill Difference = PO - Bill when blank, and the business group", () => {
    const { data, summary } = applyBillChange(base(), { op: "add", bill: input() }, same);
    expect(data.rows.map((r) => r.sl)).toEqual([1, 2, 3]);
    expect(data.rows[2]).toEqual({
      sl0: null, v: "Vendor C", po: "PO-3", bill: "B-3", poa: 1000, ba: 800, diff: 200, st: "2026-07-01", en: null, sb: "2026-08-02", pr: null,
      stR: null, enR: null, biz: "AI", bz: "Others", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", show: "", status: "Finance/Audit", sl: 3,
    });
    expect(summary).toBe("Added bill B-3 · Vendor C · Finance/Audit");
    expect(data.legend).toEqual(["Payment Done", "Finance/Audit"]);
  });
  it("makes blank PO and Bill amounts 0, and keeps a typed Bill Difference", () => {
    expect(applyBillChange(null, { op: "add", bill: input({ poa: null, ba: null }) }, same).data.rows[0]).toMatchObject({ poa: 0, ba: 0, diff: 0 });
    expect(applyBillChange(null, { op: "add", bill: input({ diff: 50 }) }, same).data.rows[0].diff).toBe(50);
  });
  it("starts from his five standard statuses when nothing was uploaded", () => {
    const { data } = applyBillChange(null, { op: "add", bill: input() }, same);
    expect(data.legend).toEqual(["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"]);
    expect(data.rows[0].sl).toBe(1);
  });
  it("edits a bill by SL: keeps its sheet SL and Show flag, clears unreadable-date text, asks for the business", () => {
    const businessOf = vi.fn((raw: string) => `${raw}!`);
    const { data, summary } = applyBillChange(base(), { op: "edit", sl: 1, bill: input({ status: "Payment Done", biz: "Salt" }) }, businessOf);
    expect(businessOf).toHaveBeenCalledWith("Salt", row(1));
    expect(data.rows[0]).toMatchObject({ sl: 1, sl0: 1, show: "Show", stR: null, v: "Vendor C", biz: "Salt!", status: "Payment Done" });
    expect(data.rows[1]).toEqual(row(2));
    expect(summary).toBe("Edited bill B-3 · Vendor C · Payment Done");
  });
  it("deletes a bill by SL and renumbers the rest from 1", () => {
    const { data, summary } = applyBillChange(base(), { op: "delete", sl: 1 }, same);
    expect(data.rows).toEqual([{ ...row(2), sl: 1 }]);
    expect(summary).toBe("Deleted bill B-1 · Vendor 1 · Payment Done");
  });
  it("leaves the bill number out of the summary when it is blank", () => {
    expect(applyBillChange(null, { op: "add", bill: input({ bill: "" }) }, same).summary).toBe("Added bill · Vendor C · Finance/Audit");
  });
  it("refuses an SL that is not there", () => {
    expect(() => applyBillChange(base(), { op: "edit", sl: 9, bill: input() }, same)).toThrow(NO_BILL);
    expect(() => applyBillChange(base(), { op: "delete", sl: 9 }, same)).toThrow(NO_BILL);
  });
  it("takes only legend statuses, plus the edited bill's own status", () => {
    expect(() => applyBillChange(base(), { op: "add", bill: input({ status: "Paid?" }) }, same)).toThrow(BAD_STATUS);
    const unmarked = { legend: ["Payment Done"], rows: [row(1, { status: "Unmarked" })] };
    expect(applyBillChange(unmarked, { op: "edit", sl: 1, bill: input({ status: "Unmarked" }) }, same).data.rows[0].status).toBe("Unmarked");
  });
});

describe("billboardVersion", () => {
  it("labels and summarises the whole dataset like an upload", () => {
    const { data, summary } = applyBillChange(base(), { op: "add", bill: input() }, same);
    expect(billboardVersion(data, summary)).toEqual({
      datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 3 bills",
      summary: { summary: "Added bill B-3 · Vendor C · Finance/Audit", months: [], rowCount: 3, warnings: [] }, data,
    });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail.**

Run: `npx vitest run src/lib/manual/rules.test.ts src/lib/ingest/readers/channel.test.ts src/lib/ingest/readers/billboard.test.ts`
Expected: FAIL. The rules module is missing and `channelSummary`, `channelLabel`, `DEFAULT_BILL_STATUSES`, `businessGroup`, `billboardLabel` are not exported.

- [ ] **Step 4: Export the reader helpers.** In `src/lib/ingest/readers/channel.ts`, add after `const MON_NUM …`:

```ts
/** "Electronic x Mn · Digital y Mn · Press & Radio z Mn": the upload's summary line. Manual Entry uses it too. */
export function channelSummary(data: ChannelData): string {
  const T = (k: keyof ChannelData) => data[k].rows.reduce((t, r) => t + r.m.reduce((a, b) => a + b, 0), 0);
  return `Electronic ${f2(T("elec") / 1e6)} Mn · Digital ${f2(T("dig") / 1e6)} Mn · Press & Radio ${f2(T("press") / 1e6)} Mn`;
}

/** "Channel Cost, Jul'26 to Nov'26" for sorted "YYYY-MM" months; "Channel Cost" for none. */
export const channelLabel = (months: string[]): string =>
  months.length ? `Channel Cost, ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : "Channel Cost";
```

In `readChannel`, delete the line `const T = (k: keyof ChannelData) => …`. In the returned object, replace the `label:` and `summary:` lines with:

```ts
    label: channelLabel(months),
    summary: channelSummary(out),
```

In `src/lib/ingest/readers/billboard.ts`, add after `const BBLEG_DEFAULT …`:

```ts
/** His five standard statuses in his legend order: the Status choices before any file is uploaded. */
export const DEFAULT_BILL_STATUSES: readonly string[] = Object.values(BBLEG_DEFAULT);
/** The group the OOH page filters by: Toiletries, Hygiene or Salt, else Others. */
export const businessGroup = (biz: string): string => (["Toiletries", "Hygiene", "Salt"].includes(biz) ? biz : "Others");
/** "Billboard billing, N bills", as the reader labels it. */
export const billboardLabel = (n: number): string => `Billboard billing, ${n} bills`;
```

In `readBillboard`, replace `bz: ["Toiletries", "Hygiene", "Salt"].includes(biz) ? biz : "Others",` with `bz: businessGroup(biz),`, and `label: \`Billboard billing, ${rows.length} bills\`,` with `label: billboardLabel(rows.length),`.

- [ ] **Step 5: Write the rules module** `src/lib/manual/rules.ts`:

```ts
import { monthLabel, pad2, round } from "../ingest/cells";
import { DEFAULT_BILL_STATUSES, billboardLabel, businessGroup, type BillboardData, type BillboardRow } from "../ingest/readers/billboard";
import { channelLabel, channelSummary, type ChannelData, type ChannelSheet } from "../ingest/readers/channel";
import type { FyRow } from "../ingest/readers/fy";
import { ValidationError } from "../../server/errors";

// Manual Entry's save rules (design 3.1 to 3.3). Pure: no store, no clock of its own, safe for the browser.

export const VENDOR_REQUIRED = "Enter the name of the media / vendor.";
export const BAD_AMOUNT = "Amounts must be numbers.";
export const BAD_DATE = "Dates must be real dates.";
export const BAD_STATUS = "Pick a status from the list.";
export const NO_BILL = "That bill no longer exists. Reload to see the latest.";

export const CHANNEL_SHEETS = ["elec", "dig", "press"] as const;
export type ChannelKey = (typeof CHANNEL_SHEETS)[number];
/** What the Channel cost editor sends: each sheet's rows, a name and 12 amounts (Jul to Jun) in BDT. */
export type ChannelInput = Record<ChannelKey, { n: string; m: number[] }[]>;

/** The rows the FY editor shows for every brand. */
export const FY_MEDIA = ["TV", "Digital", "Print", "OOH"] as const;

/** One bill as the dialog sends it: text as typed, amounts null when blank, dates "YYYY-MM-DD" or "". */
export type BillInput = {
  v: string; po: string; bill: string; b: string; billc: string; chq: string; loc: string; cm: string;
  poa: number | null; ba: number | null; diff: number | null;
  st: string; en: string; sb: string; pr: string;
  biz: string; status: string;
};
export type BillChange = { op: "add"; bill: BillInput } | { op: "edit"; sl: number; bill: BillInput } | { op: "delete"; sl: number };

/** The summary a manual version stores, in the same fields an upload's has (History reads rowCount). */
export type ManualSummary = { summary: string; months: string[]; rowCount: number; warnings: string[]; fyStart?: number };
/** What a manual save publishes: an upload's publish input without the file and the source. */
export type ManualVersion<T> = { datasetKey: string; kind: string; label: string; summary: ManualSummary; data: T };

const f2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- FY (July to June) --------------------------------------------------------------------------------------

/** "YYYY-MM-DD" of a moment in Dhaka. */
export const dhakaDate = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The start year of the FY a moment falls in, in Dhaka. */
export function currentFyStart(now: Date): number {
  const [y, m] = dhakaDate(now).split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

/** The FY a version is about: Manual Entry's own fyStart, else "FY 2026-27" in its label, else its first month, else today's FY. */
export function fyStartOf(active: { label: string; summary: Record<string, unknown> } | null, now: Date): number {
  if (!active) return currentFyStart(now);
  const own = active.summary.fyStart;
  if (typeof own === "number" && Number.isInteger(own)) return own;
  const inLabel = active.label.match(/FY (\d{4})-\d{2}/);
  if (inLabel) return Number(inLabel[1]);
  const months = active.summary.months;
  const first = Array.isArray(months) ? months.find((x): x is string => typeof x === "string" && /^\d{4}-\d{2}$/.test(x)) : undefined;
  if (first) {
    const [y, m] = first.split("-").map(Number);
    return m >= 7 ? y : y - 1;
  }
  return currentFyStart(now);
}

/** The 12 months of an FY, "YYYY-MM", Jul to Jun. */
export const fyMonths = (fyStart: number): string[] =>
  Array.from({ length: 12 }, (_, i) => (i < 6 ? `${fyStart}-${pad2(i + 7)}` : `${fyStart + 1}-${pad2(i - 5)}`));
/** "Jul'26" … "Jun'27". */
export const fyMonthLabels = (fyStart: number): string[] => fyMonths(fyStart).map(monthLabel);
/** "2026-27". */
export const fyName = (fyStart: number): string => `${fyStart}-${pad2((fyStart + 1) % 100)}`;

/** The FY's months that have any amount in any row. */
const usedMonths = (fyStart: number, rows: { m: number[] }[]) => fyMonths(fyStart).filter((_, i) => rows.some((r) => r.m[i]));

// ---- Channel cost ---------------------------------------------------------------------------------------------

/** Rows with no name dropped, names trimmed, SL 1..N per sheet, amounts to 2 decimals (as the reader), notes cleared. */
export function cleanChannel(input: ChannelInput): ChannelData {
  const sheet = (rows: ChannelInput[ChannelKey]): ChannelSheet => ({
    rows: rows
      .map((r) => ({ n: r.n.trim(), m: r.m.map((v) => round(v, 2)) }))
      .filter((r) => r.n !== "")
      .map((r, i) => ({ sl: i + 1, n: r.n, m: r.m })),
    notes: [],
  });
  return { elec: sheet(input.elec), dig: sheet(input.dig), press: sheet(input.press) };
}

export function channelVersion(input: ChannelInput, fyStart: number): ManualVersion<ChannelData> {
  const data = cleanChannel(input);
  const all = CHANNEL_SHEETS.flatMap((k) => data[k].rows);
  const months = usedMonths(fyStart, all);
  return {
    datasetKey: "channel", kind: "channel", label: channelLabel(months),
    summary: { summary: channelSummary(data), months, rowCount: all.length, warnings: [], fyStart },
    data,
  };
}

// ---- FY media spend --------------------------------------------------------------------------------------------

/** Names trimmed, values to 4 decimals, rows with every value 0 (12 months and last FY) dropped. Order kept. */
export function cleanFy(rows: FyRow[]): FyRow[] {
  return rows
    .map((r) => ({ biz: r.biz.trim(), b: r.b.trim(), med: r.med.trim(), m: r.m.map((v) => round(v, 4)), py: round(r.py, 4) }))
    .filter((r) => r.m.some((v) => v !== 0) || r.py !== 0);
}

/** "N brands · FY spend x Mn" (design 3.2; his app's manual line). */
export function fySummary(rows: FyRow[]): string {
  const total = rows.reduce((t, r) => t + r.m.reduce((a, b) => a + b, 0), 0);
  return `${new Set(rows.map((r) => r.b)).size} brands · FY spend ${f2(total)} Mn`;
}

export function fyVersion(rows: FyRow[], fyStart: number): ManualVersion<FyRow[]> {
  const data = cleanFy(rows);
  return {
    datasetKey: "fy", kind: "fy", label: `FY spend, FY ${fyName(fyStart)}`,
    summary: { summary: fySummary(data), months: usedMonths(fyStart, data), rowCount: data.length, warnings: [], fyStart },
    data,
  };
}

// ---- OOH / billboard bills ---------------------------------------------------------------------------------------

function billRow(input: BillInput, prev: BillboardRow | null, biz: string, status: string): BillboardRow {
  const poa = input.poa ?? 0;
  const ba = input.ba ?? 0;
  const day = (s: string) => s.trim() || null;
  return {
    sl0: prev ? prev.sl0 : null,
    v: input.v.trim(), po: input.po.trim(), bill: input.bill.trim(), poa, ba, diff: input.diff ?? poa - ba,
    st: day(input.st), en: day(input.en), sb: day(input.sb), pr: day(input.pr), stR: null, enR: null,
    biz, bz: businessGroup(biz), b: input.b.trim(), billc: input.billc.trim(), chq: input.chq.trim(),
    loc: input.loc.trim(), cm: input.cm.trim(), show: prev ? prev.show : "", status, sl: 0,
  };
}

/**
 * One add, edit or delete on the whole bill list, then every bill renumbered 1..N in stored order (a new bill goes
 * last, so it has the highest SL). `businessOf` turns the typed business into the one stored, or throws.
 */
export function applyBillChange(
  data: BillboardData | null,
  change: BillChange,
  businessOf: (raw: string, prev: BillboardRow | null) => string,
): { data: BillboardData; summary: string } {
  const legend = data && data.legend.length ? [...data.legend] : [...DEFAULT_BILL_STATUSES];
  const rows = [...(data?.rows ?? [])];
  const build = (bill: BillInput, prev: BillboardRow | null) => {
    const status = bill.status.trim();
    if (!legend.includes(status) && status !== prev?.status) throw new ValidationError(BAD_STATUS);
    return billRow(bill, prev, businessOf(bill.biz, prev), status);
  };
  let row: BillboardRow;
  let verb: string;
  if (change.op === "add") {
    row = build(change.bill, null);
    rows.push(row);
    verb = "Added";
  } else {
    const at = rows.findIndex((r) => r.sl === change.sl);
    const prev = at >= 0 ? rows[at] : undefined;
    if (!prev) throw new ValidationError(NO_BILL);
    if (change.op === "delete") {
      row = prev;
      rows.splice(at, 1);
      verb = "Deleted";
    } else {
      row = build(change.bill, prev);
      rows[at] = row;
      verb = "Edited";
    }
  }
  const head = row.bill ? `${verb} bill ${row.bill}` : `${verb} bill`;
  return { data: { legend, rows: rows.map((r, i) => ({ ...r, sl: i + 1 })) }, summary: [head, row.v, row.status].join(" · ") };
}

export function billboardVersion(data: BillboardData, summary: string): ManualVersion<BillboardData> {
  const n = data.rows.length;
  return { datasetKey: "billboard", kind: "billboard", label: billboardLabel(n), summary: { summary, months: [], rowCount: n, warnings: [] }, data };
}
```

- [ ] **Step 6: Run the tests to see them pass.**

Run: `npx vitest run src/lib/manual src/lib/ingest` then `npx tsc --noEmit` then `npx eslint src/lib/manual src/lib/ingest/readers/channel.ts src/lib/ingest/readers/billboard.ts`
Expected: PASS, including the real-file reader tests when `Asset/xlsx` is present (output unchanged); no type or lint errors.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/manual/rules.ts src/lib/manual/rules.test.ts src/lib/ingest/readers/channel.ts src/lib/ingest/readers/channel.test.ts src/lib/ingest/readers/billboard.ts src/lib/ingest/readers/billboard.test.ts
git commit -F - <<'EOF'
feat(manual-entry): save rules for channel, FY and bills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The stale check and the manual-entry service

**Files:**
- Modify: `src/store/datasets.ts`
- Create: `src/server/manual-entry.ts`
- Test: `src/store/datasets.test.ts`, `src/server/manual-entry.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `publishVersionsTx`, `restoreVersion`, `listHistory` from `@/store/datasets`; `applyCatalogChanges`, `cleanName`, `getCatalog`, `Catalog`, `CatalogChange` from `@/store/catalog`; `normName` from `@/lib/names-normal`; `ValidationError`.
- Produces:
```ts
// src/store/datasets.ts
export type ActiveData<T> = { versionId: number; label: string; summary: Record<string, unknown>; createdAt: Date; data: T };
export function getActiveData<T>(store: Store | StoreTx, datasetKey: string): Promise<ActiveData<T> | null>;
export const STALE_MESSAGE: "This data changed after you opened it. Reload to see the latest, then make your change again.";
export function activeIfCurrentTx<T>(tx: StoreTx, datasetKey: string, baseVersionId: number | null): Promise<ActiveData<T> | null>;
// src/server/manual-entry.ts
export const INVALID_INPUT: string;
export const ChannelSaveSchema; export const FySaveSchema; export const BillChangeSchema;   // zod 4 schemas
export type ManualSaved = { versionId: number; summary: string };
export function saveChannel(store: Store, input: unknown, now?: Date): Promise<ManualSaved>;
export function saveFy(store: Store, input: unknown, now?: Date): Promise<ManualSaved>;
export function changeBillboard(store: Store, input: unknown): Promise<ManualSaved>;
```
Payloads (what the editors send):
```ts
{ baseVersionId: number | null, data: { elec: { n: string; m: number[12] }[]; dig: …; press: … } }                         // saveChannel
{ baseVersionId: number | null, rows: FyRow[], newBrands: { name: string; businessSlug: string }[] }                      // saveFy
{ baseVersionId, op: "add", bill: BillInput } | { baseVersionId, op: "edit", sl, bill } | { baseVersionId, op: "delete", sl } // changeBillboard
```

- [ ] **Step 1: Write the failing store tests.** In `src/store/datasets.test.ts`, change the import from `./datasets` to also take `STALE_MESSAGE, activeIfCurrentTx`, and append:

```ts
describe("getActiveData", () => {
  it("returns the version's summary with its data", async () => {
    const store = await createTestStore();
    await publishVersion(store, input({ summary: { months: ["2026-07"] } }));
    expect((await getActiveData(store, "billing"))?.summary).toEqual({ months: ["2026-07"] });
  });
});

describe("activeIfCurrentTx", () => {
  const check = (store: Awaited<ReturnType<typeof createTestStore>>, base: number | null) =>
    store.transaction((tx) => activeIfCurrentTx(tx, "billing", base));

  it("passes with null before anything is published, and returns null", async () => {
    expect(await check(await createTestStore(), null)).toBeNull();
  });
  it("returns the active version when it is the one opened", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, input());
    expect((await check(store, versionId))?.versionId).toBe(versionId);
  });
  it("refuses once something was published after opening (null base)", async () => {
    const store = await createTestStore();
    await publishVersion(store, input());
    await expect(check(store, null)).rejects.toThrow(STALE_MESSAGE);
  });
  it("refuses a newer publish and a restore made after opening", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input({ label: "A" }));
    const b = await publishVersion(store, input({ label: "B" }));
    await expect(check(store, a.versionId)).rejects.toThrow(STALE_MESSAGE);
    await restoreVersion(store, a.versionId);
    await expect(check(store, b.versionId)).rejects.toThrow(STALE_MESSAGE);
  });
});
```

- [ ] **Step 2: Write the failing service test** `src/server/manual-entry.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { BAD_AMOUNT, BAD_DATE, BAD_STATUS, NO_BILL, VENDOR_REQUIRED, type BillInput } from "@/lib/manual/rules";
import { createBrand, createBusiness, getCatalog, setBusinessHidden } from "@/store/catalog";
import type { Store } from "@/store/client";
import * as datasets from "@/store/datasets";
import { STALE_MESSAGE, getActiveData, listHistory, publishVersion, restoreVersion } from "@/store/datasets";
import { createTestStore as openTestStore } from "@/store/test-store";
import { INVALID_INPUT, changeBillboard, saveChannel, saveFy } from "./manual-entry";

const opened: Store[] = [];
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const NOW = new Date("2026-11-19T06:00:00Z");
const months = (jul: number, aug = 0) => [jul, aug, ...Array.from({ length: 10 }, () => 0)];
const zeros = () => months(0);
const channel = (elec: { n: string; m: unknown[] }[] = [{ n: "ATN Bangla", m: months(100000) }]) => ({ elec, dig: [], press: [] });
const fyRow = (b: string, med: string, jul: number, biz = "Toiletries"): FyRow => ({ biz, b, med, m: months(jul), py: 0 });
const bill = (over: Partial<BillInput> = {}): BillInput => ({
  v: "Vendor A", po: "PO-1", bill: "B-1", b: "Savlon", billc: "", chq: "", loc: "Gulshan", cm: "", poa: 1000, ba: 800, diff: null,
  st: "2026-07-01", en: "2026-07-31", sb: "2026-08-02", pr: "", biz: "Toiletries", status: "Finance/Audit", ...over,
});
const uploaded = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
  sl0: sl, v: `Vendor ${sl}`, po: "", bill: `U-${sl}`, poa: 0, ba: 0, diff: 0, st: null, en: null, sb: null, pr: null, stR: null, enR: null,
  biz: "AI", bz: "Others", b: "", billc: null, chq: null, loc: "", cm: "", show: "", status: "Payment Done", sl, ...over,
});

let store: Store;
const versions = async () => (await listHistory(store)).length;

beforeEach(async () => {
  store = await openTestStore();
  opened.push(store);
  await createBusiness(store, "Toiletries");
  await createBusiness(store, "Hygiene");
  await createBusiness(store, "Old Co");
  await setBusinessHidden(store, "old-co", true);
  await createBrand(store, "toiletries", "Savlon");
});

describe("saveChannel", () => {
  it("publishes the three sheets as one manual channel version with the upload's summary line", async () => {
    const res = await saveChannel(store, { baseVersionId: null, data: channel([{ n: " ATN Bangla ", m: months(100000) }, { n: "", m: months(5) }]) }, NOW);
    expect(res.summary).toBe("Electronic 0.10 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn");
    const [h0] = await listHistory(store);
    expect(h0).toMatchObject({ versionId: res.versionId, datasetKey: "channel", kind: "channel", source: "manual", fileId: null, label: "Channel Cost, Jul'26 to Jul'26" });
    expect(h0.summary).toMatchObject({ summary: res.summary, months: ["2026-07"], rowCount: 1, fyStart: 2026 });
    expect((await getActiveData<ChannelData>(store, "channel"))?.data.elec).toEqual({ rows: [{ sl: 1, n: "ATN Bangla", m: months(100000) }], notes: [] });
  });

  it("keeps the FY of the version it edits", async () => {
    const up = await publishVersion(store, {
      datasetKey: "channel", kind: "channel", label: "Channel Cost, Aug'25 to Aug'25", source: "upload", summary: { months: ["2025-08"] },
      data: { elec: { rows: [], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } },
    });
    await saveChannel(store, { baseVersionId: up.versionId, data: channel() }, NOW);
    const [h0] = await listHistory(store);
    expect(h0.label).toBe("Channel Cost, Jul'25 to Jul'25");
    expect(h0.summary).toMatchObject({ months: ["2025-07"], fyStart: 2025 });
  });

  it("refuses with the stale message when a version was published after opening, and writes nothing", async () => {
    await saveChannel(store, { baseVersionId: null, data: channel() }, NOW);
    await expect(saveChannel(store, { baseVersionId: null, data: channel() }, NOW)).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it("refuses when a restore moved the dataset after opening", async () => {
    const a = await saveChannel(store, { baseVersionId: null, data: channel() }, NOW);
    const b = await saveChannel(store, { baseVersionId: a.versionId, data: channel([{ n: "NTV", m: months(1) }]) }, NOW);
    await restoreVersion(store, a.versionId);
    await expect(saveChannel(store, { baseVersionId: b.versionId, data: channel() }, NOW)).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(2);
  });

  it("lets exactly one of two saves from the same version through (race)", async () => {
    const results = await Promise.allSettled([
      saveChannel(store, { baseVersionId: null, data: channel() }, NOW),
      saveChannel(store, { baseVersionId: null, data: channel([{ n: "NTV", m: months(1) }]) }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect((lost?.reason as Error).message).toBe(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it.each([
    ["13 months", { baseVersionId: null, data: channel([{ n: "A", m: [...zeros(), 0] }]) }, INVALID_INPUT],
    ["a name over 120 characters", { baseVersionId: null, data: channel([{ n: "x".repeat(121), m: zeros() }]) }, INVALID_INPUT],
    ["text in an amount", { baseVersionId: null, data: channel([{ n: "A", m: ["12", ...zeros().slice(1)] }]) }, BAD_AMOUNT],
    ["an amount over 1e12", { baseVersionId: null, data: channel([{ n: "A", m: months(1e12 + 1) }]) }, BAD_AMOUNT],
    ["an endless amount", { baseVersionId: null, data: channel([{ n: "A", m: months(Infinity) }]) }, BAD_AMOUNT],
    ["501 rows in a sheet", { baseVersionId: null, data: channel(Array.from({ length: 501 }, () => ({ n: "A", m: zeros() }))) }, INVALID_INPUT],
    ["version id 0", { baseVersionId: 0, data: channel() }, INVALID_INPUT],
    ["a form instead of an object", new FormData(), INVALID_INPUT],
  ])("refuses %s with a plain message and writes nothing", async (_name, payload, message) => {
    await expect(saveChannel(store, payload, NOW)).rejects.toThrow(message);
    expect(await versions()).toBe(0);
  });
});

describe("saveFy", () => {
  it("adds a new brand to Businesses & Brands with the version, under the business picked", async () => {
    const res = await saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1.5, "anything")], newBrands: [{ name: " Neem ", businessSlug: "hygiene" }] }, NOW);
    expect(res.summary).toBe("1 brands · FY spend 1.50 Mn");
    expect((await getCatalog(store)).brandOf("Neem")).toMatchObject({ name: "Neem", businessSlug: "hygiene" });
    expect((await getActiveData<FyRow[]>(store, "fy"))?.data).toEqual([{ biz: "Hygiene", b: "Neem", med: "TV", m: months(1.5), py: 0 }]);
    expect((await listHistory(store))[0]).toMatchObject({ source: "manual", label: "FY spend, FY 2026-27" });
  });

  it("does not add a brand that is already on the list", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("SAVLON", "TV", 1)], newBrands: [{ name: "SAVLON", businessSlug: "hygiene" }] }, NOW);
    const cat = await getCatalog(store);
    expect(cat.brands.map((b) => [b.name, b.businessSlug])).toEqual([["Savlon", "toiletries"]]);
  });

  it("does not add a new brand whose rows are all 0 (they are dropped)", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 0), fyRow("Savlon", "TV", 2)], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] }, NOW);
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
  });

  it.each([["a hidden business", "old-co"], ["an unknown business", "nope"]])("refuses a new brand under %s and writes nothing", async (_n, slug) => {
    await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1)], newBrands: [{ name: "Neem", businessSlug: slug }] }, NOW))
      .rejects.toThrow("That business doesn't exist.");
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
    expect(await versions()).toBe(0);
  });

  it("rolls the new brand back when the version cannot be saved (one transaction)", async () => {
    const spy = vi.spyOn(datasets, "publishVersionsTx").mockRejectedValue(new Error("disk full"));
    try {
      await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Neem", "TV", 1)], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] }, NOW)).rejects.toThrow("disk full");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await getCatalog(store)).brandOf("Neem")).toBeNull();
    expect(await versions()).toBe(0);
  });

  it("refuses with the stale message", async () => {
    await saveFy(store, { baseVersionId: null, rows: [fyRow("Savlon", "TV", 1)], newBrands: [] }, NOW);
    await expect(saveFy(store, { baseVersionId: null, rows: [fyRow("Savlon", "TV", 2)], newBrands: [] }, NOW)).rejects.toThrow(STALE_MESSAGE);
  });

  it.each([
    ["11 months", { baseVersionId: null, rows: [{ ...fyRow("A", "TV", 1), m: zeros().slice(1) }], newBrands: [] }, INVALID_INPUT],
    ["text as last FY", { baseVersionId: null, rows: [{ ...fyRow("A", "TV", 1), py: "x" }], newBrands: [] }, BAD_AMOUNT],
    ["a blank medium", { baseVersionId: null, rows: [fyRow("A", " ", 1)], newBrands: [] }, INVALID_INPUT],
    ["a blank brand", { baseVersionId: null, rows: [fyRow("", "TV", 1)], newBrands: [] }, INVALID_INPUT],
    ["51 new brands", { baseVersionId: null, rows: [], newBrands: Array.from({ length: 51 }, (_, i) => ({ name: `B${i}`, businessSlug: "hygiene" })) }, INVALID_INPUT],
  ])("refuses %s", async (_n, payload, message) => {
    await expect(saveFy(store, payload, NOW)).rejects.toThrow(message);
  });
});

describe("changeBillboard", () => {
  it("adds the first bill, with his five standard statuses as the legend", async () => {
    const res = await changeBillboard(store, { baseVersionId: null, op: "add", bill: bill() });
    expect(res.summary).toBe("Added bill B-1 · Vendor A · Finance/Audit");
    const data = (await getActiveData<BillboardData>(store, "billboard"))?.data;
    expect(data?.legend).toEqual(["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"]);
    expect(data?.rows).toEqual([expect.objectContaining({ sl: 1, v: "Vendor A", diff: 200, biz: "Toiletries", bz: "Toiletries", sb: "2026-08-02", pr: null })]);
    expect((await listHistory(store))[0]).toMatchObject({ source: "manual", label: "Billboard billing, 1 bills", summary: expect.objectContaining({ rowCount: 1 }) });
  });

  it("edits and deletes by SL on top of the uploaded bills, keeping a business the bill already had", async () => {
    const up = await publishVersion(store, {
      datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 2 bills", source: "upload", summary: {},
      data: { legend: ["Payment Done", "Finance/Audit"], rows: [uploaded(1), uploaded(2)] },
    });
    const edited = await changeBillboard(store, { baseVersionId: up.versionId, op: "edit", sl: 1, bill: bill({ biz: "ai", status: "Payment Done" }) });
    expect((await getActiveData<BillboardData>(store, "billboard"))?.data.rows[0]).toMatchObject({ sl: 1, sl0: 1, biz: "AI", status: "Payment Done" });
    const del = await changeBillboard(store, { baseVersionId: edited.versionId, op: "delete", sl: 1 });
    expect(del.summary).toBe("Deleted bill B-1 · Vendor A · Payment Done");
    expect((await getActiveData<BillboardData>(store, "billboard"))?.data.rows).toEqual([{ ...uploaded(2), sl: 1 }]);
  });

  it("refuses a business that is not a visible one on the list", async () => {
    await expect(changeBillboard(store, { baseVersionId: null, op: "add", bill: bill({ biz: "AI" }) })).rejects.toThrow("That business doesn't exist.");
    await expect(changeBillboard(store, { baseVersionId: null, op: "add", bill: bill({ biz: "Old Co" }) })).rejects.toThrow("That business doesn't exist.");
    expect(await versions()).toBe(0);
  });

  it("refuses an SL that is not in the data, and a stale version", async () => {
    const a = await changeBillboard(store, { baseVersionId: null, op: "add", bill: bill() });
    await expect(changeBillboard(store, { baseVersionId: a.versionId, op: "delete", sl: 2 })).rejects.toThrow(NO_BILL);
    await expect(changeBillboard(store, { baseVersionId: null, op: "delete", sl: 1 })).rejects.toThrow(STALE_MESSAGE);
    expect(await versions()).toBe(1);
  });

  it.each([
    ["a blank vendor", { baseVersionId: null, op: "add", bill: bill({ v: "  " }) }, VENDOR_REQUIRED],
    ["a date that does not exist", { baseVersionId: null, op: "add", bill: bill({ st: "2026-02-30" }) }, BAD_DATE],
    ["a status not in the legend", { baseVersionId: null, op: "add", bill: bill({ status: "Paid?" }) }, BAD_STATUS],
    ["text as PO Amount", { baseVersionId: null, op: "add", bill: { ...bill(), poa: "1000" } }, BAD_AMOUNT],
    ["comments over 2000 characters", { baseVersionId: null, op: "add", bill: bill({ cm: "x".repeat(2001) }) }, INVALID_INPUT],
    ["an unknown operation", { baseVersionId: null, op: "move", sl: 1 }, INVALID_INPUT],
    ["SL 0", { baseVersionId: null, op: "delete", sl: 0 }, INVALID_INPUT],
  ])("refuses %s", async (_n, payload, message) => {
    await expect(changeBillboard(store, payload)).rejects.toThrow(message);
    expect(await versions()).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail.**

Run: `npx vitest run src/store/datasets.test.ts src/server/manual-entry.test.ts`
Expected: FAIL. `activeIfCurrentTx`, `STALE_MESSAGE` and `./manual-entry` do not exist, and `summary` is missing from `getActiveData`.

- [ ] **Step 4: Change the store.** In `src/store/datasets.ts`, replace `ActiveData` and `getActiveData` with:

```ts
export type ActiveData<T> = { versionId: number; label: string; summary: Record<string, unknown>; createdAt: Date; data: T };

/** The version a dataset shows now, with its data. Works on the store or inside a transaction. */
export async function getActiveData<T>(store: Store | StoreTx, datasetKey: string): Promise<ActiveData<T> | null> {
  const db = store as StoreTx; // the same query either way, as getCatalog does
  const [row] = await db
    .select({ versionId: datasetVersion.id, label: datasetVersion.label, summary: datasetVersion.summary, createdAt: datasetVersion.createdAt, data: datasetVersion.data })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .where(eq(dataset.key, datasetKey))
    .limit(1);
  return row ? { ...row, data: row.data as T } : null;
}

export const STALE_MESSAGE = "This data changed after you opened it. Reload to see the latest, then make your change again.";

/**
 * Inside a write transaction: the dataset's active version, only while it is still the one the admin opened (null:
 * nothing published yet). A publish or a restore since then is refused with STALE_MESSAGE, so a save never
 * overwrites it. The transaction holds the write lock (BEGIN IMMEDIATE), so two saves cannot both pass.
 */
export async function activeIfCurrentTx<T>(tx: StoreTx, datasetKey: string, baseVersionId: number | null): Promise<ActiveData<T> | null> {
  const active = await getActiveData<T>(tx, datasetKey);
  if ((active?.versionId ?? null) !== baseVersionId) throw new ValidationError(STALE_MESSAGE);
  return active;
}
```

- [ ] **Step 5: Write the service** `src/server/manual-entry.ts`:

```ts
import { z } from "zod";
import { normName } from "@/lib/names-normal";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import {
  BAD_AMOUNT, BAD_DATE, BAD_STATUS, VENDOR_REQUIRED, applyBillChange, billboardVersion, channelVersion, fyStartOf, fyVersion,
  type ManualVersion,
} from "@/lib/manual/rules";
import { applyCatalogChanges, cleanName, getCatalog, type Catalog, type CatalogChange } from "@/store/catalog";
import { activeIfCurrentTx, publishVersionsTx } from "@/store/datasets";
import type { Store, StoreTx } from "@/store/client";
import { ValidationError } from "./errors";

// Manual Entry saves (design section 4): zod first, then one write transaction that checks the version the admin
// opened, adds any new brand, and publishes with source "manual". Untrusted input: every id is checked here.

export const INVALID_INPUT = "Some values could not be saved. Check them and try again.";
const NO_BUSINESS = "That business doesn't exist.";
/** Our messages; any other zod issue becomes INVALID_INPUT, so no schema detail reaches the screen. */
const KNOWN = new Set([VENDOR_REQUIRED, BAD_AMOUNT, BAD_DATE, BAD_STATUS]);

const MAX_BDT = 1e12; // channel and bill amounts, BDT
const MAX_MN = 1e9; // FY amounts, BDT Mn
const amount = (max: number) => z.number({ error: BAD_AMOUNT }).min(-max, { error: BAD_AMOUNT }).max(max, { error: BAD_AMOUNT });
const baseVersionId = z.number().int().positive().nullable();
const name = z.string().trim().min(1).max(120);
const text = (max: number) => z.string().max(max);
const day = z.union([z.literal(""), z.iso.date({ error: BAD_DATE })]);

const channelRows = z.array(z.object({ n: z.string().max(120), m: z.array(amount(MAX_BDT)).length(12) })).max(500);
export const ChannelSaveSchema = z.object({ baseVersionId, data: z.object({ elec: channelRows, dig: channelRows, press: channelRows }) });

export const FySaveSchema = z.object({
  baseVersionId,
  rows: z.array(z.object({ biz: name, b: name, med: z.string().trim().min(1).max(40), m: z.array(amount(MAX_MN)).length(12), py: amount(MAX_MN) })).max(5000),
  newBrands: z.array(z.object({ name, businessSlug: z.string().min(1).max(60) })).max(50),
});

const BillInputSchema = z.object({
  v: z.string().trim().min(1, { error: VENDOR_REQUIRED }).max(500),
  po: text(500), bill: text(500), b: text(500), billc: text(500), chq: text(500), loc: text(500), cm: text(2000),
  poa: amount(MAX_BDT).nullable(), ba: amount(MAX_BDT).nullable(), diff: amount(MAX_BDT).nullable(),
  st: day, en: day, sb: day, pr: day,
  biz: text(120), status: z.string().trim().min(1, { error: BAD_STATUS }).max(120),
});
export const BillChangeSchema = z.discriminatedUnion("op", [
  z.object({ baseVersionId, op: z.literal("add"), bill: BillInputSchema }),
  z.object({ baseVersionId, op: z.literal("edit"), sl: z.number().int().positive(), bill: BillInputSchema }),
  z.object({ baseVersionId, op: z.literal("delete"), sl: z.number().int().positive() }),
]);

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  throw new ValidationError(r.error.issues.find((i) => KNOWN.has(i.message))?.message ?? INVALID_INPUT);
}

export type ManualSaved = { versionId: number; summary: string };

async function publishManual<T>(tx: StoreTx, v: ManualVersion<T>): Promise<ManualSaved> {
  const [versionId] = await publishVersionsTx(tx, [{ ...v, source: "manual" }]);
  return { versionId, summary: v.summary.summary };
}

/** The three Channel cost sheets as one new `channel` version, if nobody published it since `baseVersionId`. */
export async function saveChannel(store: Store, input: unknown, now: Date = new Date()): Promise<ManualSaved> {
  const { baseVersionId: base, data } = parse(ChannelSaveSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<ChannelData>(tx, "channel", base);
    return publishManual(tx, channelVersion(data, fyStartOf(active, now)));
  });
}

type Added = { name: string; businessSlug: string; businessName: string };

/** The brands added in this save, by normName, each under a visible business on the list. */
function addedBrands(catalog: Catalog, list: { name: string; businessSlug: string }[]): Map<string, Added> {
  const out = new Map<string, Added>();
  for (const nb of list) {
    const biz = catalog.businesses.find((b) => b.slug === nb.businessSlug && !b.hidden);
    if (!biz) throw new ValidationError(NO_BUSINESS);
    const clean = cleanName(nb.name);
    if (!out.has(normName(clean))) out.set(normName(clean), { name: clean, businessSlug: biz.slug, businessName: biz.name });
  }
  return out;
}

/** The FY rows as one new `fy` version, with any new brand added to the list in the same transaction. */
export async function saveFy(store: Store, input: unknown, now: Date = new Date()): Promise<ManualSaved> {
  const { baseVersionId: base, rows, newBrands } = parse(FySaveSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<FyRow[]>(tx, "fy", base);
    const catalog = await getCatalog(tx);
    const added = addedBrands(catalog, newBrands);
    // A new brand's rows sit under the business it was added to.
    const placed = rows.map((r) => {
      const a = added.get(normName(r.b));
      return a ? { ...r, biz: a.businessName } : r;
    });
    const version = fyVersion(placed, fyStartOf(active, now));
    const kept = new Set(version.data.map((r) => normName(r.b)));
    // Only brands that still have a row after the save rules, and are not on the list yet.
    const changes: CatalogChange[] = [...added.values()]
      .filter((a) => kept.has(normName(a.name)) && !catalog.brandOf(a.name))
      .map((a) => ({ op: "addBrand", name: a.name, businessSlug: a.businessSlug }));
    if (changes.length) await applyCatalogChanges(tx, changes);
    return publishManual(tx, version);
  });
}

/** A bill's Business: blank, a visible business on the list (its own spelling), or the bill's current value unchanged. */
function billBusiness(catalog: Catalog, raw: string, prev: BillboardRow | null): string {
  const typed = raw.trim();
  if (!typed) return "";
  if (prev && normName(prev.biz) === normName(typed)) return prev.biz;
  const b = catalog.businessOf(typed);
  if (!b || b.hidden) throw new ValidationError(NO_BUSINESS);
  return b.name;
}

/** One bill added, edited or deleted, published as the whole `billboard` dataset. */
export async function changeBillboard(store: Store, input: unknown): Promise<ManualSaved> {
  const change = parse(BillChangeSchema, input);
  return store.transaction(async (tx) => {
    const active = await activeIfCurrentTx<BillboardData>(tx, "billboard", change.baseVersionId);
    const catalog = await getCatalog(tx);
    const { data, summary } = applyBillChange(active?.data ?? null, change, (raw, prev) => billBusiness(catalog, raw, prev));
    return publishManual(tx, billboardVersion(data, summary));
  });
}
```

- [ ] **Step 6: Run the tests to see them pass.**

Run: `npx vitest run src/store src/server/manual-entry.test.ts src/server/ingest.test.ts`
Expected: PASS (ingest tests are unaffected by the `getActiveData` change).

- [ ] **Step 7: Mutation-prove the stale guard.** Copy `src/store/datasets.ts` to the scratchpad as a backup. In the working file, change `if ((active?.versionId ?? null) !== baseVersionId)` to `if (false)`. Run `npx vitest run src/store/datasets.test.ts src/server/manual-entry.test.ts`. Expected: RED, with the activeIfCurrentTx refusals, the three stale tests and the race test failing. Restore the file from the backup copy (never `git checkout`), re-run, and expect GREEN. Note the red test names for the review report.

- [ ] **Step 8: Type-check, lint, commit.**

Run: `npx tsc --noEmit` then `npx eslint src/store/datasets.ts src/store/datasets.test.ts src/server/manual-entry.ts src/server/manual-entry.test.ts`

```bash
git add src/store/datasets.ts src/store/datasets.test.ts src/server/manual-entry.ts src/server/manual-entry.test.ts
git commit -F - <<'EOF'
feat(manual-entry): save service with zod and the data-changed check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Admin-only server actions and "Manual edit" in Upload History

**Files:**
- Modify: `src/server/action-state.ts`
- Modify: `src/app/(modules)/data-entry/actions.ts`
- Modify: `src/app/(modules)/data-entry/history-table.tsx`
- Test: `src/app/(modules)/data-entry/actions.test.ts` (new), `src/app/(modules)/data-entry/history-table.test.ts`

**Interfaces:**
- Consumes: `saveChannel`, `saveFy`, `changeBillboard`, `INVALID_INPUT`, `ManualSaved` (Task 2); `requireAdmin`, `NOT_ADMIN_MESSAGE`; `toActionError`, `ActionState`; `STALE_MESSAGE`.
- Produces:
```ts
// src/server/action-state.ts
export type ManualSaveState = ActionState & { versionId?: number; summary?: string };
// src/app/(modules)/data-entry/actions.ts  ("use server")
export async function saveChannelAction(input: unknown): Promise<ManualSaveState>;
export async function saveFyAction(input: unknown): Promise<ManualSaveState>;
export async function changeBillboardAction(input: unknown): Promise<ManualSaveState>;
// success: { error: null, ok: true, versionId, summary }; refusal: { error: <plain message> }
```

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, sections "Sequential dispatch on the client", "A single response carries data and UI" and "Security". These actions follow it: they take plain JSON, authorise first, validate with zod, call `revalidatePath("/data-entry")` so the page re-renders in the same response, and return only `{ error, ok, versionId, summary }`.

- [ ] **Step 2: Write the failing tests.** Create `src/app/(modules)/data-entry/actions.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>(), revalidated: [] as string[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => { h.revalidated.push(path); } }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const a = await import("./actions");
const { NOT_ADMIN_MESSAGE } = await import("@/auth/admin");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const { createBusiness, getCatalog } = await import("@/store/catalog");
const { STALE_MESSAGE, getActiveData, listHistory } = await import("@/store/datasets");
const { INVALID_INPUT } = await import("@/server/manual-entry");

const opened: Store[] = [];
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const months = (jul: number) => [jul, ...Array.from({ length: 11 }, () => 0)];
const channel = (base: number | null = null, n = "ATN Bangla") => ({ baseVersionId: base, data: { elec: [{ n, m: months(100000) }], dig: [], press: [] } });
const fy = { baseVersionId: null, rows: [{ biz: "Hygiene", b: "Neem", med: "TV", m: months(1.5), py: 0 }], newBrands: [{ name: "Neem", businessSlug: "hygiene" }] };
const addBill = {
  baseVersionId: null, op: "add",
  bill: { v: "Vendor A", po: "", bill: "B-1", b: "", billc: "", chq: "", loc: "", cm: "", poa: 1000, ba: 800, diff: null, st: "", en: "", sb: "2026-11-19", pr: "", biz: "", status: "Finance/Audit" },
};
const counts = async () => ({ versions: (await listHistory(h.store)).length, brands: (await getCatalog(h.store)).brands.length });

beforeEach(async () => {
  h.store = await createTestStore();
  opened.push(h.store);
  h.jar.clear();
  h.revalidated = [];
  await createBusiness(h.store, "Hygiene");
});

describe("Manual Entry actions, called by a viewer", () => {
  it.each([
    ["saveChannelAction", () => a.saveChannelAction(channel())],
    ["saveFyAction", () => a.saveFyAction(fy)],
    ["changeBillboardAction", () => a.changeBillboardAction(addBill)],
  ])("%s is refused and changes nothing", async (_name, call) => {
    const before = await counts();
    expect(await call()).toEqual({ error: NOT_ADMIN_MESSAGE });
    expect(await counts()).toEqual(before);
    expect(h.revalidated).toEqual([]);
  });
});

describe("Manual Entry actions, called by the admin", () => {
  beforeEach(async () => { h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token); });

  it("saves channel cost as a manual version and refreshes Data Entry", async () => {
    const res = await a.saveChannelAction(channel());
    expect(res).toEqual({ error: null, ok: true, versionId: expect.any(Number), summary: "Electronic 0.10 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn" });
    expect((await listHistory(h.store))[0]).toMatchObject({ versionId: res.versionId, source: "manual" });
    expect(h.revalidated).toEqual(["/data-entry"]);
  });

  it("returns the data-changed message and refreshes nothing", async () => {
    await a.saveChannelAction(channel());
    h.revalidated = [];
    expect(await a.saveChannelAction(channel())).toEqual({ error: STALE_MESSAGE });
    expect(h.revalidated).toEqual([]);
  });

  it("saves FY spend and adds the new brand to the list", async () => {
    expect((await a.saveFyAction(fy)).ok).toBe(true);
    expect((await getCatalog(h.store)).brandOf("Neem")?.businessSlug).toBe("hygiene");
  });

  it("adds a bill and returns its summary", async () => {
    expect((await a.changeBillboardAction(addBill)).summary).toBe("Added bill B-1 · Vendor A · Finance/Audit");
  });

  it("restores an earlier manual version like any upload", async () => {
    const first = await a.saveChannelAction(channel());
    await a.saveChannelAction(channel(first.versionId ?? null, "NTV"));
    expect(await a.restoreVersionAction(first.versionId ?? 0)).toEqual({ error: null, ok: true });
    expect((await getActiveData(h.store, "channel"))?.versionId).toBe(first.versionId);
  });

  it("returns a plain message for input it cannot read", async () => {
    expect(await a.saveChannelAction({ nonsense: true })).toEqual({ error: INVALID_INPUT });
  });
});
```

In `src/app/(modules)/data-entry/history-table.test.ts`, add inside `describe("HistoryTable", …)`:

```ts
  it("shows Manual edit for a manual version, and the file name for an upload", () => {
    const html = renderToStaticMarkup(createElement(HistoryTable, {
      rows: [{ ...row(1), source: "manual" }, { ...row(2), fileName: "cal.xlsx", fileId: 7 }], admin: false,
    }));
    expect(html.match(/Manual edit/g)).toHaveLength(1);
    expect(html).toContain("cal.xlsx");
  });
```

- [ ] **Step 3: Run them to see them fail.**

Run: `npx vitest run "src/app/(modules)/data-entry/actions.test.ts" "src/app/(modules)/data-entry/history-table.test.ts"`
Expected: FAIL. `saveChannelAction` and the other actions are not functions, and "Manual edit" is not in the markup.

- [ ] **Step 4: Add the state type.** Append to `src/server/action-state.ts`:

```ts
/** What a Manual Entry save returns: the new version and its summary line, so the editor can say it is saved. */
export type ManualSaveState = ActionState & { versionId?: number; summary?: string };
```

- [ ] **Step 5: Add the actions.** Replace `src/app/(modules)/data-entry/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore, type Store } from "@/store/client";
import { restoreVersion } from "@/store/datasets";
import { ValidationError } from "@/server/errors";
import { changeBillboard, saveChannel, saveFy, type ManualSaved } from "@/server/manual-entry";
import { toActionError, type ActionState, type ManualSaveState } from "@/server/action-state";

export async function restoreVersionAction(versionId: number): Promise<ActionState> {
  try {
    await requireAdmin();
    if (!Number.isInteger(versionId) || versionId < 1) throw new ValidationError("That upload no longer exists.");
    await restoreVersion(await getStore(), versionId);
    revalidatePath("/data-entry");
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** The admin check first, then the save; the service parses and checks every value. */
async function manualSave(save: (store: Store) => Promise<ManualSaved>): Promise<ManualSaveState> {
  try {
    await requireAdmin();
    const { versionId, summary } = await save(await getStore());
    revalidatePath("/data-entry");
    return { error: null, ok: true, versionId, summary };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveChannelAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => saveChannel(store, input));
}

export async function saveFyAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => saveFy(store, input));
}

export async function changeBillboardAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => changeBillboard(store, input));
}
```

- [ ] **Step 6: Show "Manual edit" in History.** In `src/app/(modules)/data-entry/history-table.tsx`, replace the File cell:

```tsx
                    <TableCell className="max-w-56 truncate" title={r.fileName ?? undefined}>
                      {r.source === "manual" ? <Badge className="bg-sky-100 text-sky-800">Manual edit</Badge> : (r.fileName ?? "")}
                    </TableCell>
```

- [ ] **Step 7: Run the tests to see them pass, including the every-action guard.**

Run: `npx vitest run "src/app/(modules)/data-entry" src/auth`
Expected: PASS. `guard-every-action.test.ts` now also lists the three new actions as refused for a viewer.

- [ ] **Step 8: Mutation-prove the admin guard.** Copy `src/app/(modules)/data-entry/actions.ts` to the scratchpad as a backup. In the working file, delete the line `await requireAdmin();` inside `manualSave`. Run `npx vitest run "src/app/(modules)/data-entry/actions.test.ts" src/auth/guard-every-action.test.ts`. Expected: RED; the three viewer tests fail, and the guard test fails for `saveChannelAction`, `saveFyAction` and `changeBillboardAction`. Restore from the backup copy (never `git checkout`), re-run, and expect GREEN. Note the evidence for the review report.

- [ ] **Step 9: Type-check, lint, commit.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" src/server/action-state.ts`

```bash
git add src/server/action-state.ts "src/app/(modules)/data-entry/actions.ts" "src/app/(modules)/data-entry/actions.test.ts" "src/app/(modules)/data-entry/history-table.tsx" "src/app/(modules)/data-entry/history-table.test.ts"
git commit -F - <<'EOF'
feat(manual-entry): admin-only save actions and Manual edit in history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The Manual Entry tab, viewer note and Channel cost editor

**Files:**
- Create: `src/app/(modules)/data-entry/manual-drafts.ts`, `manual-data.ts`, `manual-entry.tsx`, `save-bar.tsx`, `channel-editor.tsx`
- Modify: `src/app/(modules)/data-entry/page.tsx`, `src/components/shell/page-header.tsx`
- Test: `src/app/(modules)/data-entry/manual-drafts.test.ts`, `src/app/(modules)/data-entry/manual-data.test.ts`, `e2e/manual-entry.spec.ts` (new)

**Interfaces:**
- Consumes: `saveChannelAction` (Task 3); `ChannelKey`, `ChannelInput`, `CHANNEL_SHEETS`, `BAD_AMOUNT`, `fyMonthLabels`, `fyStartOf`, `FY_MEDIA` (Task 1); `DEFAULT_BILL_STATUSES`; `getActiveData` (Task 2); `getCatalog`; `SegmentedButtons`.
- Produces:
```ts
// manual-drafts.ts (pure)
export type ManualBusiness = { slug: string; name: string; brands: string[] };
export type ManualEntryData = {
  channel: { versionId: number | null; fyStart: number; data: ChannelData };
  fy: { versionId: number | null; fyStart: number; rows: FyRow[] };
  billboard: { versionId: number | null; data: BillboardData };
  businesses: ManualBusiness[];        // visible businesses, sorted by name, each with its visible brands
};
export type AmountRead = { ok: true; value: number | null } | { ok: false };
export function readAmount(s: string): AmountRead;
export const amountText: (v: number) => string;            // 0 → ""
export function isDirty<T>(draft: T, initial: T): boolean;
export const CHANNEL_TABS: readonly { key: ChannelKey; label: string; column: string; add: string }[];
export type ChannelDraftRow = { key: string; n: string; m: string[] };
export type ChannelDraft = Record<ChannelKey, ChannelDraftRow[]>;
export function channelDraft(data: ChannelData): ChannelDraft;
export function addChannelRow(d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft;
export function removeChannelRow(d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft;
export function setChannelName(d: ChannelDraft, k: ChannelKey, key: string, n: string): ChannelDraft;
export function setChannelAmount(d: ChannelDraft, k: ChannelKey, key: string, month: number, text: string): ChannelDraft;
export function channelInput(d: ChannelDraft): { ok: true; data: ChannelInput } | { ok: false; error: string };
// manual-data.ts (server)
export function loadManualEntry(store: Store, now?: Date): Promise<ManualEntryData>;
// components
export function ManualEntry(props: { admin: boolean; data: ManualEntryData }): JSX.Element;            // "use client"
export function SaveBar(props: { dirty: boolean; pending: boolean; error: string | null; onDiscard: () => void; onSave: () => void }): JSX.Element;
export function ChannelEditor(props: { versionId: number | null; fyStart: number; data: ChannelData; readOnly: boolean;
  sheet: ChannelKey; onSheet: (k: ChannelKey) => void }): JSX.Element;
```
Test ids the e2e uses: sections `manual-channel` / `manual-fy` / `manual-bills`; tables `channel-table` / `fy-table` / `manual-bills-table`. Accessible names: switch group "Manual Entry sections"; channel sheet group "Channel cost sheets"; name box "<Column> <n>"; amount box "<Column> <n> <Mon'YY>".

- [ ] **Step 1: Write the failing pure tests** `src/app/(modules)/data-entry/manual-drafts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BAD_AMOUNT } from "@/lib/manual/rules";
import {
  CHANNEL_TABS, addChannelRow, amountText, channelDraft, channelInput, isDirty, readAmount, removeChannelRow, setChannelAmount, setChannelName,
} from "./manual-drafts";

const months = (jul: number) => [jul, ...Array.from({ length: 11 }, () => 0)];
const blank11 = () => Array.from({ length: 11 }, () => "");

describe("amounts", () => {
  it("reads blank as null, allows commas, refuses text", () => {
    expect(readAmount("")).toEqual({ ok: true, value: null });
    expect(readAmount(" 1,250.5 ")).toEqual({ ok: true, value: 1250.5 });
    expect(readAmount("-3")).toEqual({ ok: true, value: -3 });
    expect(readAmount("12a")).toEqual({ ok: false });
    expect(readAmount("Infinity")).toEqual({ ok: false });
  });
  it("shows 0 as a blank box", () => {
    expect([amountText(0), amountText(1500), amountText(0.25)]).toEqual(["", "1500", "0.25"]);
  });
});

describe("channel draft", () => {
  const data = {
    elec: { rows: [{ sl: 7, n: "ATN Bangla", m: months(100000) }], notes: [] },
    dig: { rows: [], notes: [] },
    press: { rows: [{ sl: "x", n: "Prothom Alo", m: months(0) }], notes: [["Prothom Alo", 1, 2]] },
  };
  it("names its three sheets, columns and add buttons as the design does", () => {
    expect(CHANNEL_TABS.map((t) => [t.key, t.label, t.column, t.add])).toEqual([
      ["elec", "Electronic", "Channel", "+ Add channel"],
      ["dig", "Digital", "Platform", "+ Add platform"],
      ["press", "Press & Radio", "Newspaper / station", "+ Add newspaper / station"],
    ]);
  });
  it("makes boxes from the data, 0 as blank", () => {
    expect(channelDraft(data)).toEqual({
      elec: [{ key: "elec-0", n: "ATN Bangla", m: ["100000", ...blank11()] }],
      dig: [],
      press: [{ key: "press-0", n: "Prothom Alo", m: ["", ...blank11()] }],
    });
  });
  it("adds, renames, types and removes rows on one sheet only, and knows when it is back to what was loaded", () => {
    const start = channelDraft(data);
    let d = addChannelRow(start, "dig", "k1");
    d = setChannelName(d, "dig", "k1", "Facebook");
    d = setChannelAmount(d, "dig", "k1", 1, "2,000");
    expect(d.dig).toEqual([{ key: "k1", n: "Facebook", m: ["", "2,000", ...blank11().slice(1)] }]);
    expect(d.elec).toBe(start.elec);
    expect(isDirty(d, start)).toBe(true);
    expect(isDirty(removeChannelRow(d, "dig", "k1"), start)).toBe(false);
  });
  it("sends blank as 0 and refuses a box that is not a number", () => {
    const d = setChannelAmount(channelDraft(data), "elec", "elec-0", 2, "");
    expect(channelInput(d)).toEqual({ ok: true, data: { elec: [{ n: "ATN Bangla", m: months(100000) }], dig: [], press: [{ n: "Prothom Alo", m: months(0) }] } });
    expect(channelInput(setChannelAmount(d, "press", "press-0", 0, "abc"))).toEqual({ ok: false, error: BAD_AMOUNT });
  });
});
```

- [ ] **Step 2: Write the failing loader test** `src/app/(modules)/data-entry/manual-data.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, createBusiness, setBrandHidden, setBusinessHidden } from "@/store/catalog";
import type { Store } from "@/store/client";
import { publishVersion } from "@/store/datasets";
import { createTestStore as openTestStore } from "@/store/test-store";
import { loadManualEntry } from "./manual-data";

const opened: Store[] = [];
const createTestStore = async () => { const s = await openTestStore(); opened.push(s); return s; };
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const NOW = new Date("2026-11-19T06:00:00Z");
const EMPTY_SHEET = { rows: [], notes: [] };

describe("loadManualEntry", () => {
  it("starts empty when nothing is published: today's FY and his five statuses", async () => {
    expect(await loadManualEntry(await createTestStore(), NOW)).toEqual({
      channel: { versionId: null, fyStart: 2026, data: { elec: EMPTY_SHEET, dig: EMPTY_SHEET, press: EMPTY_SHEET } },
      fy: { versionId: null, fyStart: 2026, rows: [] },
      billboard: { versionId: null, data: { legend: ["Payment Done", "Cheque in Hand", "Finance/Audit", "Bill Error/DOC Problem", "Cheque in Counter"], rows: [] } },
      businesses: [],
    });
  });

  it("gives each active version with its FY, and the visible businesses with their visible brands", async () => {
    const store = await createTestStore();
    const channelData = { elec: { rows: [{ sl: 1, n: "NTV", m: Array.from({ length: 12 }, () => 0) }], notes: [] }, dig: EMPTY_SHEET, press: EMPTY_SHEET };
    const ch = await publishVersion(store, { datasetKey: "channel", kind: "channel", label: "Channel Cost, Aug'25 to Aug'25", source: "upload", summary: { months: ["2025-08"] }, data: channelData });
    const fy = await publishVersion(store, { datasetKey: "fy", kind: "fy", label: "FY spend, FY 2025-26", source: "upload", summary: {}, data: [] });
    const bb = await publishVersion(store, { datasetKey: "billboard", kind: "billboard", label: "Billboard billing, 0 bills", source: "upload", summary: {}, data: { legend: ["Paid"], rows: [] } });
    await createBusiness(store, "Toiletries");
    await createBusiness(store, "Hygiene");
    await createBusiness(store, "Old Co");
    await setBusinessHidden(store, "old-co", true);
    await createBrand(store, "toiletries", "Savlon");
    const old = await createBrand(store, "toiletries", "Old Brand");
    await setBrandHidden(store, old.id, true);

    expect(await loadManualEntry(store, NOW)).toEqual({
      channel: { versionId: ch.versionId, fyStart: 2025, data: channelData },
      fy: { versionId: fy.versionId, fyStart: 2025, rows: [] },
      billboard: { versionId: bb.versionId, data: { legend: ["Paid"], rows: [] } },
      businesses: [{ slug: "hygiene", name: "Hygiene", brands: [] }, { slug: "toiletries", name: "Toiletries", brands: ["Savlon"] }],
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail.**

Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts" "src/app/(modules)/data-entry/manual-data.test.ts"`
Expected: FAIL (modules missing).

- [ ] **Step 4: Write** `src/app/(modules)/data-entry/manual-drafts.ts`:

```ts
import type { BillboardData } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { BAD_AMOUNT, CHANNEL_SHEETS, type ChannelInput, type ChannelKey } from "@/lib/manual/rules";

// Pure helpers for the Manual Entry editors: what the boxes hold and what a save sends. Safe for the browser.

export type ManualBusiness = { slug: string; name: string; brands: string[] };
/** What the page hands the editors. versionId: the version opened (null: nothing yet), sent back for the data-changed check. */
export type ManualEntryData = {
  channel: { versionId: number | null; fyStart: number; data: ChannelData };
  fy: { versionId: number | null; fyStart: number; rows: FyRow[] };
  billboard: { versionId: number | null; data: BillboardData };
  businesses: ManualBusiness[];
};

export type AmountRead = { ok: true; value: number | null } | { ok: false };
/** A typed amount: commas allowed; blank gives null; anything that is not a finite number is not ok. */
export function readAmount(s: string): AmountRead {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}
/** An amount as its box shows it: 0 is blank ("A blank amount counts as 0"). */
export const amountText = (v: number): string => (v === 0 ? "" : String(v));
/** True when the draft differs from what was loaded. */
export const isDirty = <T>(draft: T, initial: T): boolean => JSON.stringify(draft) !== JSON.stringify(initial);

const blank12 = () => Array.from({ length: 12 }, () => "");

// ---- Channel cost ---------------------------------------------------------------------------------------------

export const CHANNEL_TABS: readonly { key: ChannelKey; label: string; column: string; add: string }[] = [
  { key: "elec", label: "Electronic", column: "Channel", add: "+ Add channel" },
  { key: "dig", label: "Digital", column: "Platform", add: "+ Add platform" },
  { key: "press", label: "Press & Radio", column: "Newspaper / station", add: "+ Add newspaper / station" },
];

export type ChannelDraftRow = { key: string; n: string; m: string[] };
export type ChannelDraft = Record<ChannelKey, ChannelDraftRow[]>;

export function channelDraft(data: ChannelData): ChannelDraft {
  const rows = (k: ChannelKey): ChannelDraftRow[] =>
    data[k].rows.map((r, i) => ({ key: `${k}-${i}`, n: r.n, m: Array.from({ length: 12 }, (_, j) => amountText(r.m[j] ?? 0)) }));
  return { elec: rows("elec"), dig: rows("dig"), press: rows("press") };
}

const onRow = (d: ChannelDraft, k: ChannelKey, key: string, f: (r: ChannelDraftRow) => ChannelDraftRow): ChannelDraft =>
  ({ ...d, [k]: d[k].map((r) => (r.key === key ? f(r) : r)) });

export const addChannelRow = (d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft => ({ ...d, [k]: [...d[k], { key, n: "", m: blank12() }] });
export const removeChannelRow = (d: ChannelDraft, k: ChannelKey, key: string): ChannelDraft => ({ ...d, [k]: d[k].filter((r) => r.key !== key) });
export const setChannelName = (d: ChannelDraft, k: ChannelKey, key: string, n: string): ChannelDraft => onRow(d, k, key, (r) => ({ ...r, n }));
export const setChannelAmount = (d: ChannelDraft, k: ChannelKey, key: string, month: number, text: string): ChannelDraft =>
  onRow(d, k, key, (r) => ({ ...r, m: r.m.map((v, i) => (i === month ? text : v)) }));

/** The draft as saveChannelAction takes it (blank is 0), or the first problem. The server drops nameless rows. */
export function channelInput(d: ChannelDraft): { ok: true; data: ChannelInput } | { ok: false; error: string } {
  const data: ChannelInput = { elec: [], dig: [], press: [] };
  for (const k of CHANNEL_SHEETS) {
    for (const r of d[k]) {
      const m: number[] = [];
      for (const s of r.m) {
        const a = readAmount(s);
        if (!a.ok) return { ok: false, error: BAD_AMOUNT };
        m.push(a.value ?? 0);
      }
      data[k].push({ n: r.n, m });
    }
  }
  return { ok: true, data };
}
```

- [ ] **Step 5: Write the loader** `src/app/(modules)/data-entry/manual-data.ts`:

```ts
import { DEFAULT_BILL_STATUSES, type BillboardData } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { fyStartOf } from "@/lib/manual/rules";
import { getCatalog } from "@/store/catalog";
import type { Store } from "@/store/client";
import { getActiveData } from "@/store/datasets";
import type { ManualEntryData } from "./manual-drafts";

const emptyChannel = (): ChannelData => ({ elec: { rows: [], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } });

/** What Manual Entry opens: each dataset's active version (or an empty start), its FY, and the visible businesses and brands. */
export async function loadManualEntry(store: Store, now: Date = new Date()): Promise<ManualEntryData> {
  // One after another: one store connection.
  const channel = await getActiveData<ChannelData>(store, "channel");
  const fy = await getActiveData<FyRow[]>(store, "fy");
  const billboard = await getActiveData<BillboardData>(store, "billboard");
  const catalog = await getCatalog(store);
  const bills = billboard?.data;
  return {
    channel: { versionId: channel?.versionId ?? null, fyStart: fyStartOf(channel, now), data: channel?.data ?? emptyChannel() },
    fy: { versionId: fy?.versionId ?? null, fyStart: fyStartOf(fy, now), rows: fy?.data ?? [] },
    billboard: {
      versionId: billboard?.versionId ?? null,
      data: { legend: bills?.legend.length ? bills.legend : [...DEFAULT_BILL_STATUSES], rows: bills?.rows ?? [] },
    },
    businesses: catalog.businesses
      .filter((b) => !b.hidden)
      .map((b) => ({ slug: b.slug, name: b.name, brands: catalog.brands.filter((x) => x.businessSlug === b.slug && !x.hidden).map((x) => x.name) })),
  };
}
```

- [ ] **Step 6: Run the pure and loader tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts" "src/app/(modules)/data-entry/manual-data.test.ts"`
Expected: PASS.

- [ ] **Step 7: Write the failing browser test** `e2e/manual-entry.spec.ts`:

```ts
import { test, expect, type Dialog, type Locator, type Page } from "@playwright/test";
import { makeXlsx } from "../src/lib/ingest/test-workbooks";
import { XLSX_TYPE, historyRows } from "./helpers";

// Phase 2 Part E: Manual Entry. Serial: one shared temp store; later tests use what earlier ones saved.
test.describe.configure({ mode: "serial" });

const VIEWER_NOTE = "Only the admin can change data. Sign in to edit.";
const CHANNEL_FILE = "e2e-manual-channel.xlsx";
const MONTH_HEADS = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];

/** A Channel Cost file with one Electronic row, "E2E TV One", 100,000 BDT in Jul'26. */
const channelBook = () => makeXlsx([
  { name: "Electronic", rows: [["SL", "Channel Name", ...MONTH_HEADS], [], [1, "E2E TV One", 100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100000]] },
  { name: "Digital", rows: [["SL", "Platform", ...MONTH_HEADS]] },
  { name: "Press & Radio", rows: [["SL", "Name", ...MONTH_HEADS]] },
]);

const openManual = async (page: Page) => {
  await page.goto("/data-entry?tab=manual");
  await expect(page.getByRole("group", { name: "Manual Entry sections" })).toBeVisible();
};
/** Clicks a switch button until its section shows (a click before hydration is lost). */
const showView = async (page: Page, label: string, id: string) => {
  const section = page.getByTestId(id);
  await expect(async () => {
    await page.getByRole("group", { name: "Manual Entry sections" }).getByRole("button", { name: label, exact: true }).click();
    await expect(section).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return section;
};
/** Types into a box until the editor reacts (typing before hydration is lost). */
const typeUntil = async (box: Locator, value: string, reacted: Locator) => {
  await expect(async () => {
    await box.fill(value);
    await expect(reacted).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};

test("1. channel: edit an amount, Save & publish, History shows Manual edit, Restore brings the upload back", async ({ page }) => {
  const res = await page.request.post("/api/uploads/publish", {
    headers: { Origin: "http://localhost:3100" },
    multipart: { files: { name: CHANNEL_FILE, mimeType: XLSX_TYPE, buffer: channelBook() } },
  });
  expect(res.status()).toBe(200);

  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  await expect(channel.getByText("Channel cost · Electronic")).toBeVisible();
  await expect(channel.getByText("BDT · type amounts, add or remove rows, then Save & publish")).toBeVisible();
  await expect(channel.getByLabel("Channel 1", { exact: true })).toHaveValue("E2E TV One");
  const jul = channel.getByLabel("Channel 1 Jul'26", { exact: true });
  await expect(jul).toHaveValue("100000");
  await expect(channel.getByText("All saved")).toBeVisible();

  await typeUntil(jul, "250000", channel.getByText("Unsaved changes"));
  await channel.getByRole("button", { name: "Save & publish" }).click();
  await expect(channel.getByText("All saved")).toBeVisible();
  await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("250000");

  const rows = await historyRows(page);
  await expect(rows.first()).toContainText("Manual edit");
  await expect(rows.first()).toContainText("In use");
  const uploaded = rows.filter({ hasText: CHANNEL_FILE }).first();
  const accept = (d: Dialog) => d.accept();
  page.on("dialog", accept);
  await expect(async () => {
    await uploaded.getByRole("button", { name: "Restore" }).click();
    await expect(uploaded).toContainText("In use", { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  page.off("dialog", accept);

  await openManual(page);
  await expect(page.getByTestId("manual-channel").getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
});

test.describe("viewer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees the tab read-only with the note, and no Save, Add or Remove", async ({ page }) => {
    await openManual(page);
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const channel = page.getByTestId("manual-channel");
    await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toBeDisabled();
    await expect(channel.getByLabel("Channel 1", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save & publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add channel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  });
});
```

- [ ] **Step 8: Run it to see it fail.**

Run: `npx playwright test e2e/manual-entry.spec.ts`
Expected: FAIL (no Manual Entry tab yet).

- [ ] **Step 9: Write** `src/app/(modules)/data-entry/save-bar.tsx`:

```tsx
import { Button } from "@/components/ui/button";

/** The editor's bottom bar: the status, Discard changes and Save & publish (admin only). Errors show in red. */
export function SaveBar({ dirty, pending, error, onDiscard, onSave }: {
  dirty: boolean; pending: boolean; error: string | null; onDiscard: () => void; onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm text-gray-700" aria-live="polite">{dirty ? "Unsaved changes" : "All saved"}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!dirty || pending} onClick={onDiscard}>Discard changes</Button>
        <Button type="button" disabled={!dirty || pending} onClick={onSave}>{pending ? "Saving…" : "Save & publish"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Write** `src/app/(modules)/data-entry/channel-editor.tsx`:

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
  CHANNEL_TABS, addChannelRow, channelDraft, channelInput, isDirty, removeChannelRow, setChannelAmount, setChannelName,
} from "./manual-drafts";
import { SaveBar } from "./save-bar";

/**
 * Channel cost (design 3.1). All three sheets are one draft and one save; edits survive switching sheets.
 * Keyed by its version id: a save re-renders the page with the new version, which remounts this with what was stored.
 */
export function ChannelEditor({ versionId, fyStart, data, readOnly, sheet, onSheet }: {
  versionId: number | null; fyStart: number; data: ChannelData; readOnly: boolean; sheet: ChannelKey; onSheet: (k: ChannelKey) => void;
}) {
  const [initial] = useState(() => channelDraft(data));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const months = fyMonthLabels(fyStart);
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
        <div className="max-w-full overflow-x-auto">
          <SegmentedButtons label="Channel cost sheets" items={CHANNEL_TABS.map(({ key, label }) => ({ key, label }))} value={tab.key} onChange={onSheet} />
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
              {months.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
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
                {r.m.map((v, j) => (
                  <TableCell key={months[j]}>
                    <Input aria-label={`${tab.column} ${i + 1} ${months[j]}`} inputMode="decimal" value={v} disabled={readOnly} className="w-28 text-right tabular-nums"
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

- [ ] **Step 11: Write the shell** `src/app/(modules)/data-entry/manual-entry.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SegmentedButtons } from "@/components/data/segmented";
import type { ChannelKey } from "@/lib/manual/rules";
import { ChannelEditor } from "./channel-editor";
import type { ManualEntryData } from "./manual-drafts";

type View = "channel" | "fy" | "bills";
const VIEWS: { key: View; label: string }[] = [
  { key: "channel", label: "Channel cost" },
];

/**
 * Manual Entry (design 3). Every editor stays mounted (only hidden), so unsaved edits survive switching. A viewer sees the
 * same editors with the inputs off; the server refuses a viewer's save anyway.
 */
export function ManualEntry({ admin, data }: { admin: boolean; data: ManualEntryData }) {
  const [view, setView] = useState<View>("channel");
  const [sheet, setSheet] = useState<ChannelKey>("elec");
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
        <ChannelEditor key={`channel-${data.channel.versionId ?? "none"}`} {...data.channel} readOnly={!admin} sheet={sheet} onSheet={setSheet} />
      </section>
    </div>
  );
}
```

- [ ] **Step 12: Add the tab to the page.** In `src/app/(modules)/data-entry/page.tsx`, add the imports `import { loadManualEntry } from "./manual-data";` and `import { ManualEntry } from "./manual-entry";`. Then replace the `Tab`, `TABS` and `tabOf` definitions with:

```ts
type Tab = "upload" | "manual" | "history";

const TABS: { key: Tab; label: string; href: string }[] = [
  { key: "upload", label: "Upload Data", href: "/data-entry" },
  { key: "manual", label: "Manual Entry", href: "/data-entry?tab=manual" },
  { key: "history", label: "Upload History", href: "/data-entry?tab=history" },
];

const tabOf = (sp: Record<string, string | string[] | undefined>): Tab =>
  sp.tab === "history" ? "history" : sp.tab === "manual" ? "manual" : "upload";
```

Wrap the header's `<Suspense …><Tabs …/></Suspense>` in `<div className="max-w-full overflow-x-auto">…</div>`, so three tabs never push a phone page sideways. In `DataEntryContent`, after the `if (tab === "history") …` line, add:

```tsx
  if (tab === "manual") return <ManualEntry admin={admin} data={await loadManualEntry(store)} />;
```

In `src/components/shell/page-header.tsx`, change the actions box to `<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div>`.

- [ ] **Step 13: Run the browser tests, including the existing Data Entry phone checks.**

Run: `npx playwright test e2e/manual-entry.spec.ts e2e/phase2a-upload.spec.ts`
Expected: PASS: Manual Entry tests 1 and the viewer; phase2a (its phone tests prove the three tabs fit 375 px).

- [ ] **Step 14: Unit tests, types, lint, commit.**

Run: `npx vitest run "src/app/(modules)/data-entry"` then `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" src/components/shell/page-header.tsx e2e/manual-entry.spec.ts`

```bash
git add "src/app/(modules)/data-entry/manual-drafts.ts" "src/app/(modules)/data-entry/manual-drafts.test.ts" "src/app/(modules)/data-entry/manual-data.ts" "src/app/(modules)/data-entry/manual-data.test.ts" "src/app/(modules)/data-entry/manual-entry.tsx" "src/app/(modules)/data-entry/save-bar.tsx" "src/app/(modules)/data-entry/channel-editor.tsx" "src/app/(modules)/data-entry/page.tsx" src/components/shell/page-header.tsx e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
feat(manual-entry): Manual Entry tab with the Channel cost editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: FY media spend editor and Add brand

**Files:**
- Modify: `src/app/(modules)/data-entry/manual-drafts.ts`, `manual-entry.tsx`
- Create: `src/app/(modules)/data-entry/fy-editor.tsx`, `add-brand-dialog.tsx`
- Test: `src/app/(modules)/data-entry/manual-drafts.test.ts`, `e2e/manual-entry.spec.ts`

**Interfaces:**
- Consumes: `saveFyAction` (Task 3); `FY_MEDIA`, `BAD_AMOUNT`, `fyMonthLabels`, `fyName` (Task 1); `readAmount`, `amountText`, `isDirty`, `ManualBusiness`, `SaveBar` (Task 4); `normName`.
- Produces (added to `manual-drafts.ts`):
```ts
export type FyDraftRow = { biz: string; b: string; med: string; m: string[]; py: string };
export type NewBrand = { name: string; businessSlug: string };
export type FyDraft = { rows: FyDraftRow[]; newBrands: NewBrand[] };
export type FyBrand = { biz: string; b: string };
export type BrandToAdd = { name: string; businessSlug: string; businessName: string; isNew: boolean };
export const NEW_BRAND: "__new__";
export const fyBrandKey: (x: FyBrand) => string;
export function fyDraft(rows: FyRow[]): FyDraft;
export function fyBrandGroups(d: FyDraft): { biz: string; brands: FyBrand[] }[];
export function fyTable(d: FyDraft, brand: FyBrand): { med: string; m: string[]; py: string }[];
export function setFyAmount(d: FyDraft, brand: FyBrand, med: string, col: number | "py", text: string): FyDraft;
export function addFyBrand(d: FyDraft, add: BrandToAdd): FyDraft;
export function fyInput(d: FyDraft): { ok: true; rows: FyRow[]; newBrands: NewBrand[] } | { ok: false; error: string };
export function brandChoices(d: FyDraft, business: ManualBusiness): string[];
export function brandToAdd(d: FyDraft, businesses: ManualBusiness[], pick: { businessSlug: string; brand: string; newName: string }):
  { ok: true; brand: BrandToAdd } | { ok: false; error: string };
```
Components:
```ts
export function FyEditor(props: { versionId: number | null; fyStart: number; rows: FyRow[]; businesses: ManualBusiness[];
  readOnly: boolean; brand: string | null; onBrand: (key: string) => void }): JSX.Element;
export function AddBrandDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; draft: FyDraft;
  businesses: ManualBusiness[]; onAdd: (b: BrandToAdd) => void }): JSX.Element;
```
Accessible names: "FY brand" (brand select), "+ Add brand", "<Media> <Mon'YY>" and "<Media> Last FY" boxes. In the dialog: "Business", "Brand", "New brand name", and the "Add" and "Cancel" buttons.

- [ ] **Step 1: Write the failing pure tests.** Append to `manual-drafts.test.ts` (and add the new names to its import from `./manual-drafts`):

```ts
describe("FY draft", () => {
  const fyRows = [
    { biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.5), py: 2 },
    { biz: "Hygiene", b: "Septex", med: "Digital", m: months(0), py: 0.5 },
    { biz: "Toiletries", b: "Savlon Soap", med: "Radio", m: months(0.1), py: 0 },
    { biz: "Toiletries", b: "Meril", med: "OOH", m: months(0.2), py: 0 },
  ];
  const savlon = { biz: "Toiletries", b: "Savlon Soap" };
  const businesses = [{ slug: "hygiene", name: "Hygiene", brands: ["Septex", "Neem"] }, { slug: "toiletries", name: "Toiletries", brands: ["Savlon Soap"] }];

  it("groups the brands by business in the order they first appear", () => {
    expect(fyBrandGroups(fyDraft(fyRows))).toEqual([
      { biz: "Toiletries", brands: [savlon, { biz: "Toiletries", b: "Meril" }] },
      { biz: "Hygiene", brands: [{ biz: "Hygiene", b: "Septex" }] },
    ]);
  });
  it("shows TV, Digital, Print and OOH for a brand (blank when missing), then any other medium it has", () => {
    expect(fyTable(fyDraft(fyRows), savlon).map((r) => [r.med, r.m[0], r.py])).toEqual([
      ["TV", "1.5", "2"], ["Digital", "", ""], ["Print", "", ""], ["OOH", "", ""], ["Radio", "0.1", ""],
    ]);
  });
  it("types into an existing row, or makes the row for a missing medium", () => {
    let d = setFyAmount(fyDraft(fyRows), savlon, "TV", 0, "3");
    d = setFyAmount(d, savlon, "Print", "py", "4");
    expect(fyTable(d, savlon).find((r) => r.med === "TV")?.m[0]).toBe("3");
    expect(d.rows.at(-1)).toEqual({ biz: "Toiletries", b: "Savlon Soap", med: "Print", m: Array.from({ length: 12 }, () => ""), py: "4" });
  });
  it("adds a brand with its four media rows, and remembers only a new name for the list", () => {
    const d = addFyBrand(fyDraft(fyRows), { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: true });
    expect(d.rows.slice(-4).map((r) => [r.biz, r.b, r.med])).toEqual([["Hygiene", "Neem", "TV"], ["Hygiene", "Neem", "Digital"], ["Hygiene", "Neem", "Print"], ["Hygiene", "Neem", "OOH"]]);
    expect(d.newBrands).toEqual([{ name: "Neem", businessSlug: "hygiene" }]);
    expect(addFyBrand(fyDraft(fyRows), { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false }).newBrands).toEqual([]);
  });
  it("sends blank as 0 and refuses a box that is not a number", () => {
    const out = fyInput(fyDraft(fyRows));
    expect(out.ok && out.rows[0]).toEqual({ biz: "Toiletries", b: "Savlon Soap", med: "TV", m: months(1.5), py: 2 });
    expect(fyInput(setFyAmount(fyDraft(fyRows), savlon, "TV", 3, "x"))).toEqual({ ok: false, error: BAD_AMOUNT });
  });
  it("offers a business's list brands that are not in the FY data yet", () => {
    expect(brandChoices(fyDraft(fyRows), businesses[0])).toEqual(["Neem"]);
  });
  it("decides the brand to add: the list's spelling when it is on the list, a new name otherwise", () => {
    const d = fyDraft(fyRows);
    expect(brandToAdd(d, businesses, { businessSlug: "", brand: "", newName: "" })).toEqual({ ok: false, error: "Pick the business." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: "  " })).toEqual({ ok: false, error: "Pick a brand or type a new name." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: "septex" })).toEqual({ ok: false, error: "septex is already in the FY data." });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: "Neem", newName: "" }))
      .toEqual({ ok: true, brand: { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false } });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: " NEEM " }))
      .toEqual({ ok: true, brand: { name: "Neem", businessSlug: "hygiene", businessName: "Hygiene", isNew: false } });
    expect(brandToAdd(d, businesses, { businessSlug: "hygiene", brand: NEW_BRAND, newName: " Lizol  Pro " }))
      .toEqual({ ok: true, brand: { name: "Lizol Pro", businessSlug: "hygiene", businessName: "Hygiene", isNew: true } });
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`. Expected: FAIL (FY functions missing).

- [ ] **Step 3: Add the FY functions** to `manual-drafts.ts`. Add `import { normName } from "@/lib/names-normal";` and `FY_MEDIA` to the rules import, then append:

```ts
// ---- FY media spend -------------------------------------------------------------------------------------------

export type FyDraftRow = { biz: string; b: string; med: string; m: string[]; py: string };
export type NewBrand = { name: string; businessSlug: string };
/** rows: every FY row (other media kept as they are); newBrands: names added in this editor, for the list. */
export type FyDraft = { rows: FyDraftRow[]; newBrands: NewBrand[] };
export type FyBrand = { biz: string; b: string };
export type BrandToAdd = { name: string; businessSlug: string; businessName: string; isNew: boolean };
/** The "New brand…" option of the Add brand dialog's Brand select. */
export const NEW_BRAND = "__new__";

export const fyBrandKey = (x: FyBrand): string => JSON.stringify([x.biz, x.b]);
const isBrand = (r: FyDraftRow, x: FyBrand) => r.biz === x.biz && r.b === x.b;
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

export const fyDraft = (rows: FyRow[]): FyDraft => ({
  rows: rows.map((r) => ({ biz: r.biz, b: r.b, med: r.med, m: Array.from({ length: 12 }, (_, j) => amountText(r.m[j] ?? 0)), py: amountText(r.py) })),
  newBrands: [],
});

/** The brand select: brands by business, in the order they first appear in the data. */
export function fyBrandGroups(d: FyDraft): { biz: string; brands: FyBrand[] }[] {
  const groups: { biz: string; brands: FyBrand[] }[] = [];
  const seen = new Set<string>();
  for (const r of d.rows) {
    const key = fyBrandKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    let g = groups.find((x) => x.biz === r.biz);
    if (!g) {
      g = { biz: r.biz, brands: [] };
      groups.push(g);
    }
    g.brands.push({ biz: r.biz, b: r.b });
  }
  return groups;
}

/** One brand's table: TV, Digital, Print, OOH (blank when the brand has no such row), then any other medium it has. */
export function fyTable(d: FyDraft, brand: FyBrand): { med: string; m: string[]; py: string }[] {
  const own = d.rows.filter((r) => isBrand(r, brand));
  const fixed = FY_MEDIA.map((med) => own.find((r) => r.med === med) ?? { med, m: blank12(), py: "" });
  const others = own.filter((r) => !(FY_MEDIA as readonly string[]).includes(r.med));
  return [...fixed, ...others].map(({ med, m, py }) => ({ med, m, py }));
}

/** Types one box (a month 0..11, or "py" for Last FY), making the brand's row for that medium when it has none. */
export function setFyAmount(d: FyDraft, brand: FyBrand, med: string, col: number | "py", text: string): FyDraft {
  const at = d.rows.findIndex((r) => isBrand(r, brand) && r.med === med);
  const base = at >= 0 ? d.rows[at] : { biz: brand.biz, b: brand.b, med, m: blank12(), py: "" };
  const next = col === "py" ? { ...base, py: text } : { ...base, m: base.m.map((v, j) => (j === col ? text : v)) };
  return { ...d, rows: at >= 0 ? d.rows.map((r, j) => (j === at ? next : r)) : [...d.rows, next] };
}

export function addFyBrand(d: FyDraft, add: BrandToAdd): FyDraft {
  const rows = FY_MEDIA.map((med) => ({ biz: add.businessName, b: add.name, med, m: blank12(), py: "" }));
  return { rows: [...d.rows, ...rows], newBrands: add.isNew ? [...d.newBrands, { name: add.name, businessSlug: add.businessSlug }] : d.newBrands };
}

/** The draft as saveFyAction takes it (blank is 0), or the first problem. The server drops all-0 rows. */
export function fyInput(d: FyDraft): { ok: true; rows: FyRow[]; newBrands: NewBrand[] } | { ok: false; error: string } {
  const rows: FyRow[] = [];
  for (const r of d.rows) {
    const read = [...r.m, r.py].map(readAmount);
    const nums: number[] = [];
    for (const a of read) {
      if (!a.ok) return { ok: false, error: BAD_AMOUNT };
      nums.push(a.value ?? 0);
    }
    rows.push({ biz: r.biz, b: r.b, med: r.med, m: nums.slice(0, 12), py: nums[12] });
  }
  return { ok: true, rows, newBrands: d.newBrands };
}

/** A business's brands on the list that are not in the FY data yet. */
export function brandChoices(d: FyDraft, business: ManualBusiness): string[] {
  const inData = new Set(d.rows.map((r) => normName(r.b)));
  return business.brands.filter((n) => !inData.has(normName(n)));
}

/** The Add brand dialog's answer, or what to show in red. A typed name on the list takes the list's spelling. */
export function brandToAdd(d: FyDraft, businesses: ManualBusiness[], pick: { businessSlug: string; brand: string; newName: string }):
  { ok: true; brand: BrandToAdd } | { ok: false; error: string } {
  const business = businesses.find((b) => b.slug === pick.businessSlug);
  if (!business) return { ok: false, error: "Pick the business." };
  const typed = tidy(pick.brand === NEW_BRAND ? pick.newName : pick.brand);
  if (!typed) return { ok: false, error: "Pick a brand or type a new name." };
  if (d.rows.some((r) => normName(r.b) === normName(typed))) return { ok: false, error: `${typed} is already in the FY data.` };
  const onList = businesses.flatMap((b) => b.brands).find((n) => normName(n) === normName(typed));
  return { ok: true, brand: { name: onList ?? typed, businessSlug: business.slug, businessName: business.name, isNew: !onList } };
}
```

- [ ] **Step 4: Run the pure tests to see them pass.** Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`. Expected: PASS.

- [ ] **Step 5: Add the failing browser test.** In `e2e/manual-entry.spec.ts`, add after test 1:

```ts
const FY_BIZ = "E2E Manual Biz";
const FY_BRAND = "E2E Manual Brand";

/** Adds the business on Businesses & Brands unless it is already there. */
const ensureBusiness = async (page: Page, name: string) => {
  await page.goto("/businesses");
  await expect(page.getByRole("heading", { name: "Businesses & Brands" })).toBeVisible();
  if (await page.getByRole("link", { name, exact: true }).count()) return;
  await page.getByRole("button", { name: "Add business" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business name").fill(name);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
};

test("2. FY: add a brand with a new name, Save & publish, and it is on Businesses & Brands", async ({ page }) => {
  await ensureBusiness(page, FY_BIZ);
  await openManual(page);
  const fy = await showView(page, "FY media spend", "manual-fy");
  await fy.getByRole("button", { name: "+ Add brand" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business", { exact: true }).selectOption({ label: FY_BIZ });
  await dialog.getByLabel("Brand", { exact: true }).selectOption({ label: "New brand…" });
  await dialog.getByLabel("New brand name").fill(FY_BRAND);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(fy.getByText(`FY media spend · ${FY_BRAND}`)).toBeVisible();
  await expect(fy.getByText(new RegExp(`^BDT Mn · ${FY_BIZ} · FY \\d{4}-\\d{2} months Jul to Jun, plus the last FY total$`))).toBeVisible();
  await expect(fy.getByText("Unsaved changes")).toBeVisible();
  await fy.getByLabel(/^TV Jul'\d\d$/).fill("1.5");
  await fy.getByRole("button", { name: "Save & publish" }).click();
  await expect(fy.getByText("All saved")).toBeVisible();
  await expect(fy.getByLabel("FY brand").locator("option:checked")).toHaveText(FY_BRAND);

  await page.goto("/businesses");
  await page.getByRole("link", { name: FY_BIZ, exact: true }).click();
  await expect(page.getByTestId("brands-table")).toContainText(FY_BRAND);
});
```

And inside `test.describe("viewer", …)`, add:

```ts
  test("sees FY media spend with its boxes off and no Add brand", async ({ page }) => {
    await openManual(page);
    const fy = await showView(page, "FY media spend", "manual-fy");
    await expect(fy.getByRole("button", { name: "+ Add brand" })).toHaveCount(0);
    await expect(fy.getByLabel(/^TV Jul'\d\d$/)).toBeDisabled();
    await expect(fy.getByLabel("FY brand")).toBeEnabled();
  });
```

Run: `npx playwright test e2e/manual-entry.spec.ts`. Expected: FAIL (no FY media spend button).

- [ ] **Step 6: Write** `src/app/(modules)/data-entry/add-brand-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NEW_BRAND, brandChoices, brandToAdd, type BrandToAdd, type FyDraft, type ManualBusiness } from "./manual-drafts";

const SELECT = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm disabled:opacity-50";

/** "+ Add brand" (design 3.2): a business from the list, then one of its brands or a new name (added to the list on save). */
export function AddBrandDialog({ open, onOpenChange, draft, businesses, onAdd }: {
  open: boolean; onOpenChange: (open: boolean) => void; draft: FyDraft; businesses: ManualBusiness[]; onAdd: (b: BrandToAdd) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <AddBrandForm draft={draft} businesses={businesses} onAdd={onAdd} />}</DialogContent>
    </Dialog>
  );
}

function AddBrandForm({ draft, businesses, onAdd }: { draft: FyDraft; businesses: ManualBusiness[]; onAdd: (b: BrandToAdd) => void }) {
  const [pick, setPick] = useState({ businessSlug: "", brand: "", newName: "" });
  const [error, setError] = useState<string | null>(null);
  const business = businesses.find((b) => b.slug === pick.businessSlug);
  const add = () => {
    const r = brandToAdd(draft, businesses, pick);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onAdd(r.brand);
  };
  return (
    <>
      <DialogHeader><DialogTitle>Add brand</DialogTitle></DialogHeader>
      {businesses.length === 0 ? (
        <p className="text-sm text-gray-600">No businesses yet. Add one on <Link href="/businesses" className="text-primary underline underline-offset-2">Businesses & Brands</Link> first.</p>
      ) : (
        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5 font-medium">Business
            <select aria-label="Business" className={SELECT} value={pick.businessSlug}
              onChange={(e) => setPick({ businessSlug: e.target.value, brand: "", newName: "" })}>
              <option value="">Pick the business…</option>
              {businesses.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-medium">Brand
            <select aria-label="Brand" className={SELECT} value={pick.brand} disabled={!business}
              onChange={(e) => setPick((p) => ({ ...p, brand: e.target.value }))}>
              <option value="">Pick a brand…</option>
              {business && brandChoices(draft, business).map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={NEW_BRAND}>New brand…</option>
            </select>
          </label>
          {pick.brand === NEW_BRAND && (
            <label className="flex flex-col gap-1.5 font-medium">New brand name
              <Input aria-label="New brand name" value={pick.newName} maxLength={120} autoComplete="off"
                onChange={(e) => setPick((p) => ({ ...p, newName: e.target.value }))} />
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="button" onClick={add} disabled={businesses.length === 0}>Add</Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 7: Write** `src/app/(modules)/data-entry/fy-editor.tsx`:

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
  addFyBrand, fyBrandGroups, fyBrandKey, fyDraft, fyInput, fyTable, isDirty, setFyAmount, type ManualBusiness,
} from "./manual-drafts";
import { SaveBar } from "./save-bar";

const SELECT = "h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** FY media spend (design 3.2). Edits to several brands stay in one draft until Save & publish or Discard changes. */
export function FyEditor({ versionId, fyStart, rows, businesses, readOnly, brand, onBrand }: {
  versionId: number | null; fyStart: number; rows: FyRow[]; businesses: ManualBusiness[]; readOnly: boolean;
  brand: string | null; onBrand: (key: string) => void;
}) {
  const [initial] = useState(() => fyDraft(rows));
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = fyBrandGroups(draft);
  const selected = groups.flatMap((g) => g.brands).find((x) => fyBrandKey(x) === brand) ?? groups[0]?.brands[0] ?? null;
  const months = fyMonthLabels(fyStart);

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
                {months.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                <TableHead className="text-right">Last FY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fyTable(draft, selected).map((r) => (
                <TableRow key={r.med}>
                  <TableCell className="font-medium">{r.med}</TableCell>
                  {r.m.map((v, j) => (
                    <TableCell key={months[j]}>
                      <Input aria-label={`${r.med} ${months[j]}`} inputMode="decimal" value={v} disabled={readOnly} className="w-24 text-right tabular-nums"
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

- [ ] **Step 8: Add FY to the shell.** In `manual-entry.tsx`, add `import { FyEditor } from "./fy-editor";`. Add `{ key: "fy", label: "FY media spend" },` to `VIEWS` after the channel entry, add `const [fyBrand, setFyBrand] = useState<string | null>(null);` after the `sheet` state, and add after the channel section:

```tsx
      <section data-testid="manual-fy" hidden={view !== "fy"} className="min-w-0">
        <FyEditor key={`fy-${data.fy.versionId ?? "none"}`} {...data.fy} businesses={data.businesses} readOnly={!admin} brand={fyBrand} onBrand={setFyBrand} />
      </section>
```

- [ ] **Step 9: Run the tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry"` then `npx playwright test e2e/manual-entry.spec.ts`
Expected: PASS (tests 1, 2 and both viewer tests).

- [ ] **Step 10: Type-check, lint, commit.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" e2e/manual-entry.spec.ts`

```bash
git add "src/app/(modules)/data-entry/manual-drafts.ts" "src/app/(modules)/data-entry/manual-drafts.test.ts" "src/app/(modules)/data-entry/fy-editor.tsx" "src/app/(modules)/data-entry/add-brand-dialog.tsx" "src/app/(modules)/data-entry/manual-entry.tsx" e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
feat(manual-entry): FY media spend editor with Add brand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: OOH / billboard bills editor, bill dialog and delete confirm

**Files:**
- Modify: `src/app/(modules)/data-entry/manual-drafts.ts`, `manual-entry.tsx`
- Create: `src/app/(modules)/data-entry/billboard-editor.tsx`, `bill-dialog.tsx`
- Test: `src/app/(modules)/data-entry/manual-drafts.test.ts`, `e2e/manual-entry.spec.ts`

**Interfaces:**
- Consumes: `changeBillboardAction` (Task 3); `BillInput`, `VENDOR_REQUIRED`, `BAD_AMOUNT`, `dhakaDate` (Task 1); `readAmount`, `ManualBusiness` (Task 4); `formatTaka` from `@/lib/money`; `normName`.
- Produces (added to `manual-drafts.ts`):
```ts
export type BillForm = Record<"v" | "po" | "bill" | "b" | "billc" | "chq" | "loc" | "cm" | "poa" | "ba" | "diff" | "st" | "en" | "sb" | "pr" | "biz" | "status", string>;
export const NEW_BILL_STATUS: "Finance/Audit";
export const BILLS_SHOWN: 40;
export function billForm(r: BillboardRow): BillForm;
export function newBillForm(statuses: readonly string[], today: string): BillForm;
export function billInput(f: BillForm): { ok: true; bill: BillInput } | { ok: false; error: string };
export function billMatches(r: BillboardRow, query: string): boolean;
export function billsToShow(rows: BillboardRow[], query: string, showAll: boolean): { shown: BillboardRow[]; matching: number };
export function withCurrent(options: readonly string[], current: string): string[];
export const billsCaption: (n: number) => string;
```
Components:
```ts
export function BillboardEditor(props: { versionId: number | null; data: BillboardData; businesses: ManualBusiness[]; readOnly: boolean;
  query: string; onQuery: (q: string) => void }): JSX.Element;
export function BillDialogForm(props: { versionId: number | null; legend: string[]; businesses: ManualBusiness[];
  row: BillboardRow | null; onDone: () => void }): JSX.Element;
```
Accessible names: "Search bills", "+ Add bill", "Edit bill <bill no | SL n>", "Show all N"; the dialog fields by their design labels; "Delete bill", "Cancel", "Save & publish".

- [ ] **Step 1: Write the failing pure tests.** Append to `manual-drafts.test.ts` (and add the new names and `import type { BillboardRow } from "@/lib/ingest/readers/billboard";` plus `VENDOR_REQUIRED` to the imports):

```ts
describe("bills", () => {
  const row = (sl: number, over: Partial<BillboardRow> = {}): BillboardRow => ({
    sl0: sl, v: `Vendor ${sl}`, po: `PO-${sl}`, bill: `B-${sl}`, poa: 1000, ba: 800, diff: 200, st: "2026-07-01", en: null, sb: null, pr: null,
    stR: null, enR: "bad", biz: "Salt", bz: "Salt", b: "ACI Salt", billc: 123, chq: null, loc: "Gulshan", cm: "", show: "", status: "Payment Done", sl, ...over,
  });

  it("fills the Edit form from a bill, and a new bill with Finance/Audit and today's Submit Date", () => {
    expect(billForm(row(3))).toEqual({
      v: "Vendor 3", po: "PO-3", bill: "B-3", b: "ACI Salt", billc: "123", chq: "", loc: "Gulshan", cm: "", poa: "1000", ba: "800", diff: "200",
      st: "2026-07-01", en: "", sb: "", pr: "", biz: "Salt", status: "Payment Done",
    });
    expect(newBillForm(["Payment Done", "Finance/Audit"], "2026-11-19")).toMatchObject({ status: "Finance/Audit", sb: "2026-11-19", v: "", poa: "" });
    expect(newBillForm(["Paid", "Open"], "2026-11-19").status).toBe("Paid");
  });
  it("sends blank amounts as null (the server makes PO and Bill 0 and Bill Difference PO - Bill) and needs a vendor", () => {
    const f = { ...newBillForm(["Finance/Audit"], "2026-11-19"), v: "Vendor", poa: "1,000" };
    expect(billInput(f)).toEqual({ ok: true, bill: expect.objectContaining({ v: "Vendor", poa: 1000, ba: null, diff: null, sb: "2026-11-19" }) });
    expect(billInput({ ...f, v: "  " })).toEqual({ ok: false, error: VENDOR_REQUIRED });
    expect(billInput({ ...f, ba: "eight" })).toEqual({ ok: false, error: BAD_AMOUNT });
  });
  it("searches vendor, PO, bill no, brand and location, newest first, the first 40", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(i + 1));
    const all = billsToShow(rows, "", false);
    expect([all.shown.length, all.matching, all.shown[0].sl]).toEqual([40, 45, 45]);
    expect(billsToShow(rows, "", true).shown).toHaveLength(45);
    expect(billsToShow(rows, "po-7", false).shown.map((r) => r.sl)).toEqual([7]);
    expect(billMatches(row(1), "gulshan")).toBe(true);
    expect(billMatches(row(1), "aci salt")).toBe(true);
    expect(billMatches(row(1), "payment")).toBe(false);
  });
  it("keeps a bill's own status or business in its select when the list does not have it", () => {
    expect(withCurrent(["Payment Done"], "Unmarked")).toEqual(["Payment Done", "Unmarked"]);
    expect(withCurrent(["Salt", "Hygiene"], "salt")).toEqual(["Salt", "Hygiene"]);
    expect(withCurrent(["Salt"], "")).toEqual(["Salt"]);
  });
  it("counts the bills in the caption", () => {
    expect(billsCaption(1)).toBe("1 bill · add a bill or change a status. Each save publishes.");
    expect(billsCaption(169)).toBe("169 bills · add a bill or change a status. Each save publishes.");
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`. Expected: FAIL.

- [ ] **Step 3: Add the bill functions** to `manual-drafts.ts`. Add `VENDOR_REQUIRED` and `type BillInput` to the rules import, change the billboard import to `import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";`, add `import type { CellValue } from "@/lib/ingest/workbook";`, and append:

```ts
// ---- OOH / billboard bills ------------------------------------------------------------------------------------

export type BillForm = Record<"v" | "po" | "bill" | "b" | "billc" | "chq" | "loc" | "cm" | "poa" | "ba" | "diff" | "st" | "en" | "sb" | "pr" | "biz" | "status", string>;
export const NEW_BILL_STATUS = "Finance/Audit";
export const BILLS_SHOWN = 40;

const cellText = (v: CellValue): string => (v == null ? "" : String(v));

export const billForm = (r: BillboardRow): BillForm => ({
  v: r.v, po: r.po, bill: r.bill, b: r.b, billc: cellText(r.billc), chq: cellText(r.chq), loc: r.loc, cm: r.cm,
  poa: String(r.poa), ba: String(r.ba), diff: String(r.diff), st: r.st ?? "", en: r.en ?? "", sb: r.sb ?? "", pr: r.pr ?? "",
  biz: r.biz, status: r.status,
});

/** A new bill: Status Finance/Audit (else the legend's first) and today's date as the Submit Date. */
export const newBillForm = (statuses: readonly string[], today: string): BillForm => ({
  v: "", po: "", bill: "", b: "", billc: "", chq: "", loc: "", cm: "", poa: "", ba: "", diff: "", st: "", en: "", sb: today, pr: "", biz: "",
  status: statuses.includes(NEW_BILL_STATUS) ? NEW_BILL_STATUS : (statuses[0] ?? NEW_BILL_STATUS),
});

/** The form as changeBillboardAction takes a bill: blank amounts null, or the first problem. */
export function billInput(f: BillForm): { ok: true; bill: BillInput } | { ok: false; error: string } {
  if (!f.v.trim()) return { ok: false, error: VENDOR_REQUIRED };
  const poa = readAmount(f.poa);
  const ba = readAmount(f.ba);
  const diff = readAmount(f.diff);
  if (!poa.ok || !ba.ok || !diff.ok) return { ok: false, error: BAD_AMOUNT };
  return {
    ok: true,
    bill: {
      v: f.v, po: f.po, bill: f.bill, b: f.b, billc: f.billc, chq: f.chq, loc: f.loc, cm: f.cm,
      poa: poa.value, ba: ba.value, diff: diff.value, st: f.st, en: f.en, sb: f.sb, pr: f.pr, biz: f.biz, status: f.status,
    },
  };
}

/** Search: vendor, PO, bill no, brand or location contains the text, ignoring case and spaces. */
export const billMatches = (r: BillboardRow, query: string): boolean => {
  const q = normName(query);
  return !q || [r.v, r.po, r.bill, r.b, r.loc].some((s) => normName(s).includes(q));
};

/** The bills to list: matching the search, newest (highest SL) first, the first 40 unless Show all. */
export function billsToShow(rows: BillboardRow[], query: string, showAll: boolean): { shown: BillboardRow[]; matching: number } {
  const hits = rows.filter((r) => billMatches(r, query)).sort((a, b) => b.sl - a.sl);
  return { shown: showAll ? hits : hits.slice(0, BILLS_SHOWN), matching: hits.length };
}

/** A select's options plus the bill's own value when the list does not have it, so an edit never changes it silently. */
export const withCurrent = (options: readonly string[], current: string): string[] =>
  current.trim() && !options.some((o) => normName(o) === normName(current)) ? [...options, current] : [...options];

export const billsCaption = (n: number): string => `${n} ${n === 1 ? "bill" : "bills"} · add a bill or change a status. Each save publishes.`;
```

- [ ] **Step 4: Run the pure tests to see them pass.** Run: `npx vitest run "src/app/(modules)/data-entry/manual-drafts.test.ts"`. Expected: PASS.

- [ ] **Step 5: Add the failing browser tests.** In `e2e/manual-entry.spec.ts`, add after test 2:

```ts
test("3. bills: add, edit and delete a bill; delete asks first; a missing vendor shows in red", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  await expect(bills.getByText(/^\d+ bills? · add a bill or change a status\. Each save publishes\.$/)).toBeVisible();
  const dialog = page.getByRole("dialog");
  const row = bills.getByTestId("manual-bills-table").locator("tbody tr").filter({ hasText: "E2E-001" });
  const search = bills.getByLabel("Search bills");

  await bills.getByRole("button", { name: "+ Add bill" }).click();
  await expect(dialog.getByText("Add bill", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Status", { exact: true })).toHaveValue("Finance/Audit");
  await expect(dialog.getByLabel("Submit Date", { exact: true })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter the name of the media / vendor.");
  await dialog.getByLabel("Name of the Media / Vendor", { exact: true }).fill("E2E Vendor One");
  await dialog.getByLabel("Bill No", { exact: true }).fill("E2E-001");
  await dialog.getByLabel("PO Amount", { exact: true }).fill("1000");
  await dialog.getByLabel("Bill Amount", { exact: true }).fill("800");
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog).toHaveCount(0);
  await search.fill("E2E-001");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Finance/Audit");

  await row.getByRole("button", { name: "Edit bill E2E-001" }).click();
  await expect(dialog.getByText(/^Edit bill · SL \d+$/)).toBeVisible();
  await expect(dialog.getByLabel("Bill Difference (blank = PO − Bill)", { exact: true })).toHaveValue("200");
  await dialog.getByLabel("Status", { exact: true }).selectOption("Payment Done");
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("Payment Done");

  await row.getByRole("button", { name: "Edit bill E2E-001" }).click();
  page.once("dialog", (d) => d.dismiss());
  await dialog.getByRole("button", { name: "Delete bill" }).click();
  await expect(dialog).toBeVisible(); // said no: nothing deleted
  await expect(row).toHaveCount(1);
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Delete bill E2E-001? You can bring it back from Upload History.");
    return d.accept();
  });
  await dialog.getByRole("button", { name: "Delete bill" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);

  const history = await historyRows(page);
  await expect(history.first()).toContainText("Manual edit");
  await expect(history.first()).toContainText("Billboard billing");
});
```

And inside `test.describe("viewer", …)`:

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

Run: `npx playwright test e2e/manual-entry.spec.ts`. Expected: FAIL (no bills view).

- [ ] **Step 6: Write** `src/app/(modules)/data-entry/bill-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BillboardRow } from "@/lib/ingest/readers/billboard";
import { dhakaDate } from "@/lib/manual/rules";
import { changeBillboardAction } from "./actions";
import { billForm, billInput, newBillForm, withCurrent, type BillForm, type ManualBusiness } from "./manual-drafts";

const SELECT = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** Add bill / Edit bill · SL n (design 3.3). Each save publishes the whole bill list; errors show in red here. */
export function BillDialogForm({ versionId, legend, businesses, row, onDone }: {
  versionId: number | null; legend: string[]; businesses: ManualBusiness[]; row: BillboardRow | null; onDone: () => void;
}) {
  const [f, setF] = useState<BillForm>(() => (row ? billForm(row) : newBillForm(legend, dhakaDate(new Date()))));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof BillForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const send = (change: Record<string, unknown>) =>
    startTransition(async () => {
      const res = await changeBillboardAction({ baseVersionId: versionId, ...change });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.summary ?? "Saved and published.");
      onDone();
    });
  const save = () => {
    const built = billInput(f);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    send(row ? { op: "edit", sl: row.sl, bill: built.bill } : { op: "add", bill: built.bill });
  };
  const remove = () => {
    if (!row || !confirm(`Delete bill ${row.bill || `SL ${row.sl}`}? You can bring it back from Upload History.`)) return;
    setError(null);
    send({ op: "delete", sl: row.sl });
  };

  const field = (k: keyof BillForm, label: string, extra: ComponentProps<"input"> = {}) => (
    <label className="flex min-w-0 flex-col gap-1 font-medium">
      {label}
      <Input aria-label={label} value={f[k]} onChange={set(k)} disabled={pending} {...extra} />
    </label>
  );

  return (
    <>
      <DialogHeader><DialogTitle>{row ? `Edit bill · SL ${row.sl}` : "Add bill"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("v", "Name of the Media / Vendor", { required: true, maxLength: 500 })}
        {field("po", "Purchase Order", { maxLength: 500 })}
        {field("bill", "Bill No", { maxLength: 500 })}
        {field("poa", "PO Amount", { inputMode: "decimal" })}
        {field("ba", "Bill Amount", { inputMode: "decimal" })}
        {field("diff", "Bill Difference (blank = PO − Bill)", { inputMode: "decimal" })}
        {field("st", "Start Date", { type: "date" })}
        {field("en", "End Date", { type: "date" })}
        <label className="flex min-w-0 flex-col gap-1 font-medium">Business
          <select aria-label="Business" className={SELECT} value={f.biz} onChange={set("biz")} disabled={pending}>
            <option value="">Not set</option>
            {withCurrent(businesses.map((b) => b.name), row?.biz ?? "").map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {field("b", "Brand", { maxLength: 500 })}
        {field("sb", "Submit Date", { type: "date" })}
        {field("pr", "Payment Request Date", { type: "date" })}
        {field("billc", "Bill", { maxLength: 500 })}
        {field("chq", "Cheque", { maxLength: 500 })}
        {field("loc", "Location", { maxLength: 500 })}
        <label className="flex min-w-0 flex-col gap-1 font-medium">Status
          <select aria-label="Status" className={SELECT} value={f.status} onChange={set("status")} disabled={pending}>
            {withCurrent(legend, row?.status ?? "").map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-medium sm:col-span-2">Comments
          <Textarea aria-label="Comments" value={f.cm} onChange={set("cm")} maxLength={2000} disabled={pending} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter className="gap-2">
        {row && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={remove} disabled={pending}>Delete bill</Button>}
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save & publish"}</Button>
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 7: Write** `src/app/(modules)/data-entry/billboard-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import { formatTaka } from "@/lib/money";
import { BillDialogForm } from "./bill-dialog";
import { billsCaption, billsToShow, type ManualBusiness } from "./manual-drafts";

/** OOH / billboard bills (design 3.3). Keyed by version id: after a save it remounts with the stored list. */
export function BillboardEditor({ versionId, data, businesses, readOnly, query, onQuery }: {
  versionId: number | null; data: BillboardData; businesses: ManualBusiness[]; readOnly: boolean; query: string; onQuery: (q: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ row: BillboardRow | null } | null>(null);
  const { shown, matching } = billsToShow(data.rows, query, showAll);
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>OOH / billboard bills</CardTitle>
          <p className="text-sm text-gray-500">{billsCaption(data.rows.length)}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input aria-label="Search bills" placeholder="Vendor, PO, bill no, brand or location" value={query} className="w-full sm:w-72"
            onChange={(e) => onQuery(e.target.value)} />
          {!readOnly && <Button type="button" onClick={() => setEditing({ row: null })}>+ Add bill</Button>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <Table data-testid="manual-bills-table">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead><TableHead>Vendor</TableHead><TableHead>PO</TableHead><TableHead>Bill No</TableHead>
              <TableHead className="text-right">PO Amount</TableHead><TableHead className="text-right">Bill Amount</TableHead>
              <TableHead>Brand</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead>
              {!readOnly && <TableHead><span className="sr-only">Edit</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.sl}>
                <TableCell className="text-right tabular-nums">{r.sl}</TableCell>
                <TableCell className="font-medium">{r.v}</TableCell>
                <TableCell>{r.po}</TableCell>
                <TableCell>{r.bill}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTaka(r.poa)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTaka(r.ba)}</TableCell>
                <TableCell>{r.b}</TableCell>
                <TableCell>{r.loc}</TableCell>
                <TableCell>{r.status}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" aria-label={`Edit bill ${r.bill || `SL ${r.sl}`}`} onClick={() => setEditing({ row: r })}>Edit</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
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

- [ ] **Step 8: Add bills to the shell.** In `manual-entry.tsx`, add `import { BillboardEditor } from "./billboard-editor";`. Add `{ key: "bills", label: "OOH / billboard bills" },` to `VIEWS` after FY, add `const [billQuery, setBillQuery] = useState("");`, and add after the FY section:

```tsx
      <section data-testid="manual-bills" hidden={view !== "bills"} className="min-w-0">
        <BillboardEditor key={`bills-${data.billboard.versionId ?? "none"}`} {...data.billboard} businesses={data.businesses} readOnly={!admin}
          query={billQuery} onQuery={setBillQuery} />
      </section>
```

- [ ] **Step 9: Run the tests to see them pass.**

Run: `npx vitest run "src/app/(modules)/data-entry"` then `npx playwright test e2e/manual-entry.spec.ts`
Expected: PASS (tests 1 to 3 and the three viewer tests).

- [ ] **Step 10: Type-check, lint, commit.**

Run: `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry" e2e/manual-entry.spec.ts`

```bash
git add "src/app/(modules)/data-entry/manual-drafts.ts" "src/app/(modules)/data-entry/manual-drafts.test.ts" "src/app/(modules)/data-entry/billboard-editor.tsx" "src/app/(modules)/data-entry/bill-dialog.tsx" "src/app/(modules)/data-entry/manual-entry.tsx" e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
feat(manual-entry): OOH bills editor with add, edit and confirmed delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Phone layout and the full check

**Files:**
- Test: `e2e/manual-entry.spec.ts`
- Modify (only if a phone test fails): the editor whose box overflows, `src/app/(modules)/data-entry/*-editor.tsx` / `bill-dialog.tsx`

**Interfaces:**
- Consumes: the test ids and accessible names from Tasks 4–6.
- Produces: no new code seam; the phone guarantee "On a phone, the tables scroll inside their card and the page doesn't scroll sideways."

- [ ] **Step 1: Write the phone tests.** Append to `e2e/manual-entry.spec.ts`:

```ts
test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  const VIEWS: [string, string][] = [["Channel cost", "manual-channel"], ["FY media spend", "manual-fy"], ["OOH / billboard bills", "manual-bills"]];
  const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= 375);
  /** The table's own scroll box ends inside the screen. */
  const tableBox = (section: Locator) => section.locator('[data-slot="table-container"]').first();

  test("each editor's table scrolls inside its card and the page does not scroll sideways", async ({ page }) => {
    await openManual(page);
    await page.waitForLoadState("networkidle");
    expect(await noSideScroll(page)).toBe(true);
    for (const [label, id] of VIEWS) {
      const section = await showView(page, label, id);
      expect(await noSideScroll(page), label).toBe(true);
      expect(await tableBox(section).evaluate((el) => el.getBoundingClientRect().right <= 375), label).toBe(true);
    }
    // The 12-month channel table is wider than a phone: it scrolls inside its own box.
    const channel = await showView(page, "Channel cost", "manual-channel");
    expect(await tableBox(channel).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test("the bill dialog fits the screen", async ({ page }) => {
    await openManual(page);
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    await bills.getByRole("button", { name: "+ Add bill" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
  });

  test.describe("viewer on a phone", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("sees the note and the editors without side scroll", async ({ page }) => {
      await openManual(page);
      await expect(page.getByText(VIEWER_NOTE)).toBeVisible();
      for (const [label, id] of VIEWS) {
        await showView(page, label, id);
        expect(await noSideScroll(page), label).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 2: Run them.** Run: `npx playwright test e2e/manual-entry.spec.ts`. Expected: PASS. If a check fails, the overflowing box lacks `min-w-0`/`max-w-full` or an `overflow-x-auto` wrapper. Fix it in that component the same way Task 4 did (wrap the row of controls in `max-w-full overflow-x-auto`, give the flex child `min-w-0`), re-run, and include the file in the commit.

- [ ] **Step 3: Run the whole suite and the build.**

Run: `npx vitest run` then `npx tsc --noEmit` then `npx eslint e2e src` then `npx playwright test` then `npm run build`
Expected: all green. The every-action guard lists the three new actions, the phase 2A/2B/2C specs pass unchanged, and the build compiles the new client components.

- [ ] **Step 4: Spec check (self-review).** Confirm each design point has a passing test:
  - 2.1, the tab and the viewer note: viewer tests.
  - 2.2, the same datasets, source manual, "Manual edit" and Restore: test 1, the actions test and the history-table test.
  - 2.3, starting empty: `loadManualEntry` with an empty store, plus the bills test.
  - 2.5, the three fixes: test 3 for the confirm, `saveFy` and `changeBillboard` for the list-only businesses, and the stale tests.
  - 3.1 to 3.3, the save rules: `rules.test.ts`.
  - 5, phone layout: the phone tests.

- [ ] **Step 5: Commit.**

```bash
git add e2e/manual-entry.spec.ts
git commit -F - <<'EOF'
test(manual-entry): phone layout for the editors and the bill dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

(Add any component fixed in Step 2 to the `git add`, with its quoted path.)

---

## Decisions after the final review (22 Nov 2026)

- **Bill Difference on edit.** The Edit dialog leaves Bill Difference blank when the stored value equals PO minus Bill, so changing an amount recomputes it. A stored value that differs from PO minus Bill is a real override and stays until the admin clears the box. His real file (169 bills) has no such override. PO, Bill and the difference are rounded to 2 decimals. A status-only edit keeps the bill's unreadable date text.
- **FY save and businesses.** A FY save files every brand that is on the Businesses & Brands list under that brand's business on the list, including rows the admin did not touch. This is kept on purpose: the list is the source of truth for which business a brand belongs to. The Phase 3 FY pages should read the stored `biz` of each row.
- **Known minors left for later:** a crafted admin FY payload can name a brand not on the list; a lock timeout shows the "data changed" message; a brand with both Press and Print rows shows only one Print row; a bill's business that differs only in case shows "Not set"; very long uploaded text blocks a save with a general message; the bills table's Edit column needs a sideways scroll on desktop.

