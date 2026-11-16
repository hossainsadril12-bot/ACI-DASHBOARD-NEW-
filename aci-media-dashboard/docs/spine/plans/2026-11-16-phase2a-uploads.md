# Phase 2 Part A: Upload Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin drops any of the client's usual Excel files on a new Data Entry page. Media Mind checks the file, detects its type (all 8 types), reads ATL and Activity Calendar files, shows a preview, and publishes on confirm. Every version is kept in an append-only Upload History with restore and the original file.

**Architecture:**
- Pure reading logic lives in `src/lib/ingest/`: byte check, workbook adapter, detection and readers. It has no database and no Next.js imports.
- One service, `src/server/ingest.ts`, turns files into previews and publishes them through the Phase 1 store (`src/store/datasets.ts`).
- Thin server actions and one route handler sit in front of it, and a new `/data-entry` page shows it.
- Readers are faithful TypeScript ports of the client's own readers (`parseATLFile` and `parseCalendar` in `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/template.html`). They are checked against his built-in data, which is our answer key.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, shadcn/base-ui, SheetJS `xlsx` 0.20.3, Drizzle ORM with libSQL (SQLite), Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-16-phase2a-uploads-design.md` (approved 16 Nov 2026). **Branch:** `feat/phase2a-uploads`.

## Global Constraints

- App folder: `aci-media-dashboard/`. Run every command from there.
- Next.js 16 has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers, server actions or config (see `AGENTS.md`).
- Node >= 22.12. npm.
- **Store.** All new data goes through `src/store/` (one SQLite file). Never use Neon (`getDb`) for anything new.
- **Tests:** `createTestStore()` (in-memory libSQL with the real migrations). Never use the real data dir. Never use Neon.
- **Real client files:**
  - They live in `Asset/xlsx/` (22 files, 13 of them under `Asset/xlsx/atl/`).
  - The answer key is in `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/data/`.
  - Both are gitignored and must never be committed.
  - Tests that need them use `describe.skipIf(!hasClientFiles)`.
- **Numbers:** FY runs July to June. Month keys are `YYYY-MM`. Month labels look like `Jul'26`.
- **Brand names:** readers keep brand names exactly as his readers do, so they match his data. Full official names are applied when pages read the data (Phase 3), as his app does in `normBrands()`.
- **Copy:** plain, short English. Error and warning text is shown to the admin as written in this plan.
- **Dataset keys:** `atl:<his category key>` (for example `atl:soap`, `atl:septex`) and `calendar`. Part B adds `fy`, `channel`, `billing`, `billboard`, `digital:<Business>` and `ooh-sites`. The spec's example `atl:Savlon Soap` becomes `atl:soap`, because his category keys are stable and display names are not.
- **Limits:** 60 MB per request and per file (`MAX_FILE_BYTES` from `src/store/files.ts`); 200 MB unpacked per file; at most 30 files per upload.
- **UI:**
  - Follow the Wix and Mixpanel look already in the app.
  - Reuse `PageHeader`, `Card`, `Table`, `Badge`, `Button`, `SegmentedLinks` and `EmptyState`.
  - Check with desktop (1440 px) and phone (375 px) screenshots.
  - lucide-react icons only, because the project already uses them.
- **Commits:** small, Conventional Commits. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `netlify.toml`, `.env*`, `Asset/` or `.spine/config-asserted`.

**Security constraints (from `security-standard` section 1; a violation is a Critical finding):**
- Every write is authorised on the server. Every new server action calls `await requireAdmin()` as its first statement, before reading the form or touching the store. The original-file download route checks `isAdmin()` first.
- Untrusted input is validated on the server:
  - file bytes are checked before parsing (size, zip signature, `xl/workbook.xml`, unpacked size);
  - the type override must be one of `FILE_TYPES`;
  - version and file ids must be positive integers;
  - publishing re-reads the files and never trusts a preview from the browser.
