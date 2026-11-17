# Phase 2 Part B: The Other Six Readers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Media Mind reads, previews and publishes all 8 of the client's usual Excel files. It also streams backups, and it refuses to restore a backup from a newer app version.

**Architecture:**
- Six more readers go into `src/lib/ingest/readers/`. Each is a line-by-line port of the client's own reader in `template.html`, keeps his output shape, and is tested against his built-in data.
- A small brand module works out a Digital file's business. The Part A service and routes gain a business override, which works the same way as the type override.
- The workbook adapter gains an opt-in fill-colour read for Billboard billing.
- Backups stream from a temp file. Restore compares migration stamps.

**Tech Stack:** Next.js 16, React 19, TypeScript, SheetJS `xlsx` 0.20.3, Drizzle + libSQL (SQLite), Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-16-phase2b-readers-design.md` (approved 16 Nov 2026). **Builds on:** Part A (`docs/spine/plans/2026-11-16-phase2a-uploads.md`, including its "Amendment to Task 7"), merged as 4373d32. **Branch:** `feat/phase2b-readers`.

## Global Constraints

- App folder: `aci-media-dashboard/`. Run every command from there. Next.js 16 has breaking changes, so read `node_modules/next/dist/docs/` before touching routes or config.
- **His source:** `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/template.html`.
  - Helpers: `xstr`, `xnum`, `round` (lines ~506–515); `sum` (line 147: `sum=(a,f)=>a.reduce((t,x)=>t+(f(x)||0),0)`, which treats a falsy value as 0); `f2` (line 148); `FYM` (line 139); `ML` (line 162); `MONK` (line ~511).
  - Readers: `dNorm` 587, `parseDigital` 588–606, `parseFY` 607–617, `parseChannel` 618–625, `bMonth`/`BBIZ`/`BMG` 626–628, `parseBilling` 629–640, `BBLEG_DEFAULT` 641, `parseBillboard` 642–656, `BRANDLIST`/`BALIAS`/`fullB` 658–664, `normLoc` 1238, and the reading part of `masterRead` 1243–1256 (up to `if(!rows.length)throw`).
- **Answer keys:** `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/data/`: `dig3.json`, `digraw.json`, `channel.json`, `data.json` (key `fy`), `billing.json`, `billraw.json`, `billboard.json`, `sites.json`.
  - Real files are in `Asset/xlsx/`.
  - Both folders are gitignored and must never be committed.
  - Tests use `describe.skipIf(!hasClientFiles)` from `src/lib/ingest/test-workbooks.ts`. That module also provides `makeXlsx`, `clientFile`, `clientFiles` and `answerKey<T>(name)`.
- **Fidelity:** keep his logic, rounding, break conditions and message texts. Change only typing, the `ReadError`/`ReadResult` plumbing, and his curly quotes to straight quotes.
  - If a real file doesn't equal his data, find the first difference and fix the port or the adapter, never the answer key.
  - If his data was truly made another way, STOP and report the exact difference.
- **Brand names** stay exactly as his readers produce them. Full official names are applied by pages in Phase 3.
- **Dataset keys:** `digital:<Toiletries|Hygiene|Salt>`, `channel`, `fy`, `billing`, `billboard`, `ooh-sites`. Labels follow the spec table:
  - "Digital, Hygiene, Jul'26 to Oct'26"
  - "Channel Cost, Jul'26 to Oct'26"
  - "FY spend, FY 2026-27"
  - "Billing master, 2,956 lines"
  - "Billboard billing, 169 bills"
  - "OOH master sheet, 40 sites"
- **Units stay as his readers give them:** Digital in USD; Channel in whole BDT; FY in BDT Mn; Billing and Billboard in BDT.
- Copy: plain, short English. Commits are small Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `netlify.toml`, `.env*`, `Asset/`, `.spine/`, `test-results/` or `e2e/.auth/`.

**Security constraints (security-standard section 1; a violation is Critical):**
- **Authorisation:** every write is authorised on the server. The upload routes keep their Part A order: admin check, then Origin, then Content-Length, then a streaming cap, before any body is read. The backup route checks `isAdmin()` before creating anything.
- **Untrusted input is validated on the server.** The new `business-<i>` override must be one of `DIGITAL_BUSINESSES`; any other value is ignored, the same as `type-<i>`. Publishing re-reads the files and never trusts a preview.
- **No leaks:** no secrets in code, logs or commits. User-facing errors never contain stack traces, file paths or SQL.
- **Tests:** `createTestStore()` only. Never the real data dir, never Neon.

**Section 2 checklist per task:**
- **Task 6** (new form field): server-side allow-list for the field, with a test for a junk value and a mutation proof.
- **Task 9** (backup route change): the admin check still comes first, proven by a mutation test; the temp file is always deleted, including when the download is cancelled; the response still sends `no-store`, `nosniff` and `attachment`.

---

## File structure and seams

```
src/lib/ingest/
  brands.ts               NEW  DIGITAL_BUSINESSES, DigitalBusiness, isDigitalBusiness, businessOfBrand, resolveDigitalBusiness
  read-result.ts          MODIFY  + ReaderContext, NeedsBusinessError; Reader gains ctx param
  workbook.ts             MODIFY  openWorkbook(bytes, opts?: { styles?: boolean }); Cell gains fill
  readers/digital.ts      NEW  readDigital
  readers/channel.ts      NEW  readChannel
  readers/fy.ts           NEW  readFy
  readers/billing.ts      NEW  readBilling
  readers/billboard.ts    NEW  readBillboard
  readers/ooh-sites.ts    NEW  readOohSites
  readers/index.ts        MODIFY  READERS gains each new reader; + READER_NEEDS_STYLES
  detect.test.ts          MODIFY  synthetic full/partial tests for all 8 types