- Parameterised SQL only. Use the Drizzle query builder, never string-built SQL. The trigger migration is static DDL.
- No secrets in code, logs or commits. Error messages shown to users never contain stack traces, file paths or SQL.
- Tests never touch the real data dir or Neon.
- Download headers: `Content-Disposition` is built from a sanitised file name (no `"`, `\`, CR, LF or non-ASCII in `filename=`, plus an RFC 5987 `filename*=`). Also send `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.

**Section 2 checklist items per task:**
- **Task 2 (new upload surface):**
  - size limit;
  - type sniffed from the bytes, not the extension;
  - zip-bomb guard;
  - the parser runs only after the checks.
- **Task 7 (new actions, new route, raised body limit):**
  - authz on every entry point;
  - the guard is proved by a mutation test;
  - the raised body limit is matched by in-code limits;
  - the download sets safe headers.
- **Task 1 (history integrity):**
  - append-only is enforced in the database, not only in code;
  - a mutation-proof test shows it.

---

## File structure and seams

```
src/store/
  datasets.ts            MODIFY  + publishVersions(store, inputs), + getActiveFileHashes(store, keys)
  datasets.test.ts       MODIFY  batch publish, append-only triggers, hashes
drizzle-store/
  0001_history_append_only.sql   CREATE (custom migration: 4 triggers) + meta journal update
src/lib/ingest/                  NEW: pure, no DB, no Next imports
  xlsx-check.ts          checkXlsxBytes(bytes): XlsxCheck
  workbook.ts            openWorkbook(bytes): Workbook  (1-based adapter over SheetJS, like his readXlsx)
  cells.ts               xstr, round, sum, pad2, monthLabel
  file-types.ts          FILE_TYPES, FileType, FILE_TYPE_LABEL
  detect.ts              detectFileType(wb): Detection
  read-result.ts         ReadResult<T>, ReadError
  readers/atl.ts         readAtl(wb): ReadResult<AtlCategory>
  readers/calendar.ts    readCalendar(wb): ReadResult<CalendarData>
  readers/index.ts       READERS: Partial<Record<FileType, Reader>>
  test-workbooks.ts      makeXlsx(), clientFile(), answerKey(), hasClientFiles   (test helper)
  *.test.ts
src/server/
  ingest.ts              prepareFile(), previewUploads(), publishUploads(), MAX_FILES
  ingest.test.ts
src/app/(modules)/data-entry/
  actions.ts             restoreVersionAction (uploads: POST /api/uploads/preview and /publish, see Amendment to Task 7)
  page.tsx               Data Entry page (tabs: Upload | Upload History)
  upload-box.tsx         client: drop zone, preview lines, type picker, Publish/Cancel
  history-table.tsx      server: Upload History table
  restore-version-button.tsx  client
src/app/api/uploads/[fileId]/route.ts   GET original file (admin only)
src/app/api/uploads/[fileId]/route.test.ts
src/components/shell/nav-items.ts, sidebar.tsx   MODIFY: "Data Entry" item + icon
src/auth/guard-every-action.test.ts      NEW (replaces guard-coverage.test.ts)
src/auth/guard-coverage.test.ts          DELETE
next.config.ts                            MODIFY: bodySizeLimit 60mb (+ proxy body limit if Next 16 has one)
e2e/phase2a-upload.spec.ts                NEW
playwright.config.ts                      MODIFY only if a new project entry is needed
```

**Seams the user owns (interfaces below are fixed; implementations are the implementer's latitude):**

```ts
// src/lib/ingest/xlsx-check.ts
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export type XlsxCheck = { ok: true } | { ok: false; reason: string };
export function checkXlsxBytes(bytes: Uint8Array): XlsxCheck;

// src/lib/ingest/workbook.ts   (rows and columns are 1-based, like his reader)
export type CellValue = string | number | boolean | null;
export type Cell = { v: CellValue; date: Date | null };
export type Sheet = { name: string; maxRow: number; maxCol: number; v(r: number, c: number): CellValue; cell(r: number, c: number): Cell };
export type SheetInfo = { name: string; visible: boolean };
export type Workbook = { sheets: SheetInfo[]; sheet(ref: string | number): Sheet | null; visibleSheets(): Sheet[] };
export function openWorkbook(bytes: Uint8Array): Workbook;

// src/lib/ingest/file-types.ts
export const FILE_TYPES = ["atl", "calendar", "fy", "channel", "billing", "billboard", "digital", "ooh-sites"] as const;
export type FileType = (typeof FILE_TYPES)[number];
export const FILE_TYPE_LABEL: Record<FileType, string>;

// src/lib/ingest/detect.ts
export type Detection =
  | { status: "sure"; type: FileType }
  | { status: "unsure"; candidates: FileType[] }
  | { status: "none"; lookedFor: string };
export function detectFileType(wb: Workbook): Detection;

// src/lib/ingest/read-result.ts
export class ReadError extends Error {}
export type ReadResult<T> = {
  type: FileType; datasetKey: string; label: string; summary: string;
  months: string[]; rowCount: number; data: T; warnings: string[];
};
export type Reader = (wb: Workbook) => ReadResult<unknown>;

// src/server/ingest.ts
export const MAX_FILES = 30;
export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null };
export type FilePreview = {
  index: number; fileName: string; sizeBytes: number; sha256: string;
  detection: Detection | null; type: FileType | null;
  label: string | null; summary: string | null; datasetKey: string | null;
  rowCount: number; warnings: string[]; errors: string[];
  canPublish: boolean; blockReason: string | null;
};
export async function previewUploads(store: Store, inputs: UploadInput[]): Promise<FilePreview[]>;
export async function publishUploads(store: Store, inputs: UploadInput[]): Promise<{ published: { datasetKey: string; label: string; versionId: number }[] }>;

// src/store/datasets.ts (additions)
export async function publishVersions(store: Store, inputs: PublishInput[]): Promise<{ versionIds: number[] }>;
export async function getActiveFileHashes(store: Store, datasetKeys: string[]): Promise<Map<string, string>>;
```

---

### Task 1: Upload History is append-only, and several files publish together

Tracker: p2-81, plus the store side of p2-14.

**Files:**
- Create: `drizzle-store/0001_history_append_only.sql` (generated empty by drizzle-kit, then filled)
- Modify: `drizzle-store/meta/_journal.json` (by drizzle-kit only)
- Modify: `src/store/datasets.ts`
- Test: `src/store/datasets.test.ts`

**Interfaces:**
- Consumes: `publishVersion`, `PublishInput`, `saveFile`, and the `dataset`, `datasetVersion` and `uploadFile` tables (Phase 1).
- Produces: `publishVersions(store, inputs): Promise<{ versionIds: number[] }>` (all or nothing). `getActiveFileHashes(store, keys): Promise<Map<datasetKey, sha256>>`. `publishVersion` keeps its signature and delegates to `publishVersions`.

- [ ] **Step 1: Write the failing tests.** Append to `src/store/datasets.test.ts`, reusing its existing imports and adding any that are missing:

```ts
import { eq } from "drizzle-orm";
import { dataset, datasetVersion, uploadFile } from "./schema";
import { getActiveFileHashes, publishVersion, publishVersions } from "./datasets";

/** Drizzle wraps driver errors; the trigger's message is on the cause. */
async function failure(p: Promise<unknown>): Promise<string> {
  try { await p; return ""; } catch (e) { return `${String(e)} ${String((e as { cause?: unknown }).cause ?? "")}`; }
}

const input = (key: string, name = "a.xlsx", bytes = "abc") => ({
  datasetKey: key, kind: key.split(":")[0], label: `L ${key}`, source: "upload" as const,
  summary: {}, data: { k: key }, file: { name, bytes: Buffer.from(bytes) },
});

describe("Upload History is append-only", () => {
  it("refuses to change or delete versions and files", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, input("calendar"));
    expect(await failure(store.update(datasetVersion).set({ label: "x" }).where(eq(datasetVersion.id, versionId)))).toMatch(/Upload History cannot be changed/);
    expect(await failure(store.delete(datasetVersion))).toMatch(/Upload History cannot be deleted/);
    expect(await failure(store.update(uploadFile).set({ name: "b" }))).toMatch(/Uploaded files cannot be changed/);
    expect(await failure(store.delete(uploadFile))).toMatch(/Uploaded files cannot be deleted/);
    expect(await store.$count(datasetVersion)).toBe(1);
  });

  it("still lets restore move the active pointer", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input("calendar", "a.xlsx", "a"));
    await publishVersion(store, input("calendar", "b.xlsx", "b"));
    await restoreVersion(store, a.versionId);
    const [row] = await store.select().from(dataset).where(eq(dataset.key, "calendar"));
    expect(row.activeVersionId).toBe(a.versionId);
  });
});

describe("publishVersions", () => {
  it("publishes several datasets in one go", async () => {
    const store = await createTestStore();
    const { versionIds } = await publishVersions(store, [input("atl:soap"), input("calendar")]);
    expect(versionIds).toHaveLength(2);
    expect((await getActiveData(store, "atl:soap"))?.data).toEqual({ k: "atl:soap" });
    expect((await getActiveData(store, "calendar"))?.data).toEqual({ k: "calendar" });
  });

  it("is all or nothing", async () => {
    const store = await createTestStore();
    const bad = { ...input("calendar"), label: "" }; // fails validation
    await expect(publishVersions(store, [input("atl:soap"), bad])).rejects.toThrow(/Label/);
    expect(await store.$count(datasetVersion)).toBe(0);
    expect(await store.$count(uploadFile)).toBe(0);
  });

  it("refuses an empty list", async () => {
    await expect(publishVersions(await createTestStore(), [])).rejects.toThrow(/Nothing to publish/);
  });
});

describe("getActiveFileHashes", () => {
  it("returns the SHA-256 of each active version's original file", async () => {
    const store = await createTestStore();
    await publishVersion(store, input("calendar", "a.xlsx", "abc"));
    const map = await getActiveFileHashes(store, ["calendar", "atl:soap"]);
    expect(map.get("calendar")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(map.has("atl:soap")).toBe(false);
  });
});
```

Also import `restoreVersion` and `getActiveData` from `./datasets` if they are not already imported.

- [ ] **Step 2: Run them to make sure they fail.**
Run: `npx vitest run src/store/datasets.test.ts`
Expected: FAIL. `publishVersions` and `getActiveFileHashes` are not exported, and the update and delete are not refused.

- [ ] **Step 3: Generate the custom migration.**
Run: `npm run db:store:generate -- --custom --name history_append_only`
Expected: drizzle-kit creates an empty `drizzle-store/0001_history_append_only.sql` and adds a journal entry. Write this into it:

```sql
CREATE TRIGGER `dataset_version_no_update` BEFORE UPDATE ON `dataset_version`
BEGIN SELECT RAISE(ABORT, 'Upload History cannot be changed.'); END;
--> statement-breakpoint
CREATE TRIGGER `dataset_version_no_delete` BEFORE DELETE ON `dataset_version`
BEGIN SELECT RAISE(ABORT, 'Upload History cannot be deleted.'); END;
--> statement-breakpoint
CREATE TRIGGER `upload_file_no_update` BEFORE UPDATE ON `upload_file`
BEGIN SELECT RAISE(ABORT, 'Uploaded files cannot be changed.'); END;
--> statement-breakpoint
CREATE TRIGGER `upload_file_no_delete` BEFORE DELETE ON `upload_file`
BEGIN SELECT RAISE(ABORT, 'Uploaded files cannot be deleted.'); END;
```

- [ ] **Step 4: Implement `publishVersions` and `getActiveFileHashes`** in `src/store/datasets.ts`. Replace the body of `publishVersion` so that both share one validated insert:

```ts
import { desc, eq, inArray } from "drizzle-orm";
import type { Store, StoreTx } from "./client";

function checkInput(input: PublishInput): PublishInput {
  const datasetKey = input.datasetKey.trim();
  if (!datasetKey || datasetKey.length > 120) throw new ValidationError("Dataset key must be 1 to 120 characters.");
  const kind = input.kind.trim();
  if (!kind || kind.length > 60) throw new ValidationError("Dataset kind must be 1 to 60 characters.");
  const label = input.label.trim();
  if (!label || label.length > 255) throw new ValidationError("Label must be 1 to 255 characters.");
  return { ...input, datasetKey, kind, label };
}

async function insertVersion(tx: StoreTx, input: PublishInput): Promise<number> {
  const fileId = input.file ? (await saveFile(tx, input.file)).id : null;
  const [v] = await tx
    .insert(datasetVersion)
    .values({ datasetKey: input.datasetKey, kind: input.kind, label: input.label, source: input.source, summary: input.summary, data: input.data, fileId })
    .returning({ id: datasetVersion.id });
  const updatedAt = new Date();
  await tx
    .insert(dataset)
    .values({ key: input.datasetKey, kind: input.kind, activeVersionId: v.id, updatedAt })
    .onConflictDoUpdate({ target: dataset.key, set: { activeVersionId: v.id, kind: input.kind, updatedAt } });
  return v.id;
}

/** Saves new versions (with their original files) and makes them the ones the pages show. All of them or none. */
export async function publishVersions(store: Store, inputs: PublishInput[]): Promise<{ versionIds: number[] }> {
  if (inputs.length === 0) throw new ValidationError("Nothing to publish.");
  const clean = inputs.map(checkInput); // validate everything before writing anything
  return store.transaction(async (tx) => {
    const versionIds: number[] = [];
    for (const input of clean) versionIds.push(await insertVersion(tx, input));
    return { versionIds };
  });
}

/** Saves a new version (and its original file) and makes it the one the pages show. All or nothing. */
export async function publishVersion(store: Store, input: PublishInput): Promise<{ versionId: number }> {
  const { versionIds } = await publishVersions(store, [input]);
  return { versionId: versionIds[0] };
}

/** SHA-256 of the original file behind each dataset's active version, so a preview can say "same file as the one in use". */
export async function getActiveFileHashes(store: Store, datasetKeys: string[]): Promise<Map<string, string>> {
  if (datasetKeys.length === 0) return new Map();
  const rows = await store
    .select({ key: dataset.key, sha256: uploadFile.sha256 })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .innerJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .where(inArray(dataset.key, datasetKeys));
  return new Map(rows.map((r) => [r.key, r.sha256]));
}
```

- [ ] **Step 5: Check that no code updates or deletes these tables.**
Run: `git grep -n -E "(update|delete)\((datasetVersion|uploadFile)\)" -- src ':!*.test.ts'`
Expected: no output.

- [ ] **Step 6: Run the store tests.**
Run: `npx vitest run src/store`
Expected: PASS, including the Phase 1 tests (backup, restore, files).

- [ ] **Step 7: Mutation proof.** Temporarily delete the `dataset_version_no_delete` block from the SQL file and run `npx vitest run src/store/datasets.test.ts`. Expected: FAIL on "cannot be deleted". Put the block back and run again. Expected: PASS.

- [ ] **Step 8: Commit.**
```bash
git add drizzle-store src/store/datasets.ts src/store/datasets.test.ts
git commit -m "feat(store): append-only Upload History and batch publish"
```

---

### Task 2: Byte checks and workbook adapter

Tracker: p2-80. The cap is enforced in code, and the type is read from the bytes.

**Files:**
- Create: `src/lib/ingest/xlsx-check.ts`, `src/lib/ingest/workbook.ts`, `src/lib/ingest/cells.ts`, `src/lib/ingest/test-workbooks.ts`
- Test: `src/lib/ingest/xlsx-check.test.ts`, `src/lib/ingest/workbook.test.ts`

**Interfaces:**
- Consumes: `MAX_FILE_BYTES` from `src/store/files.ts`.
- Produces: `checkXlsxBytes`, `openWorkbook`, `Workbook`, `Sheet`, `Cell`, and the cell helpers `xstr(v): string`, `round(v, d): number`, `sum<T>(rows: T[], f: (r: T) => number): number`, `pad2(n): string`, `monthLabel("2026-10"): "Oct'26"`. Test helpers: `makeXlsx(sheets: SheetSpec[]): Buffer`, `hasClientFiles: boolean`, `clientFile(rel): Buffer`, `clientFiles(): { rel: string; bytes: Buffer }[]`, `answerKey<T>(name): T`.

- [ ] **Step 1: Write the test helper** `src/lib/ingest/test-workbooks.ts`. It is used by tests only, so tests can build small workbooks:

```ts
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

export type SheetSpec = { name: string; rows: unknown[][]; hidden?: boolean };

/** Builds a real .xlsx in memory. Date objects become date-formatted cells. */
export function makeXlsx(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows, { cellDates: true }), s.name);
  wb.Workbook = { Sheets: sheets.map((s) => ({ name: s.name, Hidden: s.hidden ? 1 : 0 })) } as XLSX.WBProps;
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const CLIENT_XLSX_DIR = path.resolve("Asset/xlsx");
export const ANSWER_KEY_DIR = path.resolve("Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/data");
export const hasClientFiles = fs.existsSync(CLIENT_XLSX_DIR) && fs.existsSync(ANSWER_KEY_DIR);

export const clientFile = (rel: string): Buffer => fs.readFileSync(path.join(CLIENT_XLSX_DIR, rel));

/** All 22 client files, as paths relative to Asset/xlsx ("atl/1._2026_..." for ATL). */
export function clientFiles(): { rel: string; bytes: Buffer }[] {
  const top = fs.readdirSync(CLIENT_XLSX_DIR).filter((f) => f.endsWith(".xlsx"));
  const atl = fs.readdirSync(path.join(CLIENT_XLSX_DIR, "atl")).filter((f) => f.endsWith(".xlsx")).map((f) => `atl/${f}`);
  return [...top, ...atl].map((rel) => ({ rel, bytes: clientFile(rel) }));
}

export const answerKey = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(ANSWER_KEY_DIR, name), "utf8")) as T;
```

- [ ] **Step 2: Write the failing tests** `src/lib/ingest/xlsx-check.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkXlsxBytes, MAX_UNPACKED_BYTES } from "./xlsx-check";
import { makeXlsx } from "./test-workbooks";

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";

/** A minimal stored zip with one entry whose central directory claims `size` unpacked bytes. */
function zipClaiming(name: string, size: number): Uint8Array {
  const n = Buffer.from(name);
  const local = Buffer.alloc(30 + n.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
  const central = Buffer.alloc(46 + n.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(size, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42); n.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

describe("checkXlsxBytes", () => {
  it("accepts a real workbook", () => {
    expect(checkXlsxBytes(new Uint8Array(makeXlsx([{ name: "S", rows: [["a"]] }])))).toEqual({ ok: true });
  });
  it("refuses an empty file", () => {
    expect(checkXlsxBytes(new Uint8Array())).toEqual({ ok: false, reason: "The file is empty." });
  });
  it("refuses a file over 60 MB without reading it", () => {
    expect(checkXlsxBytes(new Uint8Array(60 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: "The file is larger than 60 MB." });
  });
  it("refuses text, PDF and a renamed zip", () => {
    expect(checkXlsxBytes(new Uint8Array(Buffer.from("Brand,Spend\n")))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(new Uint8Array(Buffer.from("%PDF-1.7")))).toEqual({ ok: false, reason: NOT_XLSX });
    expect(checkXlsxBytes(zipClaiming("photo.jpg", 10))).toEqual({ ok: false, reason: NOT_XLSX });
  });
  it("names an old .xls file", () => {
    expect(checkXlsxBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toEqual({
      ok: false, reason: "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.",
    });
  });
  it("refuses a zip bomb before unpacking", () => {
    expect(checkXlsxBytes(zipClaiming("xl/workbook.xml", MAX_UNPACKED_BYTES + 1))).toEqual({
      ok: false, reason: "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.",
    });
  });
});
```

`src/lib/ingest/workbook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openWorkbook } from "./workbook";
import { makeXlsx } from "./test-workbooks";
import { monthLabel, round, xstr } from "./cells";

describe("openWorkbook", () => {
  const bytes = makeXlsx([
    { name: "Hidden one", rows: [["secret"]], hidden: true },
    { name: "Oct'26", rows: [["Title"], ["Brand", 12.5, new Date(Date.UTC(2026, 9, 1))], [null, "x"]] },
  ]);
  const wb = openWorkbook(new Uint8Array(bytes));

  it("lists sheets with visibility", () => {
    expect(wb.sheets).toEqual([{ name: "Hidden one", visible: false }, { name: "Oct'26", visible: true }]);
    expect(wb.visibleSheets().map((s) => s.name)).toEqual(["Oct'26"]);
  });
  it("reads cells 1-based, with dates and blanks", () => {
    const s = wb.sheet("oct'26 ")!; // case- and space-insensitive name match
    expect(s.v(2, 1)).toBe("Brand");
    expect(s.v(2, 2)).toBe(12.5);
    expect(s.cell(2, 3).date?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(s.v(3, 1)).toBeNull();
    expect(s.v(0, 1)).toBeNull();
    expect(s.v(99, 99)).toBeNull();
    expect(s.maxRow).toBe(3);
    expect(s.maxCol).toBe(3);
  });
  it("finds sheets by index and returns null when missing", () => {
    expect(wb.sheet(1)?.name).toBe("Oct'26");
    expect(wb.sheet(-1)).toBeNull();
    expect(wb.sheet("nope")).toBeNull();
  });
});

describe("cell helpers", () => {
  it("match his reader's helpers", () => {
    expect(xstr(null)).toBe("");
    expect(xstr("  a ")).toBe("a");
    expect(round(1.23456, 2)).toBe(1.23);
    expect(monthLabel("2026-10")).toBe("Oct'26");
    expect(monthLabel("2027-01")).toBe("Jan'27");
  });
});
```

- [ ] **Step 3: Run them to make sure they fail.**
Run: `npx vitest run src/lib/ingest`
Expected: FAIL, with modules not found.

- [ ] **Step 4: Implement `src/lib/ingest/cells.ts`:**

```ts
/** Small helpers ported from the client's reader (template.html), so ported readers behave the same. */
export const xstr = (v: unknown): string => (v == null ? "" : String(v).trim());
export const round = (v: number, d: number): number => { const p = 10 ** d; return Math.round(v * p) / p; };
export const sum = <T>(rows: T[], f: (r: T) => number): number => rows.reduce((t, r) => t + f(r), 0);
export const pad2 = (n: number): string => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" → "Oct'26" */
export const monthLabel = (m: string): string => { const [y, mo] = m.split("-"); return `${MON[Number(mo) - 1]}'${y.slice(2)}`; };
```

- [ ] **Step 5: Implement `src/lib/ingest/xlsx-check.ts`.** Do not inflate anything. Read only the zip's central directory:

```ts
import { MAX_FILE_BYTES } from "@/store/files";

export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export type XlsxCheck = { ok: true } | { ok: false; reason: string };

const NOT_XLSX = "This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again.";
const OLD_XLS = "This is an old Excel file (.xls). Save it as Excel Workbook (.xlsx) and try again.";
const TOO_BIG = "This file unpacks to more than 200 MB, far bigger than any usual Media Mind file.";
const no = (reason: string): XlsxCheck => ({ ok: false, reason });

/**
 * Decides from the bytes (never the file name) whether this is an .xlsx we are willing to parse.
 * Reads only the zip central directory: no inflating, so a zip bomb is refused before any work.
 * The declared sizes could lie; this is a first guard, and only the signed-in admin can upload.
 */
export function checkXlsxBytes(bytes: Uint8Array): XlsxCheck {
  if (bytes.length === 0) return no("The file is empty.");
  if (bytes.length > MAX_FILE_BYTES) return no("The file is larger than 60 MB.");
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return no(OLD_XLS);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return no(NOT_XLSX);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 22 - 0xffff); p--) {
    if (dv.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) return no(NOT_XLSX);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) return no(TOO_BIG); // zip64: never needed for his files
  const decoder = new TextDecoder();
  let total = 0;
  let hasWorkbook = false;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return no(NOT_XLSX);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    if (size === 0xffffffff) return no(TOO_BIG);
    total += size;
    if (total > MAX_UNPACKED_BYTES) return no(TOO_BIG);
    if (decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)) === "xl/workbook.xml") hasWorkbook = true;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return hasWorkbook ? { ok: true } : no(NOT_XLSX);
}
```

- [ ] **Step 6: Implement `src/lib/ingest/workbook.ts`.** This is a 1-based adapter over SheetJS, with the same contract as his `readXlsx` (`v`, `cell().date`, `maxRow`, `maxCol`, and visibility from the workbook's `Hidden` flag):

```ts
import * as XLSX from "xlsx";

export type CellValue = string | number | boolean | null;
export type Cell = { v: CellValue; date: Date | null };
export type Sheet = { name: string; maxRow: number; maxCol: number; v(r: number, c: number): CellValue; cell(r: number, c: number): Cell };
export type SheetInfo = { name: string; visible: boolean };
export type Workbook = { sheets: SheetInfo[]; sheet(ref: string | number): Sheet | null; visibleSheets(): Sheet[] };

const EMPTY: Cell = { v: null, date: null };

function toCell(c: XLSX.CellObject | undefined): Cell {
  if (!c) return EMPTY;
  switch (c.t) {
    case "s": return { v: String(c.v), date: null };
    case "b": return { v: Boolean(c.v), date: null };
    case "e": return { v: c.w ?? null, date: null };
    case "n": {
      const v = Number(c.v);
      // Same as his reader: a number with a date format is an Excel date (days since 1899-12-30, UTC).
      const isDate = typeof c.z === "string" && XLSX.SSF.is_date(c.z);
      return { v, date: isDate ? new Date(Math.round((v - 25569) * 86400000)) : null };
    }
    case "d": return { v: (c.v as Date).getTime() / 86400000 + 25569, date: c.v as Date };
    default: return EMPTY;
  }
}

/** Opens an .xlsx that already passed checkXlsxBytes. Rows and columns are 1-based, like the client's own reader. */
export function openWorkbook(bytes: Uint8Array): Workbook {
  const wb = XLSX.read(bytes, { type: "array", dense: true, cellNF: true, cellDates: false, cellStyles: false });
  const sheets: SheetInfo[] = wb.SheetNames.map((name, i) => ({ name, visible: !wb.Workbook?.Sheets?.[i]?.Hidden }));
  const cache = new Map<number, Sheet>();

  function load(i: number): Sheet {
    const hit = cache.get(i);
    if (hit) return hit;
    const ws = wb.Sheets[wb.SheetNames[i]];
    const data = (ws["!data"] ?? []) as (XLSX.CellObject | undefined)[][];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const cell = (r: number, c: number) => (r < 1 || c < 1 ? EMPTY : toCell(data[r - 1]?.[c - 1]));
    const sheet: Sheet = {
      name: wb.SheetNames[i],
      maxRow: range ? range.e.r + 1 : 0,
      maxCol: range ? range.e.c + 1 : 0,
      v: (r, c) => cell(r, c).v,
      cell,
    };
    cache.set(i, sheet);
    return sheet;
  }

  return {
    sheets,
    sheet(ref) {
      const i = typeof ref === "number" ? ref : sheets.findIndex((s) => s.name.trim().toLowerCase() === ref.trim().toLowerCase());
      return i >= 0 && i < sheets.length ? load(i) : null;
    },
    visibleSheets: () => sheets.flatMap((s, i) => (s.visible ? [load(i)] : [])),
  };
}
```

- [ ] **Step 7: Run the tests.**
Run: `npx vitest run src/lib/ingest`
Expected: PASS. If `maxRow` or `maxCol` differ because `aoa_to_sheet` leaves out trailing nulls, adjust the test data, not the adapter contract.

- [ ] **Step 8: Real-file smoke test.** Add to `workbook.test.ts`:

```ts
import { clientFiles, hasClientFiles } from "./test-workbooks";
import { checkXlsxBytes } from "./xlsx-check";