src/server/
  ingest.ts               MODIFY  UploadInput.chosenBusiness; FilePreview.business, businessSource, needsBusiness; styles reopen
  upload-form.ts          MODIFY  reads business-<i>
src/store/
  backup.ts               MODIFY  createBackupFile(store) -> { path, size, cleanup }
  restore.ts              MODIFY  refuses backups whose newest migration is newer than the app's
src/app/api/backup/route.ts       MODIFY  streams the file
src/app/(modules)/data-entry/     MODIFY  Business picker on Digital rows
e2e/phase2a-upload.spec.ts        MODIFY  new paths (or a new e2e/phase2b-upload.spec.ts)
```

**Fixed interfaces (the user owns these; implementations are the implementer's latitude):**

```ts
// src/lib/ingest/brands.ts
export const DIGITAL_BUSINESSES = ["Toiletries", "Hygiene", "Salt"] as const;
export type DigitalBusiness = (typeof DIGITAL_BUSINESSES)[number];
export const isDigitalBusiness = (v: unknown): v is DigitalBusiness;
/** His BRANDLIST business for a brand name (via his BALIAS / fullB), or null when unknown. "Food & Beverage" brands return "Food & Beverage". */
export function businessOfBrand(name: string): string | null;
export type BusinessSource = "brands" | "file name" | "admin";
export function resolveDigitalBusiness(input: { brands: string[]; fileName: string; chosen: DigitalBusiness | null }):
  { business: DigitalBusiness; source: BusinessSource } | null;

// src/lib/ingest/read-result.ts (changes)
export type ReaderContext = { fileName: string; business?: DigitalBusiness | null };
export type Reader = (wb: Workbook, ctx: ReaderContext) => ReadResult<unknown>;
/** A Digital file whose business can't be worked out: the admin must pick it. */
export class NeedsBusinessError extends Error {}
// ReadResult<T> gains an optional field: business?: { name: DigitalBusiness; source: BusinessSource }

// src/lib/ingest/workbook.ts (changes)
export type Cell = { v: CellValue; date: Date | null; fill: string | null }; // fill = "RRGGBB" upper case, only when opened with styles
export function openWorkbook(bytes: Uint8Array, opts?: { styles?: boolean }): Workbook;

// src/lib/ingest/readers/index.ts
export const READERS: Partial<Record<FileType, Reader>>;
export const READER_NEEDS_STYLES: ReadonlySet<FileType>; // = new Set(["billboard"])

// src/server/ingest.ts (changes)
export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null; chosenBusiness?: DigitalBusiness | null };
// FilePreview gains: business: DigitalBusiness | null; businessSource: BusinessSource | null; needsBusiness: boolean

// src/store/backup.ts (changes)
export async function createBackupFile(store: Store): Promise<{ path: string; size: number; cleanup: () => Promise<void> }>;
// createBackup(store): Promise<Buffer> stays (tests and the restore script use it), built on createBackupFile.

// src/store/restore.ts (changes)
export const NEWER_BACKUP = "This backup was made by a newer version of Media Mind. Update the app first, then restore.";
```

---

### Task 1: Brand list, Digital business, and the Digital reader

Tracker: p2-06.

**Files:**
- Create: `src/lib/ingest/brands.ts`, `src/lib/ingest/brands.test.ts`, `src/lib/ingest/readers/digital.ts`, `src/lib/ingest/readers/digital.test.ts`
- Modify: `src/lib/ingest/read-result.ts`, `src/lib/ingest/readers/index.ts`, `src/lib/ingest/readers/calendar.test.ts` (the READERS keys test)

**Interfaces:**
- Consumes: `Workbook` and `openWorkbook`; `xstr`, `round`, `monthLabel` and `pad2` (`cells.ts`); `ReadError` and `ReadResult` (`read-result.ts`); the test helpers.
- Produces: everything in `brands.ts` above; `ReaderContext`, `NeedsBusinessError`, and the widened `Reader` type; `readDigital(wb, ctx): ReadResult<DigitalData>`, where `DigitalData = { dig: DigitalAd[]; raw: Record<"Meta" | "YouTube" | "TikTok", { bz: string; m: string | null; r: (string | number | null)[] }[]> }`.

- [ ] **Step 1: Write the failing tests.**

`src/lib/ingest/brands.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { businessOfBrand, isDigitalBusiness, resolveDigitalBusiness } from "./brands";

describe("businessOfBrand (his BRANDLIST via BALIAS)", () => {
  it.each([
    ["Savlon Soap", "Toiletries"], ["SkinZen", "Toiletries"], ["Savlon Men", "Toiletries"], ["Neem", "Toiletries"], ["Leona", "Toiletries"],
    ["Freedom Sanitary Napkin", "Hygiene"], ["Twinkle Baby Diaper", "Hygiene"], ["super dry", "Hygiene"],
    ["ACI Pure Salt", "Salt"], ["Mustard Oil", "Food & Beverage"], ["Unknown Brand", null],
  ])("%s -> %s", (name, biz) => expect(businessOfBrand(name)).toBe(biz));
});