describe.skipIf(!hasClientFiles)("the client's 22 files", () => {
  it("all pass the byte check and open", () => {
    const files = clientFiles();
    expect(files).toHaveLength(22);
    for (const f of files) {
      expect(checkXlsxBytes(new Uint8Array(f.bytes)), f.rel).toEqual({ ok: true });
      expect(openWorkbook(new Uint8Array(f.bytes)).visibleSheets().length, f.rel).toBeGreaterThan(0);
    }
  });
});
```

Run: `npx vitest run src/lib/ingest`
Expected: PASS.

- [ ] **Step 9: Commit.**
```bash
git add src/lib/ingest
git commit -m "feat(ingest): byte check, zip-bomb guard and 1-based workbook adapter"
```

---

### Task 3: Detect the file type from its content

Tracker: p2-01, p2-04, p2-15.

**Files:**
- Create: `src/lib/ingest/file-types.ts`, `src/lib/ingest/detect.ts`
- Test: `src/lib/ingest/detect.test.ts`

**Interfaces:**
- Consumes: `Workbook` and `Sheet` from Task 2, and `xstr`.
- Produces: `FILE_TYPES`, `FileType`, `FILE_TYPE_LABEL`, `detectFileType(wb): Detection`, and `NOT_USUAL_FILE` (the "none" message).

**What each type looks like.** This was checked on the real files on 16 Nov 2026. Rows and columns are 1-based. Only visible sheets count.

| Type | Full match | Partial match |
|---|---|---|
| `atl` | In the first visible sheet: a cell in rows 1–8, columns A–C, matches `/^brand( name)?\s*:/i`, AND (rows 1–15) column A is `Brand Name` or column B is `Brand` | the "Brand Name:" line without the header row |
| `calendar` | At least one visible sheet has, in rows 1–8, column A `Business` and column B `Brand`, plus a month in the sheet name or A1 (`/(jan\|feb\|…\|dec)[a-z]*[\s'’-]*(\d{2,4})/i`), AND every such sheet has a column A `Grand Total` row | the header and month are found, but some sheet has no `Grand Total` row |
| `fy` | A visible sheet whose name contains `final report` (case-insensitive) has, in rows 1–10, column A `Brand` and column B `Media` | the same header in a visible sheet whose name lacks `final report` |
| `channel` | Visible sheets named `Electronic`, `Digital` and `Press & Radio` | 1 or 2 of those 3 |
| `billing` | A sheet `Master` whose row 1 contains all of: `media/ vendor`, `business`, `brand`, `month`, `po number`, `invoice no` | `Master` row 1 contains at least 3 of them |
| `billboard` | In the first visible sheet, rows 1–20: a row with column A `SL` and column B containing `vendor` or `media`, whose cells also contain `purchase order` and `bill no` | the SL plus vendor/media row without those two |
| `digital` | Visible sheets `Meta`, `YouTube` and `TikTok`, each with row 1 column A `Brand` and column B `Month` | 1 or 2 such sheets |
| `ooh-sites` | In the first visible sheet, rows 1–10: one row containing `ooh location`, `latitude` and `longitude` | `ooh location` without latitude and longitude |

**Text matching:** trim each cell, lower-case it and collapse runs of white space. The `Brand` and `Media` headers may have trailing spaces, for example "Media ".

**Result:** exactly one full match gives `sure`. Otherwise, any full or partial matches give `unsure`, with the full matches listed first. No match at all gives `none` with `NOT_USUAL_FILE`.

- [ ] **Step 1: Write the failing tests** `src/lib/ingest/detect.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFileType, NOT_USUAL_FILE } from "./detect";
import { openWorkbook } from "./workbook";
import { clientFiles, hasClientFiles, makeXlsx } from "./test-workbooks";
import type { FileType } from "./file-types";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

const EXPECTED: Record<string, FileType> = {
  "ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx": "ooh-sites",
  "All_Activity_Calender_FY_26-27.xlsx": "calendar",
  "Billboard_Billing_Status_Updated_10th_Nov26.xlsx": "billboard",
  "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx": "fy",
  "Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx": "channel",
  "Dashboard_Media_Final_Fixed_26th_October_2026.xlsx": "billing",
  "Hygiene_Business.xlsx": "digital",
  "Salt_Business.xlsx": "digital",
  "Toiletries_Business_Digital_Media_Data_FY_26-27.xlsx": "digital",
};

describe.skipIf(!hasClientFiles)("every real file is detected as the right type, for sure", () => {
  const files = hasClientFiles ? clientFiles() : [];
  it("covers all 22 files", () => expect(files).toHaveLength(22));
  it.each(files.map((f) => [f.rel, f.bytes] as const))("%s", (rel, bytes) => {
    const want = rel.startsWith("atl/") ? "atl" : EXPECTED[rel];
    expect(want, `no expectation for ${rel}`).toBeDefined();
    expect(detectFileType(open(bytes))).toEqual({ status: "sure", type: want });
  });
});

describe("files that are not his usual files", () => {
  it("refuses a workbook with nothing recognisable", () => {
    expect(detectFileType(open(makeXlsx([{ name: "Sheet1", rows: [["Name", "Amount"], ["a", 1]] }])))).toEqual({ status: "none", lookedFor: NOT_USUAL_FILE });
  });
  it("ignores hidden sheets", () => {
    const b = makeXlsx([
      { name: "Electronic", rows: [["SL", "Channel Name"]], hidden: true },
      { name: "Digital", rows: [["SL", "Platform"]], hidden: true },
      { name: "Press & Radio", rows: [["SL", "Name"]], hidden: true },
      { name: "Notes", rows: [["hello"]] },
    ]);
    expect(detectFileType(open(b)).status).toBe("none");
  });
  it("is unsure about a partial match (calendar without Grand Total)", () => {
    const b = makeXlsx([{ name: "Nov'26", rows: [["CB Media Activity Nov 2026"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["calendar"] });
  });
  it("is unsure when only some channel sheets are there", () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"]] }]);
    expect(detectFileType(open(b))).toEqual({ status: "unsure", candidates: ["channel"] });
  });
  it("never says sure for the old app's template files", () => {
    const dir = path.resolve("../demo-files");
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".xlsx"))) {
      expect(detectFileType(open(fs.readFileSync(path.join(dir, f)))).status, f).not.toBe("sure");
    }
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**
Run: `npx vitest run src/lib/ingest/detect.test.ts`
Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `src/lib/ingest/file-types.ts`:**

```ts
export const FILE_TYPES = ["atl", "calendar", "fy", "channel", "billing", "billboard", "digital", "ooh-sites"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  atl: "ATL (TV)",
  calendar: "Activity Calendar",
  fy: "FY spend",
  channel: "Channel Cost",
  billing: "Billing master",
  billboard: "Billboard billing",
  digital: "Digital",
  "ooh-sites": "OOH master sheet",
};

export const isFileType = (v: unknown): v is FileType => typeof v === "string" && (FILE_TYPES as readonly string[]).includes(v);
```

- [ ] **Step 4: Implement `src/lib/ingest/detect.ts`.** Code the rules from the table above. Shape:

```ts
import { xstr } from "./cells";
import { FILE_TYPES, type FileType } from "./file-types";
import type { Sheet, Workbook } from "./workbook";

export type Detection =
  | { status: "sure"; type: FileType }
  | { status: "unsure"; candidates: FileType[] }
  | { status: "none"; lookedFor: string };

export const NOT_USUAL_FILE =
  "This is not one of the usual Media Mind files. We look for: an ATL dashboard (\"Brand Name:\" line), the Activity Calendar, the FY Media Spent Report, Channel Cost, the billing \"Master\" sheet, Billboard Billing Status, a business's Digital file (Meta, YouTube, TikTok sheets) or the Billboard Master Sheet.";

type Match = "full" | "partial" | "no";
const norm = (v: unknown) => xstr(v).toLowerCase().replace(/\s+/g, " ");
const rowCells = (ws: Sheet, r: number) => Array.from({ length: Math.min(ws.maxCol, 60) }, (_, i) => norm(ws.v(r, i + 1)));
const MONTH = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'’-]*(\d{2,4})/i;

const RULES: Record<FileType, (wb: Workbook) => Match> = {
  atl(wb) { /* table row "atl" */ },
  calendar(wb) { /* table row "calendar" */ },
  fy(wb) { /* … */ },
  channel(wb) { /* … */ },
  billing(wb) { /* … */ },
  billboard(wb) { /* … */ },
  digital(wb) { /* … */ },
  "ooh-sites"(wb) { /* … */ },
};

export function detectFileType(wb: Workbook): Detection {
  const results = FILE_TYPES.map((t) => [t, RULES[t](wb)] as const);
  const full = results.filter(([, m]) => m === "full").map(([t]) => t);
  if (full.length === 1) return { status: "sure", type: full[0] };
  const candidates = [...full, ...results.filter(([, m]) => m === "partial").map(([t]) => t)];
  return candidates.length ? { status: "unsure", candidates } : { status: "none", lookedFor: NOT_USUAL_FILE };
}
```

Every rule body must follow the table exactly. The billing master's row 1 starts with `SL | Media/ Vendor`, so it is also a *partial* billboard match. That is expected: a single full match is still `sure`. If a real file fails a test, read its cells (Task 2's adapter) and fix the **rule**, not the test, so it still follows his reader's logic. Note any rule change in the commit message.

- [ ] **Step 5: Run the tests.**
Run: `npx vitest run src/lib/ingest/detect.test.ts`
Expected: PASS, with 22 real files sure and the wrong-file cases as written.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/ingest/file-types.ts src/lib/ingest/detect.ts src/lib/ingest/detect.test.ts
git commit -m "feat(ingest): detect all 8 file types from sheet names and headers"
```

---

### Task 4: ATL reader, checked against his data

Tracker: p2-05.

**Files:**
- Create: `src/lib/ingest/read-result.ts`, `src/lib/ingest/readers/atl.ts`
- Test: `src/lib/ingest/readers/atl.test.ts`

**Interfaces:**
- Consumes: `Workbook`, `xstr`, `round`, `sum`, `pad2`, `monthLabel`.
- Produces: `ReadError`, `ReadResult<T>`, `Reader`, `readAtl(wb): ReadResult<AtlCategory>`, and the exported types `AtlCategory` and `AtlRow`.

- [ ] **Step 1: Write `src/lib/ingest/read-result.ts`:**

```ts
import type { FileType } from "./file-types";
import type { Workbook } from "./workbook";

/** The numbers cannot be trusted: blocks this file's publish. The message is shown to the admin as is. */
export class ReadError extends Error {
  constructor(message: string) { super(message); this.name = "ReadError"; }
}

export type ReadResult<T> = {
  type: FileType;
  datasetKey: string;   // e.g. "atl:soap", "calendar"
  label: string;        // e.g. "ATL, Savlon Soap, Jul'26 to Oct'26"
  summary: string;      // one line, like his app's summary
  months: string[];     // "YYYY-MM", sorted
  rowCount: number;
  data: T;              // stored as the version's data; same shape as his built-in data
  warnings: string[];   // never block
};

export type Reader = (wb: Workbook) => ReadResult<unknown>;
```

- [ ] **Step 2: Write the failing tests** `src/lib/ingest/readers/atl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readAtl, type AtlCategory } from "./atl";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFiles, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("ATL: all 13 real files match his built-in data", () => {
  const key = hasClientFiles ? answerKey<{ cats: Record<string, AtlCategory & { src?: unknown }> }>("atl.json") : { cats: {} };
  const files = hasClientFiles ? clientFiles().filter((f) => f.rel.startsWith("atl/")) : [];
  it("has 13 files and 13 categories", () => {
    expect(files).toHaveLength(13);
    expect(Object.keys(key.cats)).toHaveLength(13);
  });
  it.each(files.map((f) => [f.rel, f.bytes] as const))("%s", (_rel, bytes) => {
    const r = readAtl(open(bytes));
    const catKey = r.datasetKey.replace(/^atl:/, "");
    const { src: _src, ...want } = key.cats[catKey];
    expect(r.data).toEqual(want);
    expect(r.type).toBe("atl");
    expect(r.label).toMatch(new RegExp(`^ATL, ${want.name}, \\w{3}'\\d{2} to \\w{3}'\\d{2}$`));
    for (const [m, rows] of Object.entries(r.data.months)) {
      expect(rows.reduce((t, x) => t + x.sov, 0), `SOV ${m}`).toBeCloseTo(1, 2);
      if (rows.some((x) => x.sp > 0)) expect(rows.reduce((t, x) => t + x.soe, 0), `SOE ${m}`).toBeCloseTo(1, 2);
    }
  });
  it("Savlon Soap reads as Jul'26 to Oct'26", () => {
    const f = files.find((x) => x.rel.includes("Savlon_Soap"))!;
    expect(readAtl(open(f.bytes)).label).toBe("ATL, Savlon Soap, Jul'25 to Oct'26");
  });
});

describe("ATL read errors and warnings", () => {
  it("needs the Brand Name line", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Client : ACI"], ["Brand Name"]] }])))).toThrow(
      new ReadError('Couldn\'t find the "Brand Name:" line at the top of sheet "GRP".'),
    );
  });
  it("needs a known category", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }])))).toThrow(/doesn't match any ATL category/);
  });
  it("needs the header row", () => {
    expect(() => readAtl(open(makeXlsx([{ name: "GRP", rows: [["Brand Name: ACI Savlon Soap"]] }])))).toThrow(/header row/i);
  });
  it("warns about a month out of sequence and reads it as the next month", () => {
    const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
    const b = makeXlsx([{ name: "GRP", rows: [
      ["Brand Name: ACI Savlon Soap"],
      ["Brand Name", d(2026, 5), null, d(2025, 6)],
      [null, "GRP", "Spend", "GRP", "Spend"],
      ["Savlon Soap", 10, 1000, 20, 2000],
      ["Lux", 30, 3000, 40, 4000],
    ] }]);
    const r = readAtl(open(b));
    expect(Object.keys(r.data.months)).toEqual(["2026-05", "2026-06"]);
    expect(r.warnings).toContain("A month header reads Jun'25 but sits after May'26; read as Jun'26.");
  });
  it("warns about impossible values", () => {
    const b = makeXlsx([{ name: "GRP", rows: [
      ["Brand Name: ACI Savlon Soap"],
      ["Brand Name", new Date(Date.UTC(2026, 7, 1))],
      [null, "GRP", "Spend", "1+ Reach"],
      ["Savlon Soap", 7087, 1000, 1.4],
    ] }]);
    expect(readAtl(open(b)).warnings).toEqual(expect.arrayContaining([
      "Savlon Soap has 7,087 GRP in Aug'26, more than 3,000 in one month. Please check the file.",
      "Savlon Soap has 1+ Reach above 100% in Aug'26. Please check the file.",
    ]));
  });
});
```

- [ ] **Step 3: Run them to make sure they fail.**
Run: `npx vitest run src/lib/ingest/readers/atl.test.ts`
Expected: FAIL, with the module not found.

- [ ] **Step 4: Implement `src/lib/ingest/readers/atl.ts`.** This is a line-by-line port of `parseATLFile` (`template.html` lines 558–580). Keep its logic, rounding and order exactly. The only changes are typing, `ReadError`, the result shape and the two impossible-value warnings.

```ts
import { monthLabel, pad2, round, sum, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

export type AtlRow = { b: string; grp: number; acd: number; ngrp: number; sp: number; sov: number; soe: number; reach: number; spots: number; cprp: number };
export type AtlCategory = { name: string; biz: string; title: string; category: string; tg: string; pop: number; own: string[]; brands: string[]; months: Record<string, AtlRow[]> };

/** [key, dashboard name, business, title pattern, own-brand pattern]: his ATLCATS. */
const ATL_CATEGORIES: [string, string, string, RegExp, RegExp][] = [
  ["soap", "Savlon Soap", "Toiletries", /savlon soap/i, /^savlon soap/i],
  ["septex", "Septex Antiseptic Bar", "Toiletries", /septex/i, /septex/i],
  ["handwash", "Savlon Hand Wash", "Toiletries", /hand ?wash/i, /^savlon/i],
  ["antiseptic", "Savlon Antiseptic Liquid", "Toiletries", /antiseptic/i, /^savlon/i],
  ["babysoft", "Baby Soft", "Toiletries", /baby ?soft/i, /^baby soft/i],
  ["sbwipes", "Savlon Baby Wipes", "Toiletries", /savlon baby wipes/i, /^savlon/i],
  ["twipes", "Twinkle Baby Wipes", "Hygiene", /twinkle baby wipes/i, /^twinkle/i],
  ["freedom", "Freedom Sanitary Napkin", "Hygiene", /freedom/i, /^freedom/i],
  ["diaper", "Twinkle Baby Diaper", "Hygiene", /diaper/i, /twinkle/i],
  ["salt", "ACI Pure Salt", "Salt", /salt/i, /^aci pure salt/i],
  ["mustard", "ACI Pure Mustard Oil", "Others", /mustard/i, /^aci pure mustard/i],
  ["rice", "ACI Pure Fortified Rice", "Others", /rice/i, /^aci pure/i],
  ["spice", "ACI Pure Spices", "Others", /spice|masala/i, /^aci pure/i],
];
const MON3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_MONTH_GRP = 3000;

export function readAtl(wb: Workbook): ReadResult<AtlCategory> {
  const ws = wb.visibleSheets()[0] ?? wb.sheet(0);
  if (!ws) throw new ReadError("The file has no sheets.");
  const warnings: string[] = [];

  let title = "", category = "", tg = "", pop = 0;
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 3; c++) {
    const t = xstr(ws.v(r, c));
    if (/^brand( name)?\s*:/i.test(t)) title = t.replace(/^brand( name)?\s*:\s*/i, "").trim();
    else if (/^category\s*:/i.test(t)) category = t.replace(/^category\s*:\s*/i, "").trim();
    else if (/^tg\b/i.test(t)) tg = t.replace(/^tg\s*:?\s*/i, "").trim();
    else if (/population|tg size/i.test(t)) { const n = Number(t.replace(/[^\d]/g, "")); if (n) pop = n; }
  }
  if (!title) throw new ReadError(`Couldn't find the "Brand Name:" line at the top of sheet "${ws.name}".`);
  const C = ATL_CATEGORIES.find((c) => c[3].test(title) && !(c[0] === "antiseptic" && /septex/i.test(title)));
  if (!C) throw new ReadError(`"${title}" doesn't match any ATL category on the dashboard (Savlon Soap, Septex, Hand Wash, Antiseptic Liquid, Baby Soft, Savlon/Twinkle Baby Wipes, Freedom, Diaper, Salt, Mustard Oil, Rice, Spices).`);

  // Header row: "Brand Name" in column A (dashboard format) or "Brand" in column B (category format).
  let hr = 0, bc = 1, mr = 0;
  for (let r = 1; r <= 15 && !hr; r++) {
    if (/^brand name$/i.test(xstr(ws.v(r, 1)))) { hr = r + 1; bc = 1; mr = r; }
    else if (/^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; bc = 2; mr = r - 1; }
  }
  if (!hr) throw new ReadError('The header row with "Brand Name" or "Brand" wasn\'t found.');

  const blocks: { c: number; m: string }[] = [];
  let yr: number | null = null;
  for (let c = bc + 1; c <= ws.maxCol; c++) {
    const cl = ws.cell(mr, c);
    let m: string | null = null;
    if (bc === 2) { const y = ws.v(mr - 1, c); if (typeof y === "number" && y > 2000 && y < 2100) yr = y; }
    if (cl.date) m = `${cl.date.getUTCFullYear()}-${pad2(cl.date.getUTCMonth() + 1)}`;
    else {
      const t = xstr(cl.v).toLowerCase().trim();
      const mm = t.match(/^([a-z]{3})[a-z]*\s*[’']?\s*(\d{2,4})?$/);
      if (mm && MON3.includes(mm[1])) { let y = mm[2] ? Number(mm[2]) : yr; if (y && y < 100) y += 2000; if (y) m = `${y}-${pad2(MON3.indexOf(mm[1]) + 1)}`; }
      else if (t) m = "skip";
    }
    if (m) blocks.push({ c, m });
  }
  let prev: string | null = null;
  for (const bk of blocks) {
    if (bk.m === "skip") continue;
    if (prev && bk.m <= prev) {
      let [y, mo] = prev.split("-").map(Number);
      mo++; if (mo > 12) { mo = 1; y++; }
      const nx = `${y}-${pad2(mo)}`;
      if (nx.slice(5) === bk.m.slice(5)) { warnings.push(`A month header reads ${monthLabel(bk.m)} but sits after ${monthLabel(prev)}; read as ${monthLabel(nx)}.`); bk.m = nx; }
    }
    prev = bk.m;
  }

  const months: Record<string, AtlRow[]> = {};
  blocks.forEach((bk, i) => {
    if (bk.m === "skip") return;
    const end = (blocks[i + 1] ?? { c: ws.maxCol + 1 }).c;
    const hd: Record<string, number> = {};
    for (let c = bk.c; c < end; c++) {
      const h = xstr(ws.v(hr, c)).toLowerCase().replace(/\s+/g, " ").replace(/ %/, "%").trim();
      if (h && !(h in hd)) hd[h] = c;
    }
    const g = (r: number, ...ks: string[]) => { for (const k of ks) { const col = hd[k]; if (col) { const v = ws.v(r, col); if (typeof v === "number") return v; } } return 0; };
    const rows: AtlRow[] = [];
    for (let r = hr + 1; r <= ws.maxRow; r++) {
      const b = xstr(ws.v(r, bc)).replace(/\s+/g, " ").trim();
      if (/^(total|note|source)/i.test(b)) break;
      if (!b) continue;
      const row: AtlRow = {
        b, grp: round(g(r, "grp"), 1), acd: round(g(r, "acd"), 1), ngrp: round(g(r, "ngrp"), 1),
        sp: Math.round(g(r, "spend") || g(r, "spend mn") * 1e6), sov: round(g(r, "sov%"), 4), soe: round(g(r, "soe%"), 4),
        reach: round(g(r, "1+ reach"), 3), spots: Math.trunc(g(r, "total spot", "total spots")), cprp: Math.round(g(r, "cprp")),
      };
      if (row.grp > 0 || row.sp > 0) rows.push(row);
    }
    if (rows.length) {
      const tn = sum(rows, (r) => r.ngrp), tgrp = sum(rows, (r) => r.grp), ts = sum(rows, (r) => r.sp);
      rows.forEach((r) => { r.sov = round(tn ? r.ngrp / tn : tgrp ? r.grp / tgrp : 0, 4); r.soe = round(ts ? r.sp / ts : 0, 4); });
      months[bk.m] = rows;
    }
  });
  const ms = Object.keys(months).sort();
  if (!ms.length) throw new ReadError(`No months with TV activity were found for ${title}.`);

  const allB: string[] = [];
  for (let r = hr + 1; r <= ws.maxRow; r++) {
    const b = xstr(ws.v(r, bc)).replace(/\s+/g, " ").trim();
    if (/^(total|note|source)/i.test(b)) break;
    if (b && !allB.includes(b)) allB.push(b);
  }
  const own = allB.filter((b) => C[4].test(b));
  if (!own.length) warnings.push(`Couldn't find ${C[1]}'s own row in the brand list; every brand is treated as a competitor.`);

  for (const m of ms) for (const r of months[m]) {
    if (r.grp > MAX_MONTH_GRP) warnings.push(`${r.b} has ${r.grp.toLocaleString("en-US")} GRP in ${monthLabel(m)}, more than 3,000 in one month. Please check the file.`);
    if (r.reach > 1) warnings.push(`${r.b} has 1+ Reach above 100% in ${monthLabel(m)}. Please check the file.`);
  }

  const brandsOnAir = new Set(ms.flatMap((m) => months[m].map((r) => r.b))).size;
  return {
    type: "atl",
    datasetKey: `atl:${C[0]}`,
    label: `ATL, ${C[1]}, ${monthLabel(ms[0])} to ${monthLabel(ms[ms.length - 1])}`,
    summary: `${C[1]} · ${ms.length} months (${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}) · ${brandsOnAir} brands on air`,
    months: ms,
    rowCount: sum(ms, (m) => months[m].length),
    data: { name: C[1], biz: C[2], title, category, tg, pop, own, brands: allB, months },
    warnings,
  };
}
```

- [ ] **Step 5: Run the tests.**
Run: `npx vitest run src/lib/ingest/readers/atl.test.ts`
Expected: PASS.

If a real file does **not** match his `atl.json`:
- Find the first difference: brand, month or field.
- Check whether it comes from the adapter (date detection, `maxCol`) or from the port. Compare with `template.html` lines 558–580.
- Fix the adapter or the port until it matches. Never change the expected data.
- If it still differs because his built-in data was made differently (for example by his Python script), stop. Report the exact difference to the controller, who decides with Sadril and records it in the spec.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/ingest/read-result.ts src/lib/ingest/readers/atl.ts src/lib/ingest/readers/atl.test.ts
git commit -m "feat(ingest): ATL reader ported from the client's app, matches his data for all 13 files"
```

---

### Task 5: Activity Calendar reader, checked against his data

Tracker: p2-09. PRD acceptance: Oct'26 grand total 39.327 Mn.

**Files:**
- Create: `src/lib/ingest/readers/calendar.ts`, `src/lib/ingest/readers/index.ts`
- Test: `src/lib/ingest/readers/calendar.test.ts`

**Interfaces:**
- Consumes: Task 4's `ReadError`, `ReadResult` and `Reader`, plus the cell helpers.
- Produces: `readCalendar(wb): ReadResult<CalendarData>`, the types `CalendarData`, `CalendarMonth` and `CalendarRow`, and `READERS: Partial<Record<FileType, Reader>>` containing `atl` and `calendar` only.

- [ ] **Step 1: Write the failing tests** `src/lib/ingest/readers/calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readCalendar, type CalendarData } from "./calendar";
import { READERS } from "./index";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("Activity Calendar: the real file", () => {
  const r = hasClientFiles ? readCalendar(open(clientFile("All_Activity_Calender_FY_26-27.xlsx"))) : null;
  it("matches his built-in data", () => {
    expect(r!.data).toEqual(answerKey<CalendarData>("calendar.json"));
  });
  it("Oct'26 grand total is 39.327 Mn (PRD acceptance check)", () => {
    const oct = r!.data.months.find((m) => m.m === "2026-10")!;
    expect(oct.rows.reduce((t, x) => t + x.t, 0)).toBeCloseTo(39.327, 3);
  });
  it("labels and keys", () => {
    expect(r!.datasetKey).toBe("calendar");
    expect(r!.label).toBe("Activity Calendar, Jul'26 to Oct'26");
    expect(r!.months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });
});

describe("Activity Calendar read errors and warnings", () => {
  const sheet = (name: string, extra: unknown[][] = [["Grand Total", null, 1, 0.5, 0, 0, 1.5]]) => ({
    name, rows: [[`CB Media Activity ${name}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ...extra],
  });
  it("refuses a workbook with no month sheets", () => {
    expect(() => readCalendar(open(makeXlsx([{ name: "Notes", rows: [["hi"]] }])))).toThrow(/No monthly sheets were recognised/);
  });
  it("warns when a sheet has no Grand Total row, and still reads it", () => {
    const r = readCalendar(open(makeXlsx([sheet("Nov'26", [])])));
    expect(r.data.months[0].rows).toHaveLength(1);
    expect(r.warnings).toContain('Sheet "Nov\'26" has no Grand Total row; read to the last row.');
  });
  it("skips hidden sheets", () => {
    const r = readCalendar(open(makeXlsx([{ ...sheet("Oct'26"), hidden: true }, sheet("Nov'26")])));
    expect(r.months).toEqual(["2026-11"]);
  });
  it("is registered with the ATL reader, and nothing else yet", () => {
    expect(Object.keys(READERS).sort()).toEqual(["atl", "calendar"]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**
Run: `npx vitest run src/lib/ingest/readers/calendar.test.ts`
Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `src/lib/ingest/readers/calendar.ts`.** This is a port of `parseCalendar` (`template.html` lines 836–848) plus the Grand Total warning:

```ts
import { monthLabel, pad2, sum, xstr } from "../cells";
import { ReadError, type ReadResult } from "../read-result";
import type { Workbook } from "../workbook";

export type CalendarRow = { biz: string; b: string; v: number[]; t: number }; // v = [TV, Digital, Print, OOH] in BDT Mn
export type CalendarMonth = { m: string; label: string; rows: CalendarRow[]; notes: { tvCount?: string; channels?: string; digital?: string } };
export type CalendarData = { months: CalendarMonth[] };

const CALMON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function readCalendar(wb: Workbook): ReadResult<CalendarData> {
  const months: CalendarMonth[] = [];
  const warnings: string[] = [];
  for (const ws of wb.visibleSheets()) {
    const title = xstr(ws.v(1, 1));
    const mm = `${title} ${ws.name}`.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'’-]*(\d{2,4})/);
    if (!mm) { warnings.push(`Sheet "${ws.name}": month not recognised`); continue; }
    let y = Number(mm[2]); if (y < 100) y += 2000;
    const m = `${y}-${pad2(CALMON[mm[1]])}`;
    let hr = 0;
    for (let r = 1; r <= 8; r++) if (/^business$/i.test(xstr(ws.v(r, 1))) && /^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; break; }
    if (!hr) { warnings.push(`Sheet "${ws.name}": header row not found`); continue; }
    const col: Record<string, number> = {};
    for (let c = 3; c <= 12; c++) for (const r of [hr, hr + 1]) {
      const h = xstr(ws.v(r, c)).toLowerCase();
      if (["tv", "digital", "print", "ooh", "total"].includes(h) && !col[h]) col[h] = c;
    }
    const rows: CalendarRow[] = [];
    let biz: string | null = null;
    let sawGrandTotal = false;
    for (let r = hr + 2; r <= ws.maxRow; r++) {
      const a = xstr(ws.v(r, 1)), b = xstr(ws.v(r, 2));
      if (/^grand total$/i.test(a)) { sawGrandTotal = true; break; }
      if (a) biz = a;
      if (!b || /^total$/i.test(b)) continue;
      const bn = /^skin\s*gen$/i.test(b) ? "SkinZen" : b;
      const n = (c: number | undefined) => { const v = c ? ws.v(r, c) : null; return typeof v === "number" ? r4(v) : 0; };
      const v = [n(col.tv), n(col.digital), n(col.print), n(col.ooh)];
      rows.push({ biz: biz || "Others", b: bn, v, t: r4(v.reduce((x, y2) => x + y2, 0)) });
    }
    if (!sawGrandTotal) warnings.push(`Sheet "${ws.name}" has no Grand Total row; read to the last row.`);
    const notes: CalendarMonth["notes"] = {};
    for (let r = hr; r <= ws.maxRow; r++) {
      const t = xstr(ws.v(r, 1));
      if (/^total television channel/i.test(t)) notes.tvCount = t.replace(/^total television channel\s*/i, "").trim();
      else if (/^channel name/i.test(t)) notes.channels = t.replace(/^channel name\s*:\s*/i, "").trim();
      else if (/^digital media platform/i.test(t)) notes.digital = t.replace(/^digital media platform\s*/i, "").trim();
    }
    months.push({ m, label: ws.name.trim(), rows, notes });
  }
  if (!months.length) throw new ReadError("No monthly sheets were recognised. Each sheet needs a title like \"… July 2026\" and a Business · Brand · Media header.");
  months.sort((a, b) => a.m.localeCompare(b.m));
  const ms = months.map((x) => x.m);
  const total = sum(months, (x) => sum(x.rows, (r) => r.t));
  const active = new Set(months.flatMap((x) => x.rows.filter((r) => r.t > 0).map((r) => r.b))).size;
  return {
    type: "calendar",
    datasetKey: "calendar",
    label: `Activity Calendar, ${monthLabel(ms[0])} to ${monthLabel(ms[ms.length - 1])}`,
    summary: `${months.length} months (${ms.map(monthLabel).join(", ")}) · ${active} active brands · ${total.toFixed(2)} Mn total`,
    months: ms,
    rowCount: sum(months, (x) => x.rows.length),
    data: { months },
    warnings,
  };
}
```

`src/lib/ingest/readers/index.ts`:

```ts
import type { FileType } from "../file-types";
import type { Reader } from "../read-result";
import { readAtl } from "./atl";
import { readCalendar } from "./calendar";

/** Readers that exist so far. A detected type without a reader can't be published yet (Part B adds the rest). */
export const READERS: Partial<Record<FileType, Reader>> = { atl: readAtl, calendar: readCalendar };
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/lib/ingest`
Expected: PASS. If the real file differs from `calendar.json`, follow Task 4 Step 5 (fix the port, never the answer key, and stop and report if his data was made differently).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/ingest/readers
git commit -m "feat(ingest): Activity Calendar reader, matches his data and the 39.327 Mn check"
```

---

### Task 6: Preview and publish service

Tracker: p2-02, p2-03, p2-04, p2-13, p2-14.

**Files:**
- Create: `src/server/ingest.ts`
- Test: `src/server/ingest.test.ts`

**Interfaces:**
- Consumes:
  - `checkXlsxBytes` and `openWorkbook` (Task 2);
  - `detectFileType`, `FILE_TYPE_LABEL` and `FileType` (Task 3);
  - `READERS`, `ReadError` and `ReadResult` (Tasks 4–5);
  - `publishVersions` and `getActiveFileHashes` (Task 1);
  - `ValidationError` (`src/server/errors.ts`).
- Produces: `MAX_FILES`, `UploadInput`, `FilePreview`, `previewUploads` and `publishUploads`, exactly as in the seams above.

**Rules for each file, in this order:**
1. **Byte check fails.** `errors = [reason]`, `blockReason = reason`, and `detection = null`.
2. **`openWorkbook` throws.** `errors = ["This file could not be opened as an Excel workbook."]`, and `blockReason` is the same text.
3. **Pick the type.**
   - `type = chosenType ?? (detection.status === "sure" ? detection.type : null)`.
   - If `type` is null and detection is `none`: `errors = [detection.lookedFor]` and `blockReason = "This is not one of the usual Media Mind files."`.
   - If `type` is null and detection is `unsure`: `blockReason = "Pick the file type."`. This is not an error.
4. **The admin picked a type that differs from a sure detection.** Add the warning `` `Detected as ${FILE_TYPE_LABEL[detected]}, but you picked ${FILE_TYPE_LABEL[type]}.` ``.
5. **No reader for that type.** `blockReason = `Recognised as ${FILE_TYPE_LABEL[type]}. Its reader comes in the next update.``. `label` is the type's label.
6. **Reader throws `ReadError`.** `errors = [message]` and `blockReason = "Fix the read error first."`.
   - Any other throw: log it with `console.error`. Then `errors = [`This file could not be read as ${FILE_TYPE_LABEL[type]}.`]`, and `blockReason` is the same text.
7. **Reader succeeds.** Copy `label`, `summary`, `datasetKey`, `rowCount` and `warnings`. Then `canPublish = blockReason === null`.

**Rules for the whole batch:**
- **Empty batch:** throw `ValidationError("Choose at least one Excel file.")`.
- **Too many files:** more than `MAX_FILES` throws `ValidationError("Upload at most 30 files at a time.")`.
- **Same file as the one in use:** if a file's `sha256` equals the active file of its `datasetKey`, add the warning `This is the same file as the one in use.`
- **Two files for one dataset:** if two publishable files share a `datasetKey`, block both. `blockReason = `Two files are for ${label}. Remove one.``.

**Publishing:**
- `publishUploads` prepares every file again from the bytes.
- If any file has `canPublish === false`, throw `ValidationError(`${fileName}: ${blockReason}`)` for the first one, and publish nothing.
- Otherwise call `publishVersions` with, for each file:
  - `kind = type`, `source = "upload"`;
  - `label` and `datasetKey` from the read result;
  - `summary: { summary, months, rowCount, warnings, sha256, fileName }`;
  - `data = result.data`;
  - `file: { name, bytes: Buffer.from(bytes) }`.

- [ ] **Step 1: Write the failing tests** `src/server/ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { getActiveData, listHistory } from "@/store/datasets";
import { makeXlsx, clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { previewUploads, publishUploads, type UploadInput } from "./ingest";

const u8 = (b: Buffer) => new Uint8Array(b);
const calendarBook = (sheet = "Nov'26", grandTotal = true) => makeXlsx([{ name: sheet, rows: [
  [`CB Media Activity ${sheet}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ...(grandTotal ? [["Grand Total", null, 1, 0.5, 0, 0, 1.5]] : []),
] }]);
const file = (name: string, b: Buffer, chosenType: UploadInput["chosenType"] = null): UploadInput => ({ name, bytes: u8(b), chosenType });

describe("previewUploads", () => {
  it("previews a sure, readable file as publishable", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", calendarBook())]);
    expect(p).toMatchObject({ fileName: "cal.xlsx", type: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", datasetKey: "calendar", canPublish: true, blockReason: null, errors: [] });
    expect(p.detection).toEqual({ status: "sure", type: "calendar" });
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("blocks a file that is not Excel", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("x.xlsx", Buffer.from("not excel"))]);
    expect(p).toMatchObject({ canPublish: false, detection: null, errors: ["This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again."] });
  });
  it("blocks a workbook that is none of his files", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("x.xlsx", makeXlsx([{ name: "S", rows: [["a"]] }]))]);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: "This is not one of the usual Media Mind files." });
    expect(p.errors[0]).toMatch(/^This is not one of the usual Media Mind files\. We look for/);
  });
  it("asks the admin to pick when unsure, then reads it as the picked type", async () => {
    const store = await createTestStore();
    const [unsure] = await previewUploads(store, [file("c.xlsx", calendarBook("Nov'26", false))]);
    expect(unsure).toMatchObject({ canPublish: false, type: null, blockReason: "Pick the file type.", errors: [] });
    expect(unsure.detection).toEqual({ status: "unsure", candidates: ["calendar"] });
    const [picked] = await previewUploads(store, [file("c.xlsx", calendarBook("Nov'26", false), "calendar")]);
    expect(picked).toMatchObject({ canPublish: true, type: "calendar" });
    expect(picked.warnings).toContain('Sheet "Nov\'26" has no Grand Total row; read to the last row.');
  });
  it("blocks a recognised type whose reader is not built yet", async () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"]] }, { name: "Digital", rows: [["SL", "Platform"]] }, { name: "Press & Radio", rows: [["SL", "Name"]] }]);
    const [p] = await previewUploads(await createTestStore(), [file("ch.xlsx", b)]);
    expect(p).toMatchObject({ type: "channel", canPublish: false, blockReason: "Recognised as Channel Cost. Its reader comes in the next update." });
  });
  it("shows read errors and blocks", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("a.xlsx", makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }]), "atl")]);
    expect(p.canPublish).toBe(false);
    expect(p.blockReason).toBe("Fix the read error first.");
    expect(p.errors[0]).toMatch(/doesn't match any ATL category/);
  });
  it("blocks two files for the same dataset", async () => {
    const ps = await previewUploads(await createTestStore(), [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook("Dec'26"))]);
    expect(ps.map((p) => p.blockReason)).toEqual([expect.stringMatching(/^Two files are for Activity Calendar/), expect.stringMatching(/^Two files are for Activity Calendar/)]);
  });
  it("warns when the file is the one already in use", async () => {
    const store = await createTestStore();
    await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    const [p] = await previewUploads(store, [file("cal-again.xlsx", calendarBook())]);
    expect(p.warnings).toContain("This is the same file as the one in use.");
    expect(p.canPublish).toBe(true);
  });
  it("limits the batch", async () => {
    const store = await createTestStore();
    await expect(previewUploads(store, [])).rejects.toThrow("Choose at least one Excel file.");
    const many = Array.from({ length: 31 }, (_, i) => file(`${i}.xlsx`, calendarBook()));
    await expect(previewUploads(store, many)).rejects.toThrow("Upload at most 30 files at a time.");
  });
});

describe("publishUploads", () => {
  it("publishes, keeps the original file and shows it in Upload History", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    expect(res.published).toEqual([{ datasetKey: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", versionId: expect.any(Number) }]);
    expect((await getActiveData<{ months: unknown[] }>(store, "calendar"))?.data.months).toHaveLength(1);
    const [h] = await listHistory(store);
    expect(h).toMatchObject({ datasetKey: "calendar", kind: "calendar", source: "upload", fileName: "cal.xlsx", isActive: true });
  });
  it("publishes nothing when any file is blocked", async () => {
    const store = await createTestStore();
    await expect(publishUploads(store, [file("cal.xlsx", calendarBook()), file("bad.xlsx", Buffer.from("x"))])).rejects.toThrow(/^bad\.xlsx: This is not an Excel/);
    expect(await listHistory(store)).toEqual([]);
  });
  it.skipIf(!hasClientFiles)("publishes several real ATL files at once, each only its own category", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, [
      file("soap.xlsx", clientFile("atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx")),
      file("septex.xlsx", clientFile("atl/2._2026_Dash_Board_-_Septex_-_Oct26.xlsx")),
    ]);
    expect(res.published.map((p) => p.datasetKey).sort()).toEqual(["atl:septex", "atl:soap"]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**
Run: `npx vitest run src/server/ingest.test.ts`
Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `src/server/ingest.ts`** following the rules above. Skeleton:

```ts
import { createHash } from "node:crypto";
import { checkXlsxBytes } from "@/lib/ingest/xlsx-check";
import { openWorkbook } from "@/lib/ingest/workbook";
import { detectFileType, type Detection } from "@/lib/ingest/detect";
import { FILE_TYPE_LABEL, type FileType } from "@/lib/ingest/file-types";
import { READERS } from "@/lib/ingest/readers";
import { ReadError, type ReadResult } from "@/lib/ingest/read-result";
import { getActiveFileHashes, publishVersions } from "@/store/datasets";
import type { Store } from "@/store/client";
import { ValidationError } from "./errors";

export const MAX_FILES = 30;
export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null };
export type FilePreview = { /* as in the seams section */ };
type Prepared = { preview: FilePreview; result: ReadResult<unknown> | null };

/** Reads one file: byte check, detection, reader. Pure: no store, no network. */
function prepareFile(input: UploadInput, index: number): Prepared { /* rules 1–7 */ }

function checkBatch(inputs: UploadInput[]) {
  if (inputs.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (inputs.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
}

/** Batch rules that need every file: two files for one dataset, same file as the one in use. */
async function prepareAll(store: Store, inputs: UploadInput[]): Promise<Prepared[]> { /* … */ }

export async function previewUploads(store: Store, inputs: UploadInput[]): Promise<FilePreview[]> {
  checkBatch(inputs);
  return (await prepareAll(store, inputs)).map((p) => p.preview);
}

export async function publishUploads(store: Store, inputs: UploadInput[]) {
  checkBatch(inputs);
  const prepared = await prepareAll(store, inputs); // re-read from the bytes; a preview is never trusted
  const blocked = prepared.find((p) => !p.preview.canPublish);
  if (blocked) throw new ValidationError(`${blocked.preview.fileName}: ${blocked.preview.blockReason}`);
  /* map to PublishInput[], call publishVersions, return { published } in input order */
}
```

The file name for display and storage is `input.name.trim().slice(0, 255) || "upload.xlsx"`. Compute the SHA-256 of the bytes with `createHash("sha256")`.

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/server/ingest.test.ts src/lib/ingest src/store`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/server/ingest.ts src/server/ingest.test.ts
git commit -m "feat(ingest): preview and publish service, blocked lines never publish"
```

---

### Task 7: Server actions, original-file download, body limit and the stronger guard test

Tracker: p2-80 (request limit), p2-82, p2-14 (download).

**Files:**
- Create: `src/app/(modules)/data-entry/actions.ts`, `src/app/api/uploads/[fileId]/route.ts`, `src/app/api/uploads/[fileId]/route.test.ts`, `src/auth/guard-every-action.test.ts`
- Delete: `src/auth/guard-coverage.test.ts`
- Modify: `next.config.ts` (around line 23)

**Interfaces:**
- Consumes: `requireAdmin`, `isAdmin`, `NOT_ADMIN_MESSAGE` and `NotAdminError` (`src/auth/admin.ts`); `getStore`; `restoreVersion` and `getFile`; `previewUploads`, `publishUploads` and `MAX_FILES`; `isFileType`; `MAX_FILE_BYTES`; and `toActionError` and `ActionState`.
- Produces:
  - `previewUploadsAction(fd: FormData): Promise<ActionState & { previews?: FilePreview[] }>` (replaced by the amendment below)
  - `publishUploadsAction(fd: FormData): Promise<ActionState & { published?: { datasetKey: string; label: string; versionId: number }[] }>` (replaced by the amendment below)
  - `restoreVersionAction(versionId: number): Promise<ActionState>`
  - `GET /api/uploads/:fileId`

  **Form fields:** `files` (repeated `File`) and `type-<i>` (optional `FileType` override for file `i`).

- [ ] **Step 1: Read the Next 16 docs** on server action body limits, route handlers (the `params` Promise and `RouteContext`) and the proxy request-body limit:
`grep -rl -i "bodySizeLimit\|ClientMaxBodySize\|RouteContext" node_modules/next/dist/docs | head`
Write down whether `src/proxy.ts` buffers request bodies with its own limit. If so, also raise that limit to 60 MB in `next.config.ts`.

- [ ] **Step 2: Write the failing guard test** `src/auth/guard-every-action.test.ts`. It calls **every** exported server action as a viewer, and replaces the text-pattern test:

```ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store }));
const getDb = vi.fn(() => { throw new Error("DB touched"); });

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("@/store/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/store/client")>()), getStore: async () => h.store }));
vi.mock("@/db/client", () => ({ getDb: () => getDb() }));

const { NOT_ADMIN_MESSAGE } = await import("./admin");

/** Exported actions that sign in or out, or only read, and so need no guard. Keep this list short and justified. */
const NO_GUARD = new Set(["billHistoryAction", "signInAction", "signOutAction"]);

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return /^\s*["']use server["'];/.test(fs.readFileSync(p, "utf8")) ? [p] : [];
  });
}

const actions: [string, (...a: unknown[]) => Promise<unknown>][] = [];
for (const file of serverActionFiles(path.resolve("src/app"))) {
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn === "function" && !NO_GUARD.has(name)) actions.push([`${path.relative(process.cwd(), file)}: ${name}`, fn as (...a: unknown[]) => Promise<unknown>]);
  }
}