describe("resolveDigitalBusiness", () => {
  it("is sure from the brands when they all point to one business", () => {
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin", "Twinkle Baby Diaper", "Mystery"], fileName: "x.xlsx", chosen: null }))
      .toEqual({ business: "Hygiene", source: "brands" });
  });
  it("uses the file name when the brands are mixed or unknown", () => {
    expect(resolveDigitalBusiness({ brands: ["Savlon Soap", "ACI Pure Salt"], fileName: "Salt_Business.xlsx", chosen: null }))
      .toEqual({ business: "Salt", source: "file name" });
    expect(resolveDigitalBusiness({ brands: ["Mystery"], fileName: "Hygiene_Business.xlsx", chosen: null }))
      .toEqual({ business: "Hygiene", source: "file name" });
  });
  it("returns null when nothing settles it", () => {
    expect(resolveDigitalBusiness({ brands: ["Mystery"], fileName: "digital.xlsx", chosen: null })).toBeNull();
    expect(resolveDigitalBusiness({ brands: ["Savlon Soap", "ACI Pure Salt"], fileName: "Toiletries and Salt.xlsx", chosen: null })).toBeNull();
  });
  it("the admin's pick always wins", () => {
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin"], fileName: "x.xlsx", chosen: "Salt" })).toEqual({ business: "Salt", source: "admin" });
  });
  it("allows only the three Digital businesses", () => {
    expect(isDigitalBusiness("Hygiene")).toBe(true);
    expect(isDigitalBusiness("Food & Beverage")).toBe(false);
    expect(isDigitalBusiness("constructor")).toBe(false);
  });
});
```

`src/lib/ingest/readers/digital.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readDigital, type DigitalData } from "./digital";
import { NeedsBusinessError, ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const FILES = [
  ["Toiletries_Business_Digital_Media_Data_FY_26-27.xlsx", "Toiletries"],
  ["Hygiene_Business.xlsx", "Hygiene"],
  ["Salt_Business.xlsx", "Salt"],
] as const;

describe.skipIf(!hasClientFiles)("Digital: the 3 real files match his built-in data", () => {
  const dig3 = hasClientFiles ? answerKey<DigitalData["dig"]>("dig3.json") : [];
  const digraw = hasClientFiles ? answerKey<{ rows: DigitalData["raw"] }>("digraw.json") : { rows: { Meta: [], YouTube: [], TikTok: [] } };
  it.each(FILES)("%s is %s and equals his data", (file, biz) => {
    const r = readDigital(open(clientFile(file)), { fileName: "renamed.xlsx" }); // business must come from the brands, not the name
    expect(r.business).toEqual({ name: biz, source: "brands" });
    expect(r.datasetKey).toBe(`digital:${biz}`);
    expect(r.label).toMatch(new RegExp(`^Digital, ${biz}, \\w{3}'\\d{2} to \\w{3}'\\d{2}$`));
    expect(r.data.dig).toEqual(dig3.filter((x) => x.bz === biz));
    for (const p of ["Meta", "YouTube", "TikTok"] as const) expect(r.data.raw[p], p).toEqual(digraw.rows[p].filter((x) => x.bz === biz));
  });
});

describe("Digital read errors", () => {
  const sheet = (name: string, rows: unknown[][]) => ({ name, rows });
  const head = ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"];
  it("asks for the business when brands and file name don't settle it", () => {
    const b = makeXlsx([sheet("Meta", [head, [], ["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(() => readDigital(open(b), { fileName: "digital.xlsx" })).toThrow(NeedsBusinessError);
    expect(readDigital(open(b), { fileName: "digital.xlsx", business: "Salt" }).datasetKey).toBe("digital:Salt");
  });
  it("refuses a file with no ad rows", () => {
    const b = makeXlsx([sheet("Meta", [head]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(() => readDigital(open(b), { fileName: "Salt.xlsx", business: "Salt" })).toThrow(new ReadError("No ad rows were found in the Meta, YouTube or TikTok sheets."));
  });
});
```

In `calendar.test.ts`, change the expected READERS keys to `["atl", "calendar", "digital"]`.

- [ ] **Step 2: Run the tests to see them fail.** `npx vitest run src/lib/ingest` should FAIL with modules not found.

- [ ] **Step 3: Implement `read-result.ts` changes.** Add `ReaderContext`, the `ctx` parameter on `Reader`, and `NeedsBusinessError` (with `this.name = "NeedsBusinessError"`). Add the optional `business` on `ReadResult`. `readAtl` and `readCalendar` keep working unchanged, because a function with fewer parameters is assignable to `Reader`.

- [ ] **Step 4: Implement `brands.ts`.**
  - Port `BRANDLIST` and `BALIAS` (template lines 658–663) verbatim as typed constants.
  - Add `fullB` (line 663): look up `BALIAS[name.replace(/\s+/g," ").trim().toLowerCase()]`, or keep the trimmed name.
  - `businessOfBrand(name)`: look up `fullB(name)` (compared case-insensitively) in `BRANDLIST`, and return its business key or null.
  - `resolveDigitalBusiness`, in this order:
    1. `chosen`, with source "admin";
    2. otherwise, the set of non-null businesses from `brands`. If it has exactly one entry and that entry is in `DIGITAL_BUSINESSES`, use it with source "brands";
    3. otherwise, if the file name matches exactly one of /toiletries/i, /hygiene/i, /salt/i, use it with source "file name";
    4. otherwise null.

- [ ] **Step 5: Implement `readers/digital.ts`.** Port `dNorm` (587), `DCOLS`, `DAL`, `MONK` and `parseDigital` (588–606) line by line.
  - **Business:**
    - Collect the brands with `dNorm(xstr(col A))` from every non-empty Brand cell (skipping "total"/"grand total") on the Meta, YouTube and TikTok sheets, before parsing.
    - Call `resolveDigitalBusiness({ brands, fileName: ctx.fileName, chosen: ctx.business ?? null })`.
    - If it returns null, throw `new NeedsBusinessError("Pick the business.")`.
    - Then run the ported parse with `biz = business`.
  - **Result:**
    - `type: "digital"`, `datasetKey: `digital:${biz}``.
    - `months`: the sorted unique non-null `m` of `dig`.
    - `label: `Digital, ${biz}, ${monthLabel(first)} to ${monthLabel(last)}``, or `` `Digital, ${biz}` `` when there are no months.
    - `summary`: his summary string. Port `f2` and `ML`, or use `monthLabel` and `toLocaleString`, so the text matches his.
    - `rowCount: dig.length`, `data: { dig, raw }`, `warnings`: his `warn`.
    - `business: { name: biz, source }`.
  - Register it as `READERS.digital = readDigital`.

- [ ] **Step 6: Run the tests.** `npx vitest run src/lib/ingest` should PASS. Then `npx tsc --noEmit` should be clean.

- [ ] **Step 7: Commit.** `feat(ingest): Digital reader and business from brands, matches his data for 3 files`

---

### Task 2: Channel Cost and FY spend readers

Tracker: p2-07, p2-08.

**Files:**
- Create: `src/lib/ingest/readers/channel.ts`, `channel.test.ts`, `fy.ts`, `fy.test.ts`
- Modify: `readers/index.ts` and the READERS keys test

**Interfaces:**
- Consumes: Task 1's `Reader` type and the cell helpers.
- Produces: `readChannel(wb): ReadResult<ChannelData>`, where `ChannelData = Record<"elec" | "dig" | "press", { rows: { sl: unknown; n: string; m: number[] }[]; notes: unknown[][] }>`. Also `readFy(wb): ReadResult<FyRow[]>`, where `FyRow = { biz: string; b: string; med: string; m: number[]; py: number }`.

- [ ] **Step 1: Write the failing tests.**

```ts
// channel.test.ts
import { describe, expect, it } from "vitest";
import { readChannel, type ChannelData } from "./channel";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("Channel Cost: the real file", () => {
  it("equals his built-in data", () => {
    const r = readChannel(open(clientFile("Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx")));
    expect(r.data).toEqual(answerKey<ChannelData>("channel.json"));
    expect(r.datasetKey).toBe("channel");
    expect(r.label).toBe("Channel Cost, Jul'26 to Oct'26");
  });
});
describe("Channel Cost read errors", () => {
  it("refuses when none of the three sheets has rows", () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"], []] }, { name: "Digital", rows: [["SL", "Platform"]] }, { name: "Press & Radio", rows: [["SL", "Name"]] }]);
    expect(() => readChannel(open(b))).toThrow(new ReadError("None of the Electronic, Digital or Press & Radio sheets had rows."));
  });
  it("warns about a missing sheet and a row whose months don't add up to its total", () => {
    const months = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name", ...months], [], [1, "ATN Bangla", 100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 999]] }]);
    const r = readChannel(open(b));
    expect(r.warnings).toEqual(expect.arrayContaining(['No "Digital" sheet', 'No "Press & Radio" sheet']));
    expect(r.data.elec.notes).toEqual([["ATN Bangla", 300, 999]]);
  });
});
```

```ts
// fy.test.ts
import { describe, expect, it } from "vitest";
import { readFy, type FyRow } from "./fy";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("FY spend: the real file", () => {
  it("equals his built-in data and reads the visible Final Report sheet only", () => {
    const r = readFy(open(clientFile("CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx")));
    expect(r.data).toEqual(answerKey<{ fy: FyRow[] }>("data.json").fy);
    expect(r.datasetKey).toBe("fy");
    expect(r.label).toBe("FY spend, FY 2026-27");
  });
});
describe("FY spend read errors", () => {
  it("needs the header row", () => {
    expect(() => readFy(open(makeXlsx([{ name: "2026-27 Final Report", rows: [["title"], ["nothing"]] }])))).toThrow(/header row/);
  });
  it("warns when the business summary table is missing", () => {
    const row = ["Savlon Soap", "TV", 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 5];
    const r = readFy(open(makeXlsx([{ name: "2026-27 Final Report", rows: [["t"], ["Brand", "Media", "July'26"], row, ["Total"], ["Grand Total"]] }])));
    expect(r.warnings).toContain("Business summary table not found; used the standard business order");
  });
});
```

The READERS keys test should now expect `["atl", "calendar", "channel", "digital", "fy"]`.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/ingest/readers`

- [ ] **Step 3: Port `parseChannel` (618–625) into `channel.ts`** with the `ReadResult` plumbing:
  - `months`: for each column 3–14 in row 1 of the Electronic sheet, parse the label with `/^([a-z]{3})[a-z]*\s*['’]?\s*(\d{2,4})$/i` into `YYYY-MM`. Keep the months where any row of any sheet has a non-zero value in that column.
  - `label: `Channel Cost, ${monthLabel(first)} to ${monthLabel(last)}``.
  - `summary`: his summary text. `rowCount`: the total rows over the three sheets.

- [ ] **Step 4: Port `parseFY` (607–617) into `fy.ts`.**
  - **FY label:** read it from the chosen sheet's name with `/(\d{4})-(\d{2})/`, giving `FY 2026-27`. The label is `FY spend, ${fy}`, or "FY spend" if the name has no FY.
  - `months`: the FY months (`YYYY-MM` from the FY start year and `FYM`) where any row has a non-zero value.
  - `summary`: his summary text. `rowCount: rows.length`.

- [ ] **Step 5: Register both readers, run `npx vitest run src/lib/ingest` (should PASS) and `npx tsc --noEmit` (clean).**

- [ ] **Step 6: Commit.** `feat(ingest): Channel Cost and FY spend readers, match his data`

---

### Task 3: Billing master reader

Tracker: p2-10.

**Files:**
- Create: `src/lib/ingest/readers/billing.ts`, `billing.test.ts`
- Modify: `readers/index.ts` and the READERS keys test

**Interfaces:** produces `readBilling(wb): ReadResult<BillingData>`, where `BillingData = { bl: (string | number | null)[][]; br: { h: string[]; r: (string | number | null)[][] } }`.

- [ ] **Step 1: Write the failing tests** (`billing.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { readBilling, type BillingData } from "./billing";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const H = ["SL", "Media/ Vendor", "Business", "Brand", "Month", "Media ", "PO Number", "PO Amount (W/H VAT)", "PO Amount (incl. VAT)", "Invoice No", "Bill Amount", "Net Bill", "ASF", "Remittance Tax", "ADD Cost", "VAT", "Unbilled Amount", "Chalan", "Bill qty", "Cheque No", "Remarks", "Location"];

describe.skipIf(!hasClientFiles)("Billing master: the real file", () => {
  it("equals his built-in data (bl and br)", () => {
    const r = readBilling(open(clientFile("Dashboard_Media_Final_Fixed_26th_October_2026.xlsx")));
    expect(r.data.bl).toEqual(answerKey<BillingData["bl"]>("billing.json"));
    expect(r.data.br).toEqual(answerKey<BillingData["br"]>("billraw.json"));
    expect(r.label).toBe("Billing master, 2,956 lines");
  });
});
describe("Billing master rules", () => {
  it("needs the Master sheet", () => {
    expect(() => readBilling(open(makeXlsx([{ name: "Sheet1", rows: [H] }])))).toThrow(new ReadError('Sheet "Master" wasn\'t found in this file.'));
  });
  it("counts a bill split across lines once (same PO and invoice, same amounts)", () => {
    const line = (sl: number) => [sl, "Asiatic", "Toiletries", "Savlon Soap", "Oct'26", "TVC", "PO1", 100, 115, "INV1", 115, 100, 0, 0, 0, 15, 0, "", "", "", "", ""];
    const r = readBilling(open(makeXlsx([{ name: "Master", rows: [H, line(1), line(2)] }])));
    expect(r.data.bl.map((x) => x[9])).toEqual([58, 58]); // 115 shared between the two lines, his Math.round(115 * 0.5)
    expect(r.data.bl.map((x) => x[16])).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Port `bMonth`, `BBIZ`, `BMG` and `parseBilling` (626–640) line by line into `billing.ts`.**
  - `months`: the sorted unique non-null `bl[i][4]`.
  - `label: `Billing master, ${R.length.toLocaleString("en-US")} lines``.
  - `summary`: his. `rowCount: R.length`. `warnings`: his.
  - Cells with a date (`cl.date`) become `toISOString().slice(0,10)`, as his code does.

- [ ] **Step 4: Register it, then run `npx vitest run src/lib/ingest` (should PASS) and `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(ingest): Billing master reader with his split-bill rule, matches his data`

---

### Task 4: Fill colours in the adapter, and the Billboard billing reader

Tracker: p2-11.

**Files:**
- Modify: `src/lib/ingest/workbook.ts`, `workbook.test.ts`, `readers/index.ts` (+ `READER_NEEDS_STYLES`), the READERS keys test
- Create: `src/lib/ingest/readers/billboard.ts`, `billboard.test.ts`

**Interfaces:** produces `openWorkbook(bytes, { styles: true })`, `Cell.fill`, `READER_NEEDS_STYLES` and `readBillboard(wb): ReadResult<BillboardData>`, where `BillboardData = { legend: string[]; rows: BillboardRow[] }` (fields as in his `rows.push({...})`).

- [ ] **Step 1: Write the failing tests.**
  - **Workbook:** a sheet with a solid yellow fill on A1, written through SheetJS with `cellStyles`. `makeXlsx` can't write fills, so build the fixture with `XLSX.utils` plus `ws.A1.s = { patternType: "solid", fgColor: { rgb: "FFFF00" } }` and `XLSX.write(..., { cellStyles: true })`. If SheetJS CE cannot write fills, use the real Billboard file only and mark the synthetic test `it.skip` with a one-line reason.
    - `openWorkbook(bytes, { styles: true }).sheet(0)!.cell(1, 1).fill` should be `"FFFF00"`.
    - Without `styles`, it should be `null`.
  - **Billboard:**
```ts
import { describe, expect, it } from "vitest";
import { readBillboard, type BillboardData } from "./billboard";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

describe.skipIf(!hasClientFiles)("Billboard billing: the real file", () => {
  it("equals his built-in data, statuses read from the row colours", () => {
    const r = readBillboard(openWorkbook(new Uint8Array(clientFile("Billboard_Billing_Status_Updated_10th_Nov26.xlsx")), { styles: true }));
    expect(r.data).toEqual(answerKey<BillboardData>("billboard.json"));
    expect(r.label).toBe("Billboard billing, 169 bills");
  });
});
describe("Billboard billing read errors", () => {
  it("needs the header row", () => {
    expect(() => readBillboard(openWorkbook(new Uint8Array(makeXlsx([{ name: "S", rows: [["Billboard Billing Status"]] }])), { styles: true })))
      .toThrow(new ReadError('The header row ("SL · Name of the Media/ Vendor · …") wasn\'t found.'));
  });
});
```
  - The READERS keys test should expect `["atl", "billboard", "billing", "calendar", "channel", "digital", "fy"]`, and `READER_NEEDS_STYLES` should equal `new Set(["billboard"])`.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Extend `workbook.ts`.**
  - `openWorkbook(bytes, opts = {})` passes `cellStyles: !!opts.styles` to `XLSX.read`.
  - `toCell` sets `fill` only when styles are on, using his rule (template line ~529): the pattern type is set and not "none" and `fgColor.rgb` exists, then take `rgb.slice(-6).toUpperCase()`; otherwise null.
  - Every `Cell` gets a `fill`, and `EMPTY` gets `fill: null`.
  - Keep the Task 2 (Part A) tests green.

- [ ] **Step 4: Port `BBLEG_DEFAULT` and `parseBillboard` (641–656) into `billboard.ts`.**
  - This includes the legend from the coloured cells above the header, the nearest-colour fallback, the date parsing (`dt`) with its day-first rule, and the warnings.
  - `months: []`. `label: `Billboard billing, ${rows.length} bills``. `summary`: his. `rowCount: rows.length`.
  - Register it, and export `READER_NEEDS_STYLES = new Set<FileType>(["billboard"])`.

- [ ] **Step 5: Run `npx vitest run src/lib/ingest` (should PASS) and `npx tsc --noEmit`.**

- [ ] **Step 6: Commit.** `feat(ingest): fill colours in the adapter and the Billboard billing reader`

---

### Task 5: OOH master sheet reader

Tracker: p2-12.

**Files:**
- Create: `src/lib/ingest/readers/ooh-sites.ts`, `ooh-sites.test.ts`
- Modify: `readers/index.ts` and the READERS keys test

**Interfaces:** produces `readOohSites(wb): ReadResult<OohSiteRow[]>`, where `OohSiteRow = { sl: number | ""; location: string; brand: string; size: string; start: string; end: string; cost: number | ""; vendor: string; lat: number | ""; lng: number | ""; city?: string }`.

- [ ] **Step 1: Write the failing tests.**
```ts
import { describe, expect, it } from "vitest";
import { readOohSites } from "./ooh-sites";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const FIELDS = ["sl", "location", "brand", "size", "start", "end", "cost", "vendor", "lat", "lng"] as const;

describe.skipIf(!hasClientFiles)("OOH master sheet: the real file", () => {
  it("matches his sites on the sheet's own fields", () => {
    const r = readOohSites(open(clientFile("ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx")));
    const sites = Object.values(answerKey<Record<string, Record<string, unknown>>>("sites.json"));
    const pick = (o: Record<string, unknown>) => Object.fromEntries(FIELDS.map((k) => [k, o[k]]));
    expect(r.data.map(pick)).toEqual(sites.sort((a, b) => Number(a.sl) - Number(b.sl)).map(pick));
    expect(r.label).toBe("OOH master sheet, 40 sites");
  });
});
describe("OOH master sheet read errors and warnings", () => {
  const H = ["Sl. No", "OOH Location", "Present display/Brand", "Size", "Bill Board Period", null, "Present Amount (inc. VAT)", "Vendor", "Latitude", "Longitude"];
  it("needs a header with OOH Location and Latitude", () => {
    expect(() => readOohSites(open(makeXlsx([{ name: "S", rows: [["Sl. No", "Place"]] }])))).toThrow(new ReadError('Couldn\'t find the header row (it needs "OOH Location" and "Latitude").'));
  });
  it("warns about a missing pin, coordinates outside Bangladesh and no amount", () => {
    const r = readOohSites(open(makeXlsx([{ name: "Master File", rows: [H,
      [1, "Trishal, Mymensingh", "ACI Pure Salt", "W 10' x H 6'", null, null, 1000, "Sadaf Ad", null, null],
      [2, "Somewhere", "ACI Pure Salt", "W 10' x H 6'", null, null, null, "Sadaf Ad", 10, 10],
    ] }])));
    expect(r.warnings).toEqual(expect.arrayContaining([
      "Sl 1 Trishal, Mymensingh: no latitude/longitude, so no map pin",
      "Sl 2 Somewhere: coordinates are outside Bangladesh",
      "Sl 2 Somewhere: no amount",
    ]));
  });
});
```
The READERS keys test should now expect all 8 types: `["atl", "billboard", "billing", "calendar", "channel", "digital", "fy", "ooh-sites"]`.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Port the reading part of `masterRead` (1243–1256) into `ooh-sites.ts`.**
  - This covers the header search, the column mapping (including "period" taking two columns), `dt`, `num`, the row objects, the warnings, and "No billboard rows were found under the header." as a `ReadError`.
  - Leave out the merge plan with existing sites. That is Phase 4.
  - `months: []`. `label: `OOH master sheet, ${rows.length} sites``. `summary: `${rows.length} billboard rows read.``. `rowCount: rows.length`.

- [ ] **Step 4: Run `npx vitest run src/lib/ingest` (should PASS) and `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(ingest): OOH master sheet reader, matches his sites`

---

### Task 6: Business override and styles in the service and routes

Tracker: part of p2-06; p2-13.

**Files:**
- Modify: `src/server/ingest.ts`, `src/server/ingest.test.ts`, `src/server/upload-form.ts`, `src/app/api/uploads/upload-routes.test.ts`

**Interfaces:**
- Consumes: `READERS`, `READER_NEEDS_STYLES`, `NeedsBusinessError`, `isDigitalBusiness`, `DigitalBusiness`, `BusinessSource` and `openWorkbook(bytes, { styles })`.
- Produces: `UploadInput.chosenBusiness`; `FilePreview.business`, `FilePreview.businessSource` and `FilePreview.needsBusiness`; the form field `business-<i>`.

- [ ] **Step 1: Write the failing tests.** Add to `src/server/ingest.test.ts`:
```ts
import { DIGITAL_BUSINESSES } from "@/lib/ingest/brands";
const digitalBook = () => makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
  ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
  ...(p === "Meta" ? [["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
] })));

describe("Digital business in the service", () => {
  it("asks for the business when it can't be worked out", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ type: "digital", canPublish: false, needsBusiness: true, business: null, blockReason: "Pick the business.", errors: [] });
  });
  it("uses the admin's pick and publishes to that business only", async () => {
    const store = await createTestStore();
    const input = { ...file("digital.xlsx", digitalBook()), chosenBusiness: "Hygiene" as const };
    const [p] = await previewUploads(store, [input]);
    expect(p).toMatchObject({ canPublish: true, business: "Hygiene", businessSource: "admin", needsBusiness: false, datasetKey: "digital:Hygiene" });
    expect((await publishUploads(store, [input])).published[0].datasetKey).toBe("digital:Hygiene");
  });
  it("ignores a business value that isn't one of the three", async () => {
    const [p] = await previewUploads(await createTestStore(), [{ ...file("digital.xlsx", digitalBook()), chosenBusiness: "constructor" as never }]);
    expect(p.needsBusiness).toBe(true);
    expect(DIGITAL_BUSINESSES).not.toContain("constructor");
  });
  it("blocks two Digital files for the same business", async () => {
    const a = { ...file("a.xlsx", digitalBook()), chosenBusiness: "Salt" as const };
    const ps = await previewUploads(await createTestStore(), [a, { ...a, name: "b.xlsx" }]);
    expect(ps.map((x) => x.canPublish)).toEqual([false, false]);
  });
});
```
  - Also add `it.skipIf(!hasClientFiles)` tests:
    - The real Billboard file previews as Ready with label "Billboard billing, 169 bills" and no "Unmarked" warning. This proves the service reopened it with styles.
    - Each of the 6 real new-type files publishes, and `listHistory` shows its label.
  - **Route test:** form field `business-0=Salt` reaches the service, and `business-0=evil` is ignored.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.** In `ingest.ts`:
  - `UploadInput` gains `chosenBusiness?: DigitalBusiness | null`. `FilePreview` gains `business: DigitalBusiness | null`, `businessSource: BusinessSource | null` and `needsBusiness: boolean`, defaulting to null, null and false.
  - In `prepareFile`, after the type is settled:
    - if `READER_NEEDS_STYLES.has(type)`, reopen with `openWorkbook(input.bytes, { styles: true })` (same try/catch and message as the first open);
    - call `reader(wb, { fileName: preview.fileName, business: isDigitalBusiness(input.chosenBusiness) ? input.chosenBusiness : null })`;
    - catch `NeedsBusinessError`: set `needsBusiness = true` and return `block("Pick the business.", null)`;
    - on success, copy `result.business` into `business` and `businessSource`;
    - when the source is "file name", add the warning "Business taken from the file name.".
  - In `upload-form.ts`, read `business-<i>` and pass `chosenBusiness: isDigitalBusiness(b) ? b : null`.

- [ ] **Step 4: Mutation proof.** Remove the `isDigitalBusiness` check in `prepareFile`. The "ignores a business value" test should fail. Put the check back, and the test passes again.

- [ ] **Step 5: Run `npx vitest run src/server src/app/api/uploads src/lib/ingest` (should PASS) and `npx tsc --noEmit`.**

- [ ] **Step 6: Commit.** `feat(ingest): business override for Digital files and fill colours for Billboard in the upload service`

---

### Task 7: Business picker on the Data Entry page

Tracker: part of p2-03.

**Files:**
- Modify: `src/app/(modules)/data-entry/upload-box.tsx`, `logic.ts`, `logic.test.ts`

**Interfaces:**
- Consumes: `FilePreview.needsBusiness`, `business` and `businessSource`, and `DIGITAL_BUSINESSES` from `@/lib/ingest/brands` (pure, safe on the client).
- Produces: a `<select aria-label="Business for <file name>">` on Digital rows, with the empty option "Pick the business…" plus the three businesses. Also the chip "Needs a business" (amber).

- [ ] **Step 1: Write the failing tests in `logic.test.ts`.**
  - `uploadForm(files, types, businesses)` sets `business-<i>` only where a business is picked.
  - `rowStatus` returns `"needs-business"` when `preview.needsBusiness`.
  - `greyReason` shows "Pick the business." in grey, not red.
  - `canPublishAll` stays false while any row needs a business.

- [ ] **Step 2: Implement.**
  - Keep a `businesses: (DigitalBusiness | "")[]` state parallel to `files`, updated on add, remove and clear.
  - Show the Business select on rows whose `type === "digital"`. Pre-select `preview.business`.
  - When the select changes, preview all files again, the same way a type change does.
  - Add the `CHIP` entry `"needs-business": { label: "Needs a business", className: "bg-amber-100 text-amber-900" }`.
  - When `businessSource === "file name"`, the warning list already shows "Business taken from the file name.".

- [ ] **Step 3: Run `npx vitest run "src/app/(modules)/data-entry"` (should PASS), `npx tsc --noEmit`, and `npx eslint "src/app/(modules)/data-entry"`.**

- [ ] **Step 4: Commit.** `feat(data-entry): business picker for Digital files`

---

### Task 8: Detection tests for every type without client files

Closes Part A minors T3.

**Files:**
- Modify: `src/lib/ingest/detect.test.ts`, and `src/lib/ingest/detect.ts` only if a test exposes a real rule bug (say so in the commit).

- [ ] **Step 1: Add synthetic tests built with `makeXlsx`.**
  - For each of the 8 types, one workbook that fully matches (expect `{ status: "sure", type }`) and one that only partly matches, per the Part A rule table (expect `unsure` with that type in `candidates`).
  - One workbook that fully matches two types, for example a visible `Master` billing sheet plus visible Meta, YouTube and TikTok sheets. Expect `unsure` with both types in `candidates`, full matches first.
  - Make the demo-files test fail when `../demo-files` is missing, instead of passing silently. If that folder isn't meant to be required, move it under `describe.skipIf(!fs.existsSync(dir))`.
  - Tighten the billing rule so one cell can't satisfy two keywords: each keyword must match a different cell. Add the test "Business Brand" in one cell → not a full billing match.

- [ ] **Step 2: Run `npx vitest run src/lib/ingest/detect.test.ts` (should PASS; all 22 real files still sure).**

- [ ] **Step 3: Commit.** `test(ingest): detection tests for every type without client files`

---

### Task 9: Backups stream, and restore refuses newer backups

Tracker: p2-83.

**Files:**
- Modify: `src/store/backup.ts`, `src/store/backup.test.ts`, `src/store/restore.ts`, `src/app/api/backup/route.ts`
- Create: `src/app/api/backup/route.test.ts` (if none exists)

**Interfaces:**
- `createBackupFile(store)` returns `{ path, size, cleanup }`.
- `createBackup(store)` stays, built on `createBackupFile`.
- `restoreBackupFile` throws `NEWER_BACKUP` when the backup's newest applied migration is newer than the app's.

- [ ] **Step 1: Write the failing tests.**
  - **backup.test.ts:** `createBackupFile` gives a path to a real file that starts with `SQLite format 3\0`. After `cleanup()`, the file is gone. `createBackup` still returns the same bytes.
  - **route.test.ts** (mock cookies and the store as in `src/app/api/uploads/[fileId]/route.test.ts`):
    - a viewer gets 403, and no temp file is created (spy on `createBackupFile`);
    - the admin gets 200 with `res.body` a `ReadableStream`, headers `Content-Disposition` attachment, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`;
    - reading the body to the end gives the SQLite header, and afterwards the temp file no longer exists;
    - cancelling the body (`await res.body!.cancel()`) also deletes the temp file.
  - **restore:** build a backup with `createBackupFile`, then raise its newest `__drizzle_migrations.created_at` above the app's newest journal `when` (read `drizzle-store/meta/_journal.json`). `restoreBackupFile` must throw `NEWER_BACKUP` and leave the current store file untouched. A normal backup still restores.

- [ ] **Step 2: Implement.**
  - **backup.ts:** `createBackupFile` runs `VACUUM INTO` to a temp path in `os.tmpdir()` and stats the size. `cleanup` removes the file with `force: true`.
  - **route.ts:**
    1. Check `isAdmin()` first.
    2. Call `createBackupFile`.
    3. Wrap `fs.createReadStream(path)` in a web `ReadableStream`. Call `cleanup()` on end, on error and on cancel.
    4. Send `Content-Length: size`, plus the existing headers and `X-Content-Type-Options: nosniff`.
  - **restore.ts:** after the meta check, read `SELECT max(created_at) AS t FROM __drizzle_migrations` from the backup. If it is greater than the max `when` in the app's `drizzle-store/meta/_journal.json`, throw `new Error(NEWER_BACKUP)` before moving any file. A backup with no migrations table is still refused as "not a Media Mind backup".

- [ ] **Step 3: Mutation proof.** Move `isAdmin()` after `createBackupFile`. The viewer test should fail because a temp file was created. Put it back.

- [ ] **Step 4: Run `npx vitest run src/store src/app/api/backup` (should PASS) and `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(store): stream the backup download; refuse restoring a newer backup`

---

### Task 10: Browser test for the new types

Tracker: p2-90.

**Files:**
- Create: `e2e/phase2b-upload.spec.ts`
- Run it under the existing `chromium` project, signed in as the admin. Use the same Playwright webServer, temp store and test admin as Part A.

**Paths:**
1. **Digital from brands:** upload `Hygiene_Business.xlsx` under a neutral name (`page.setInputFiles` with `{ name: "digital.xlsx", mimeType, buffer }`). The row reads "Digital, Hygiene, …", is Ready, and its Business select shows Hygiene.
2. **Digital unclear:** upload a synthetic Digital workbook named `digital.xlsx`. The row shows "Needs a business". Pick Salt, and the row becomes Ready. Publish it, and Upload History shows "Digital, Salt".
3. **Every new type:**
   - upload the real Channel, FY, Billing, Billboard and OOH files together;
   - all 5 rows are Ready, with the labels "Channel Cost, Jul'26 to Oct'26", "FY spend, FY 2026-27", "Billing master, 2,956 lines", "Billboard billing, 169 bills" and "OOH master sheet, 40 sites";
   - publish, and each label is "In use" in Upload History.
4. **Phone (375 px):** path 1's row with its two selects fits with no sideways page scroll.

Real-file paths use `test.skip(!hasClientFiles, ...)`.

- [ ] **Step 1: Write the spec.** Stop any preview dev server, then run `npx playwright test e2e/phase2b-upload.spec.ts` until it is green.
- [ ] **Step 2: Run `npm run test:e2e`.** Report results honestly. `e2e/sample-data.spec.ts`, which uses Neon, is known to be flaky here, so say whether it passed.
- [ ] **Step 3: Commit.** `test(e2e): Phase 2 Part B upload paths`

---

## After the tasks (controller)

- Whole-branch final review on the most capable model. It needs a threat-model paragraph, because the branch changes the backup route and adds a form field on a public endpoint.
- Run `npm test`, `npx tsc --noEmit`, `npx eslint src e2e` and `npm run test:e2e`. Also run the dependency audit and a secrets scan of the diff.
- Tick the tracker: p2-06, p2-07, p2-08, p2-10, p2-11, p2-12, p2-83. Update p2-90's note.
- Finish: merge into `main` and push to `personal`. The push also carries the local docs commit 9f863f3. No PR.
- Then p2-16 is Sadril's: he tries an upload from start to end.