/** Row counts of every store table: a refused action must leave all of them unchanged. */
async function counts(store: Store) {
  const tables = await store.$client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'");
  const out: Record<string, number> = {};
  for (const r of tables.rows) out[String(r.name)] = Number((await store.$client.execute(`SELECT count(*) AS n FROM "${String(r.name)}"`)).rows[0].n);
  return out;
}

const refused = (res: unknown) =>
  (res as { error?: unknown } | null)?.error === NOT_ADMIN_MESSAGE || (res instanceof Error && res.message === NOT_ADMIN_MESSAGE);

beforeEach(async () => { h.store = await createTestStore(); getDb.mockClear(); });

describe("every server action, called by a viewer", () => {
  it("finds them all", () => expect(actions.length).toBeGreaterThanOrEqual(30));

  it.each(actions)("%s is refused and changes nothing", async (_name, fn) => {
    const fd = new FormData();
    fd.set("files", new File([new Uint8Array([1, 2, 3])], "x.xlsx"));
    fd.set("kind", "spend");
    const before = await counts(h.store);
    let res: unknown;
    try { res = await fn(fd, fd); } catch (e) { res = e; }
    expect(refused(res), String((res as { error?: unknown })?.error ?? res)).toBe(true);
    expect(getDb).not.toHaveBeenCalled();
    expect(await counts(h.store)).toEqual(before);
  });
});
```

The table names come from `sqlite_master`, not user input, so the quoted identifier is safe. The `30` floor is the Phase 1 count (32 write actions) plus the 3 new ones, minus a margin. If the real number is lower, use the real number and say so in the commit message.

- [ ] **Step 3: Write the failing route test** `src/app/api/uploads/[fileId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";
import { publishVersion } from "@/store/datasets";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const { GET } = await import("./route");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const call = (id: string) => GET(new Request(`http://x/api/uploads/${id}`), { params: Promise.resolve({ fileId: id }) });

beforeEach(async () => { h.store = await createTestStore(); h.jar.clear(); });

describe("GET /api/uploads/:fileId", () => {
  it("refuses a viewer", async () => {
    const res = await call("1");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Only the admin can download uploaded files. Please sign in.");
  });
  it("gives the admin the original bytes with safe headers", async () => {
    h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
    await publishVersion(h.store, { datasetKey: "calendar", kind: "calendar", label: "L", source: "upload", summary: {}, data: {}, file: { name: 'Oct "26"\r\n.xlsx', bytes: Buffer.from("PKabc") } });
    const res = await call("1");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PKabc");
    const cd = res.headers.get("content-disposition")!;
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd).toContain('filename="Oct _26___.xlsx"');
    expect(cd).toContain("filename*=UTF-8''");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("404s for a bad or missing id", async () => {
    h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
    expect((await call("abc")).status).toBe(404);
    expect((await call("99")).status).toBe(404);
  });
});
```

- [ ] **Step 4: Run them to make sure they fail.**
Run: `npx vitest run src/auth/guard-every-action.test.ts "src/app/api/uploads"`
Expected: the route test FAILS (module not found). The guard test may PASS for the existing actions. That is fine: Step 8 proves it can fail.

- [ ] **Step 5: Implement `src/app/(modules)/data-entry/actions.ts`:**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { restoreVersion } from "@/store/datasets";
import { MAX_FILE_BYTES } from "@/store/files";
import { isFileType } from "@/lib/ingest/file-types";
import { ValidationError } from "@/server/errors";
import { toActionError, type ActionState } from "@/server/action-state";
import { MAX_FILES, previewUploads, publishUploads, type FilePreview, type UploadInput } from "@/server/ingest";

async function readUploadForm(fd: FormData): Promise<UploadInput[]> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (files.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
  if (files.reduce((t, f) => t + f.size, 0) > MAX_FILE_BYTES) throw new ValidationError("The files together are larger than 60 MB. Upload them in smaller groups.");
  return Promise.all(files.map(async (f, i) => {
    const t = fd.get(`type-${i}`);
    return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), chosenType: isFileType(t) ? t : null };
  }));
}

export async function previewUploadsAction(fd: FormData): Promise<ActionState & { previews?: FilePreview[] }> {
  try {
    await requireAdmin();
    return { error: null, ok: true, previews: await previewUploads(await getStore(), await readUploadForm(fd)) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishUploadsAction(fd: FormData): Promise<ActionState & { published?: { datasetKey: string; label: string; versionId: number }[] }> {
  try {
    await requireAdmin();
    const { published } = await publishUploads(await getStore(), await readUploadForm(fd));
    revalidatePath("/data-entry");
    return { error: null, ok: true, published };
  } catch (e) {
    return toActionError(e);
  }
}

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
```

- [ ] **Step 6: Implement `src/app/api/uploads/[fileId]/route.ts`.** Use the context type the Next 16 docs give. The test's `{ params: Promise.resolve(...) }` must type-check.

```ts
import { isAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { getFile } from "@/store/files";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** filename= is plain ASCII with quotes, backslashes and control characters replaced; filename*= keeps the real name. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** The original uploaded file, unchanged. Admin only (viewers get Source Excel downloads in Phase 5). */
export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }): Promise<Response> {
  if (!(await isAdmin())) return text("Only the admin can download uploaded files. Please sign in.", 403);
  const raw = (await ctx.params).fileId;
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) return text("Not found.", 404);
  const f = await getFile(await getStore(), id);
  if (!f) return text("Not found.", 404);
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(f.name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 7: Raise the request body limit.** In `next.config.ts`, change `serverActions: { bodySizeLimit: "4mb" }` to `serverActions: { bodySizeLimit: "60mb" }`, with the comment `// 60 MB: matches MAX_FILE_BYTES; per-file and total limits are also checked in code`. If Step 1 found a proxy body limit, raise it to 60 MB the same way. Fix the stale Vercel comment near line 22 while you are there (from the Phase 1 review).
Delete `src/auth/guard-coverage.test.ts`.

- [ ] **Step 8: Run the tests, then the mutation proof.**
Run: `npx vitest run src/auth "src/app/api/uploads"`
Expected: PASS.
Then temporarily delete `await requireAdmin();` from `restoreVersionAction` and run `npx vitest run src/auth/guard-every-action.test.ts`.
Expected: FAIL on `restoreVersionAction`. Put the line back, and run again. Expected: PASS.

- [ ] **Step 9: Run the full unit suite.**
Run: `npm test`
Expected: all pass. That is 251 old tests minus the deleted coverage test, plus the new ones.

- [ ] **Step 10: Commit.**
```bash
git add "src/app/(modules)/data-entry/actions.ts" "src/app/api/uploads" src/auth/guard-every-action.test.ts next.config.ts
git rm src/auth/guard-coverage.test.ts
git commit -m "feat(data-entry): upload, publish and restore actions; admin-only original file download; guard test calls every action"
```

---

### Amendment to Task 7 (16 Nov 2026, Sadril chose "login check first")

The Task 7 review found that `serverActions.bodySizeLimit` is global. Next.js buffers the whole body before any action code runs, so a 60 MB limit would let anyone, signed in or not, send 60 MB to any action. The fix:

- **Upload routes.** Uploads move to two route handlers: `POST /api/uploads/preview` and `POST /api/uploads/publish`. Each one checks, in this order, before reading the body:
  1. the admin session (403, JSON `{ error: NOT_ADMIN_MESSAGE }`);
  2. a same-origin `Origin` header (403);
  3. the `Content-Length`: missing or above the 60 MB file cap plus 1 MB of multipart overhead gives 413.

  Each route then reads the body with a streaming byte cap and returns 413 past the cap. It then parses the multipart body and returns JSON in the same shape as the old actions: `{ error, ok, previews }` and `{ error, ok, published }`.
- **Old actions removed.** `previewUploadsAction` and `publishUploadsAction` are removed. `restoreVersionAction` stays a server action.
- **Body limit restored.** `serverActions.bodySizeLimit` goes back to `"4mb"`.
- **Shared form reading.** Form reading lives in one shared module. An empty file is refused rather than dropped, so `type-<i>` always matches the browser's file order.
- **Task 8 change.** The upload box calls these routes with `fetch` and `FormData`, instead of the two actions.

### Task 8: Data Entry page

Tracker: p2-02, p2-03 and p2-14 (the screens).

**Files:**
- Create: `src/app/(modules)/data-entry/page.tsx`, `upload-box.tsx`, `history-table.tsx`, `restore-version-button.tsx`
- Modify: `src/components/shell/nav-items.ts` (add an item), `src/components/shell/sidebar.tsx` (add the icon to `ICONS`)

**Interfaces:**
- Consumes: `POST /api/uploads/preview` and `POST /api/uploads/publish` (Amendment to Task 7), `restoreVersionAction`, `listHistory` (`src/store/datasets.ts`), `AdminOnly`, `isAdmin`, `FILE_TYPES`, `FILE_TYPE_LABEL`, `FilePreview`, and the shared UI (`PageHeader`, `SegmentedLinks`, `Card`, `Table`, `Badge`, `Button`, `EmptyState`, `PageSkeleton`).
- Produces: the route `/data-entry?tab=upload|history` (default `upload`). Test hooks: `data-testid="upload-drop"`, `data-testid="preview-row"` (one per file), `data-testid="history-table"`, and a type `<select aria-label="File type for <file name>">`. Buttons: "Publish N files", "Cancel", "Restore" and "Download".

**Behaviour:**
- **Menu.** `NAV_ITEMS` gains `{ href: "/data-entry", label: "Data Entry", group: "Data" }`, placed before "Uploads & History". The sidebar icon is `FileUp` from lucide-react.
- **Page header.** `PageHeader title="Data Entry"`, subtitle "Upload his usual Excel files. Every upload is kept in Upload History." On the right, `SegmentedLinks` with the tabs Upload and Upload History.
- **Upload tab, admin.** The upload box (client component):
  - A drop zone (also a "Choose files" button, `<input type="file" multiple accept=".xlsx">`) with the help text "Drop one or more of your usual Excel files. No templates needed."
  - When files are chosen, POST them with `fetch("/api/uploads/preview", { method: "POST", body: formData })` (JSON `{ error, ok, previews }`). While it runs, show a skeleton row per file, not a spinner.
  - One row per file. It shows:
    - the file name;
    - the type select (empty option "Pick the file type…" plus the 8 types; preselected when detection is sure);
    - the label (for example "ATL, Savlon Soap, Jul'26 to Oct'26") and the summary on a second line;
    - a status chip: "Ready" (green) when `canPublish`, "Needs a type" (amber) when `blockReason === "Pick the file type."`, otherwise "Can't publish" (red);
    - errors as a red list, warnings as an amber list, and the `blockReason` in grey when it is not an error;
    - a "Remove" text button.
  - Changing the select POSTs to `/api/uploads/preview` again for **all** current files, with every row's `type-<i>`. Keep it simple and correct.
  - The footer has "Publish N files" (primary). It is disabled unless at least one row is Ready and **every remaining row is Ready**. The admin removes the rows he does not want. The footer also has "Cancel", which clears everything and changes nothing.
  - Publish sends the files and their types to `/api/uploads/publish` (JSON `{ error, ok, published }`; a 4xx or 5xx JSON `error` is shown as is). On success it shows a toast ("Published 2 files: ATL, Savlon Soap…; Activity Calendar…"), clears the box and refreshes with `router.refresh()`. On error it shows the message above the footer in a `p[role=alert]`.
- **Upload tab, viewer.** No drop zone. Show an `EmptyState` with "Only the admin can upload. Sign in to upload files." and a link to `/sign-in`.
- **Upload History tab.** Everyone can see it.
  - A table with the columns When (Dhaka time, for example "16 Nov 2026, 14:05"), Type, What (the label), File, Rows, and the "In use" badge.
  - Admin-only actions: "Restore" (hidden on the active row) and "Download" (a link to `/api/uploads/<fileId>`, shown when there is a `fileId`).
  - Restore asks with `confirm("Use this upload for <label> again? Only that dataset changes.")`, then calls `restoreVersionAction` and shows a toast.
  - Empty state: "No uploads yet. Uploaded files appear here with their original file."
  - Admin-only parts are rendered through `<Suspense fallback={null}><AdminOnly>…</AdminOnly></Suspense>`, or by reading `isAdmin()` once in the page's async content component, which is already inside `<Suspense>`, and passing `admin: boolean` down. Choose the second: one cookie read, one prop.
- **Layout.** At 375 px the table scrolls inside its card (`overflow-x-auto`), and there is no page-level horizontal scroll. Preview rows stack: name and chip on top, then the select, then the messages.

- [ ] **Step 1: Write the page, components and nav change** as described. Follow the existing patterns in `src/app/(modules)/uploads/page.tsx` (page shell with `connection()` and `Suspense`), `src/components/data/upload-panel.tsx` (drop zone and transitions) and `src/app/(modules)/uploads/restore-button.tsx`. Use `listHistory(await getStore(), { limit: 200 })` for the table. Rows come from `HistoryRow`; the row count is `(row.summary.rowCount as number | undefined) ?? ""`.

- [ ] **Step 2: Type-check and lint the new files.**
Run: `npx tsc --noEmit && npx eslint "src/app/(modules)/data-entry" src/components/shell`
Expected: no errors.

- [ ] **Step 3: Look at it.** Start the preview (`preview_start` with name from `.claude/launch.json`; stop it before Playwright runs).
  - As a viewer, open `/data-entry` and `/data-entry?tab=history`.
  - Take screenshots at 1440 px and 375 px.
  - Check the console for errors.
  - Signed-in admin screens are checked by the Task 9 Playwright test, because the controller cannot sign in as the user.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/(modules)/data-entry" src/components/shell/nav-items.ts src/components/shell/sidebar.tsx
git commit -m "feat(data-entry): Data Entry page with multi-file upload, preview, history and restore"
```

---

### Task 9: Walk the Phase 2 flow, saved as a Playwright test

Tracker: p2-90 (Part A paths).

**Files:**
- Create: `e2e/phase2a-upload.spec.ts`
- Modify: `playwright.config.ts`, only if the new spec needs registering in a project. Run it under the existing signed-in `chromium` project (`storageState: "e2e/.auth/admin.json"`), and add a viewer block with `test.use({ storageState: { cookies: [], origins: [] } })`.

**Interfaces:**
- Consumes: the Task 8 test hooks, `makeXlsx` from `src/lib/ingest/test-workbooks.ts` (importable from e2e), and the real files (skip when absent).

**Paths to walk (the Phase 2 user flow, every box and arrow that Part A delivers):**
1. **Read error blocked:** a workbook with "Brand Name: Lux Soap" shows a red error. Publish is disabled.
2. **Not his file refused:** a plain workbook shows "This is not one of the usual Media Mind files."
3. **Unsure, admin picks:** a calendar without a Grand Total row shows "Needs a type". The admin picks "Activity Calendar", the row becomes Ready, and the warning is shown.
4. **Preview:** the real Savlon Soap file shows "ATL, Savlon Soap, Jul'25 to Oct'26". His file covers 16 months, from Jul'25.
5. **Cancel changes nothing:** Cancel, then Upload History has no new row.
6. **Publish several:** Savlon Soap plus Septex give a toast and two "In use" rows in History.
7. **Restore:** publish Savlon Soap again (with the "same file" warning shown), restore the older one, and the "In use" badge moves.
8. **Download:** the admin's Download link returns the file.
9. **Viewer:** sees History with no Restore or Download buttons, and the Upload tab says "Only the admin can upload".

- [ ] **Step 1: Write `e2e/phase2a-upload.spec.ts`.** Use `page.setInputFiles('input[type=file]', [{ name, mimeType, buffer }])` with buffers from `makeXlsx` or `fs.readFileSync(Asset/xlsx/…)`. Use `test.skip(!hasClientFiles, "client files not present")` for paths 4, 6 and 7. Use `test.describe.configure({ mode: "serial" })` because paths 6 and 7 build on each other.

- [ ] **Step 2: Run it.** Stop the preview dev server first, because Playwright starts its own on port 3100.
Run: `npx playwright test e2e/phase2a-upload.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run the whole e2e suite.**
Run: `npm run test:e2e`
Expected: all pass, including Phase 1's `phase1-access.spec.ts`. That spec's "viewer reads every page" list does not need `/data-entry`; add it there too, so viewers are proven to read the new page.

- [ ] **Step 4: Phone check.** Run the same spec once with `--project` set to a 375 px viewport, or add a phone-sized `test.use({ viewport: { width: 375, height: 812 } })` describe block for paths 4 and 9. Expected: PASS, with no horizontal page scroll (`document.documentElement.scrollWidth <= 375`).

- [ ] **Step 5: Commit.**
```bash
git add e2e/phase2a-upload.spec.ts e2e/phase1-access.spec.ts playwright.config.ts
git commit -m "test(e2e): Phase 2 Part A upload flow, every path"
```

---

## After the tasks (controller)

- Whole-branch final review (`requesting-code-review`). It must include a threat-model paragraph, because the branch adds a new upload endpoint, a download route and a raised body limit.
- Run `npm test`, `npm run test:e2e`, `npx tsc --noEmit` and `npm run lint`. Lint is already known to fail on `scripts/phase0/extract-client-xlsx.cjs` from Phase 1; report that and don't hide it.
- Tick the tracker: p2-01, p2-02, p2-03, p2-04, p2-05, p2-09, p2-13, p2-14, p2-15, p2-80, p2-81, p2-82, and p2-90 (with a note that the Part A paths are walked). Leave p2-06/07/08/10/11/12, p2-83 and p2-16 open for Part B.
- Finish: merge into `main` and push to `personal` (no PR).
