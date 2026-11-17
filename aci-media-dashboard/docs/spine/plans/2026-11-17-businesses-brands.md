# Businesses & Brands (Phase 2 Part C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin owns the business, brand and ATL category lists. They start empty, live in the store, and uploads ask about names that aren't on them instead of blocking or quietly using "Others".

**Architecture:** New store tables plus a `src/store/catalog.ts` module (the only code that writes the lists). Readers stay faithful to his app; a pure `src/lib/ingest/names.ts` pulls the business and brand names out of each read result, and the upload service compares them with the lists, asks for decisions, and on Publish saves list changes and new versions in one transaction. A new `/businesses` page edits the lists.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, Drizzle (SQLite dialect, `@libsql/client`), Vitest, Playwright, zod 4.

**Spec:** `docs/spine/specs/2026-11-17-businesses-brands-design.md` (approved 17 Nov 2026). **Builds on:** Phase 2 Parts A and B (main at f36dc41). **Branch:** `feat/businesses-brands`.

## Global Constraints

- App folder: `aci-media-dashboard/`. Run every command from there. Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before touching routes, server actions or pages.
- Lists start **empty**. `BRANDLIST`, `BALIAS`, `fullB` and `ATL_CATEGORIES` stay in the code only as **suggestions**: they pre-fill a field and never decide on their own.
- **Readers stay faithful.** Do not change any reader's data shape, rounding or messages, except where a task says so (ATL category and Digital business inputs). Every answer-key test stays green.
- **Name normalising** (one function, used everywhere): trim, collapse runs of whitespace to one space, lower-case. Max length 120 after trim; empty is invalid.
- **Slugs:** every business and ATL category has an immutable `slug` made from its name at creation: lower-case, non-letters/digits replaced by `-`, runs of `-` collapsed, trimmed of `-`, max 60; if taken, append `-2`, `-3`, … Renames never change a slug. Dataset keys use slugs: `digital:<business slug>`, `atl:<category slug>`.
- **Nothing changes until Publish.** Preview never writes. List decisions travel with Publish and are saved in the same transaction as the versions.
- Copy is plain, short English. Exact UI strings in this plan are verbatim.
- UI follows the Wix / Mixpanel reference style already used on Data Entry and Settings, built from the existing shared components. Check desktop and 375 px phone.
- Commits are small Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write the message to a temp file and use `git commit -F`. Never commit `netlify.toml`, `.env*`, `Asset/`, `.spine/`, `test-results/`, `e2e/.auth/`.
- A safety hook blocks a single shell command that mixes backticks or `$()` with `git` and merge/push/diff. Keep shell commands simple; edit files with the Edit tool.

**Security constraints (security-standard section 1; a violation is Critical):**
- **Authorisation:** every list change and every upload is authorised on the server. Server actions call `requireAdmin()` (`src/auth/admin.ts`) first. Upload routes keep their Part A order (admin check, Origin, Content-Length, streaming cap) before any body is read.
- **Untrusted input is validated on the server.** Decisions arrive as one JSON form field per file, parsed with zod. A decided name must be one the server itself found when it re-read that file; a "same as" target slug must exist and not be hidden; names are 1 to 120 characters after trim. Anything else is ignored, the same as an unknown `type-<i>`. Publishing re-reads the files and never trusts a preview.
- **Parameterised SQL only** (Drizzle query builder). No string-built SQL.
- **No leaks:** no secrets in code, logs or commits. User-facing errors never contain stack traces, file paths or SQL.
- **Mutation proof:** every admin check added in this plan gets a step that removes it and shows a test fails.
- Tests run only on `createTestStore()` (in-memory) and local client files; never on the real data folder or Neon.

---

## File structure and seams

- `src/store/schema.ts` + one generated migration in `drizzle-store/`: tables `business`, `brand`, `atl_category`, `name_match`.
- `src/store/catalog.ts` — **seam:** `normName`, `makeSlug`, `getCatalog`, the admin edit functions, and `applyCatalogChanges(tx, changes)`. Only this file writes the four tables.
- `src/store/datasets.ts` — adds `publishVersionsTx(tx, inputs)` (the existing body, exported) so a caller can publish inside its own transaction.
- `src/lib/ingest/names.ts` — **seam:** `namesIn(result)`: pure, no store.
- `src/lib/ingest/suggestions.ts` — **seam:** `suggestBusinessForBrand`, `suggestFullName`, `suggestAtlCategory`: pure, built on the old demo lists.
- `src/lib/ingest/readers/atl.ts`, `digital.ts`, `read-result.ts` — ATL takes its category from the context; Digital takes its business from the context.
- `src/server/ingest.ts` — the name check, decisions, preview fields, publish with list changes.
- `src/server/upload-form.ts` — reads `decisions-<i>`.
- `src/app/(modules)/data-entry/*` — the new preview controls.
- `src/app/(modules)/businesses/*` — the new page and its server actions.
- `src/components/shell/nav-items.ts` — the sidebar entry.

---

### Task 1: Catalog tables and the store module

**Files:**
- Modify: `src/store/schema.ts`
- Create: `drizzle-store/0002_*.sql` (generated), `src/store/catalog.ts`, `src/store/catalog.test.ts`

**Interfaces (produces):**
```ts
export type CatalogBusiness = { slug: string; name: string; hidden: boolean; names: string[] };          // names = every match name, own name first
export type CatalogBrand = { id: number; name: string; businessSlug: string; hidden: boolean; names: string[] };
export type CatalogAtl = { slug: string; name: string; businessSlug: string; ownBrand: string; hidden: boolean };
export type Catalog = {
  businesses: CatalogBusiness[]; brands: CatalogBrand[]; atl: CatalogAtl[];
  businessOf(name: string): CatalogBusiness | null;   // via name_match, hidden included
  brandOf(name: string): CatalogBrand | null;          // via name_match, hidden included
  atlOf(title: string): CatalogAtl | null;             // by normalised category name
};
export function normName(s: string): string;          // trim, collapse spaces, lower-case
export function cleanName(s: string): string;         // trim + collapse spaces; throws ValidationError("Names must be 1 to 120 characters.")
export async function getCatalog(store: Store | StoreTx): Promise<Catalog>;

export type CatalogChange =
  | { op: "addBusiness"; name: string }                                   // slug from makeSlug
  | { op: "businessSameAs"; name: string; slug: string }                   // adds a match name to an existing business
  | { op: "addBrand"; name: string; businessSlug: string; alsoMatches?: string[] }
  | { op: "addAtl"; name: string; businessSlug: string; ownBrand: string };
export async function applyCatalogChanges(tx: StoreTx, changes: CatalogChange[]): Promise<void>;  // in order; skips a change whose name already matches

export async function createBusiness(store: Store, name: string): Promise<{ slug: string }>;
export async function renameBusiness(store: Store, slug: string, name: string): Promise<void>;     // old name stays as a match
export async function setBusinessHidden(store: Store, slug: string, hidden: boolean): Promise<void>;
export async function createBrand(store: Store, businessSlug: string, name: string): Promise<{ id: number }>;
export async function renameBrand(store: Store, id: number, name: string): Promise<void>;
export async function setBrandHidden(store: Store, id: number, hidden: boolean): Promise<void>;
export async function setAtlCategory(store: Store, slug: string, input: { businessSlug: string; ownBrand: string }): Promise<void>;
export async function setAtlHidden(store: Store, slug: string, hidden: boolean): Promise<void>;
```

Schema (Drizzle SQLite, same style as `dataset`):
- `business`: `slug` text PK, `name` text not null, `hidden` integer boolean not null default false, `createdAt` timestamp_ms.
- `brand`: `id` integer PK autoincrement, `businessSlug` text not null references `business.slug`, `name` text not null, `hidden` boolean, `createdAt`.
- `atl_category`: `slug` text PK, `name` text not null, `normName` text not null **unique**, `businessSlug` text not null references `business.slug`, `ownBrand` text not null, `hidden` boolean, `createdAt`.
- `name_match`: `kind` text not null (check in ('business','brand')), `normName` text not null, `businessSlug` text null, `brandId` integer null; primary key (`kind`, `normName`); check: exactly one of `businessSlug` / `brandId` is set, matching the kind.

Errors (ValidationError, exact text):
- duplicate: `"<name>" is already used by <business|brand> "<existing name>".`
- unknown slug or id: `That business doesn't exist.` / `That brand doesn't exist.` / `That ATL category doesn't exist.`
- hidden target for a new brand: `That business is hidden. Show it first.`

- [ ] **Step 1: Write the failing tests** in `src/store/catalog.test.ts` with `createTestStore()`:
  - a new store has an empty catalog;
  - `createBusiness(" Hygiene ")` → slug `hygiene`, name `Hygiene`, `businessOf("HYGIENE")` finds it; a second "hygiene" throws the duplicate message;
  - `makeSlug` collision: business "Food & Beverage" → `food-beverage`; a later business "Food Beverage" → `food-beverage-2`;
  - rename keeps the old name: rename `hygiene` to "Hygiene Care"; `businessOf("Hygiene")` and `businessOf("hygiene care")` both find it; slug unchanged;
  - hidden business is still found by `businessOf` and has `hidden: true`; `createBrand` under it throws `That business is hidden. Show it first.`;
  - brand names are unique across businesses;
  - `applyCatalogChanges` in one transaction: `[addBusiness "SCJ", businessSameAs "ACI Salt"→salt, addBrand "Savlon Handwash" alsoMatches ["Savlon HW"] under toiletries, addAtl "Savlon Soap" toiletries own "Savlon Soap"]` → all present; `brandOf("savlon hw")` finds Savlon Handwash; `atlOf("SAVLON SOAP")` finds the category;
  - a failing change rolls back the whole transaction (second change references a missing slug → nothing from the first is saved);
  - a change whose name already matches is skipped, not an error (two files in one batch may add the same business).
- [ ] **Step 2: Run** `npx vitest run src/store/catalog.test.ts` → FAIL.
- [ ] **Step 3: Implement** the schema, then `npm run db:store:generate` (check the generated SQL creates the four tables and constraints; do not hand-edit other migrations), then `catalog.ts`. `getCatalog` loads all four tables in one go and builds Maps for the three lookups.
- [ ] **Step 4: Run** `npx vitest run src/store` and `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(store): business, brand and ATL category lists`

---

### Task 2: Names in each file, and suggestions

**Files:**
- Create: `src/lib/ingest/names.ts`, `names.test.ts`, `src/lib/ingest/suggestions.ts`, `suggestions.test.ts`

**Interfaces (produces):**
```ts
// names.ts
export type FileNames = {
  businesses: string[];                                   // distinct, as typed in the file (trimmed), from the file's business column
  brands: { name: string; business: string | null }[];   // distinct by normName; business = the row's business as typed, null when the file has none
  needsFileBusiness: boolean;                             // Digital and ATL: the business comes from the admin's pick
  atlTitle: string | null;                                // ATL "Brand Name:" title
};
export function namesIn(result: ReadResult<unknown>): FileNames;

// suggestions.ts (built on BRANDLIST, BALIAS, fullB, ATL_CATEGORIES)
export function suggestFullName(brand: string): string | null;          // fullB result when it differs from the input or is an official name
export function suggestBusinessForBrand(brand: string): string | null;  // businessOfBrand
export function suggestAtlCategory(title: string): { name: string; business: string; ownBrand: string | null } | null;
```

Per type, where the names are:
- `billing`: `data.bl` rows: business = row[2] (raw), brand = row[3]. Also `data.br` if it holds brand/business; read the reader to confirm.
- `billboard`: rows `biz` (raw), `b`.
- `calendar`: `data.months[].rows[]` `biz`, `b`.
- `fy`: rows `biz`, `b`.
- `digital`: `data.dig[]` `b`, business null, `needsFileBusiness: true`.
- `atl`: `atlTitle = data.title`; brands = only `data.own` (competitors are never brands); business null; `needsFileBusiness: true`.
- `ooh-sites`: rows `brand`, business null, `needsFileBusiness: false`.
- `channel`: nothing.
- Blank names and names that normalise to "others" or "total" are dropped.

- [ ] **Step 1: Write the failing tests.**
  - Synthetic `ReadResult`s for each type (small hand-built `data` objects of the right shape) check the rules above, including dedupe by `normName` and competitors excluded for ATL.
  - `describe.skipIf(!hasClientFiles)`: his real Billing file gives exactly these 13 businesses: Toiletries, Hygiene, Salt, Foods, SCJ, IB, Electrical, Beverage, Commodity, Rice, CB, CB Core, ACI Salt. Real FY includes Foods and Electrolyte. Real Billboard includes AI.
  - Suggestions: `suggestFullName("Savlon HW")` → "Savlon Handwash"; `suggestBusinessForBrand("Freedom")` → "Hygiene"; `suggestAtlCategory("Savlon Soap")` → `{ name: "Savlon Soap", business: "Toiletries", ownBrand: null }` (ownBrand is picked from the file's rows by the service); unknown inputs → null.
- [ ] **Step 2: Run** `npx vitest run src/lib/ingest/names.test.ts src/lib/ingest/suggestions.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/ingest` and `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(ingest): names in each file, and suggestions from the old lists`

---

### Task 3: ATL and Digital take their category and business from the context

**Files:**
- Modify: `src/lib/ingest/read-result.ts`, `readers/atl.ts`, `readers/atl.test.ts`, `readers/digital.ts`, `readers/digital.test.ts`, `readers/calendar.test.ts` only if it calls the ATL table, `src/lib/ingest/brands.ts`

**Interfaces:**
```ts
// read-result.ts
export type ReaderContext = {
  fileName: string;
  business?: { slug: string; name: string } | null;                                       // Digital: required, else NeedsBusinessError
  atlCategory?: { slug: string; name: string; business: string; ownBrand: string } | null; // ATL: required, else NeedsCategoryError
};
export class NeedsCategoryError extends Error { constructor(public title: string) { super("New ATL category."); this.name = "NeedsCategoryError"; } }
export type ReadResult<T> = { /* unchanged fields */ business?: { name: string; source: BusinessSource } };
// brands.ts: BusinessSource stays "brands" | "file name" | "admin"; DIGITAL_BUSINESSES, isDigitalBusiness and resolveDigitalBusiness are removed (moved to the service in Task 4).
// atl.ts
export function readAtlTitle(wb: Workbook): string;   // the "Brand Name:" title; throws the existing ReadError when missing
export { ATL_CATEGORIES };                            // exported for suggestions.ts
// digital.ts
export function digitalBrands(wb: Workbook): string[]; // today's brandsIn, exported
```

ATL behaviour:
- The reader no longer looks up `ATL_CATEGORIES`. With no `ctx.atlCategory` it throws `NeedsCategoryError(title)`.
- With one: `datasetKey: atl:<slug>`, label/summary/`data.name` use `ctx.atlCategory.name`, `data.biz` = `ctx.atlCategory.business`, `own` = brand rows whose `normName` equals `normName(ctx.atlCategory.ownBrand)`. The "Couldn't find …'s own row" warning stays, worded with the category name.
- The old "doesn't match any ATL category" ReadError is deleted.

Digital behaviour:
- With no `ctx.business` it throws `NeedsBusinessError("Pick the business.")`.
- With one: `datasetKey: digital:<slug>`, label `Digital, <name>, …`, every row's `bz` = name.

- [ ] **Step 1: Update the tests first.**
  - Answer-key tests pass the context his app implied: build it from `ATL_CATEGORIES` for ATL (slug = his key, e.g. `soap`; ownBrand = the first brand row matching his own-brand rule) and `{ slug: "hygiene", name: "Hygiene" }` etc. for Digital. They must stay green with the same data.
  - New tests: ATL without context throws `NeedsCategoryError` with the title; ATL with a made-up category "Lux Soap" (business "Toiletries", ownBrand "Lux") reads, key `atl:lux-soap`, own `["Lux"]`; Digital without business throws `NeedsBusinessError`.
- [ ] **Step 2: Run** `npx vitest run src/lib/ingest` → the new tests FAIL.
- [ ] **Step 3: Implement.** Keep `ATL_CATEGORIES` in `atl.ts` (exported) for suggestions; nothing else reads it.
- [ ] **Step 4: Run** `npx vitest run src/lib/ingest` and `npx tsc --noEmit`. `src/server` will not compile yet where it imported the removed names: fix only the imports needed for tsc by moving them in Task 4's direction (Task 4 owns the behaviour); if that is more than import changes, leave `src/server` failing and say so in the report.
- [ ] **Step 5: Commit** `refactor(ingest): ATL category and Digital business come from the caller`

---

### Task 4: Name check and decisions in the upload service

**Files:**
- Modify: `src/server/ingest.ts`, `src/server/ingest.test.ts`, `src/server/upload-form.ts`, `src/app/api/uploads/upload-routes.test.ts`, `src/store/datasets.ts`

**Interfaces:**
```ts
// ingest.ts
export const DecisionsSchema = z.object({
  business: z.string().max(120).nullish(),                                   // file business pick (Digital, ATL): an existing slug, or "new:<name>"
  businesses: z.array(z.object({ name: z.string().max(120), action: z.enum(["new", "same"]), slug: z.string().max(60).nullish() })).max(200).default([]),
  atl: z.object({ business: z.string().max(120), ownBrand: z.string().max(120) }).nullish(),   // business: slug or "new:<name>"
  brands: z.array(z.object({ name: z.string().max(120), fullName: z.string().max(120), business: z.string().max(120) })).max(500).default([]), // business: slug or "new:<name>"
});
export type Decisions = z.infer<typeof DecisionsSchema>;
export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null; decisions?: Decisions | null };
export type NewName = { name: string; suggestion: string | null };
export type FilePreview = {
  /* existing fields, minus the Digital-only ones */
  business: { slug: string | null; name: string } | null;            // the file's business when it has one (Digital, ATL)
  businessSource: BusinessSource | null;
  needsBusiness: boolean;                                             // Digital / ATL with no business yet
  newBusinesses: NewName[];                                           // undecided business names from the file
  newCategory: { title: string; suggestion: { business: string | null; ownBrand: string | null }; brands: string[] } | null; // ATL, undecided; brands = rows to pick "Our brand" from
  newBrands: { name: string; business: string | null; suggestion: string | null }[]; // not on the list; never blocks
  pendingChanges: CatalogChange[];                                    // what Publish will add for this file, after valid decisions
};
// datasets.ts
export async function publishVersionsTx(tx: StoreTx, inputs: PublishInput[]): Promise<number[]>;
// upload-form.ts: reads `decisions-<i>` (JSON string), parses with DecisionsSchema.safeParse; invalid JSON or schema → null (ignored).
```

Service rules (in `prepareAll`, which now loads `getCatalog(store)` once per batch):
- **File business (Digital, ATL):** decided in this order: a valid `decisions.business` (an existing, not hidden slug, or `new:<name>` with a valid name), else every brand in the file matching one business in the catalog (`source: "brands"`), else exactly one catalog business name found in the file name (`source: "file name"`, warning "Business taken from the file name."). None → `needsBusiness: true`, block "Pick the business." (grey, no error). For `new:<name>`, `pendingChanges` gets `addBusiness`, and the reader gets `{ slug: makeSlug(name, taken), name }`.
- **ATL category:** `readAtlTitle`; `catalog.atlOf(title)` found → pass it. Not found: with valid `decisions.atl` (business resolvable as above; ownBrand one of the file's brand rows by `normName`) → `pendingChanges` gets `addAtl` (+ `addBusiness` when new) and the reader gets the category; else `newCategory` is set (suggestion from `suggestAtlCategory`; ownBrand suggestion = the brand row whose `normName` equals the suggested name or the title), block "Add the new ATL category." (grey).
- **Business names (files with a business column):** every name from `namesIn` not found by `catalog.businessOf`:
  - a valid decision `{ action: "new" }` → `addBusiness`;
  - `{ action: "same", slug }` where `slug` is an existing not-hidden business, or the slug a name decided "new" in this same file will get → `businessSameAs` (ordered after that `addBusiness`);
  - else it stays in `newBusinesses`. Its `suggestion`: "Salt" for "ACI Salt", "Food & Beverage" for "Foods", "Food" and "Beverage", the name itself when it normalises to one of the 4 demo businesses (Toiletries, Hygiene, Salt, Food & Beverage), else null.
  - Any left → block "Decide the new businesses." (grey).
- **Decisions about names not in the file are ignored.** A decision name must `normName`-equal a name the server found.
- **Brands:** every brand from `namesIn` not found by `catalog.brandOf` and not covered by a valid `decisions.brands` entry → `newBrands` (suggestion = `suggestFullName`). Warning (never blocks): `"<n> brand(s) not on your list."` — singular "brand" for 1. A valid brand decision → `addBrand` with `alsoMatches: [name]` when `fullName` differs, under its business (an existing not-hidden slug, a business added in this same file, or `new:<name>`).
- **Batch:** two files adding the same new business are fine (Task 1 skips duplicates). Two files for one dataset still block, as today.
- **Publish:** re-read everything (as today), refuse if any file is blocked, then in **one** `store.transaction`: `applyCatalogChanges(tx, allPendingChanges)` then `publishVersionsTx(tx, inputs)`. Return as today.
- **Notes from Tasks 1 and 2 (binding):**
  - The real signature is `makeSlug(name, taken: (slug) => boolean, fallback: "business" | "atl")` (exported from `src/store/catalog.ts`). Predict slugs with it against the catalog's slugs plus the slugs already predicted in this batch, so two new names with the same slug base get `-2`.
  - `applyCatalogChanges` returns `{ businessSlugs, atlSlugs }` (keyed by `normName`) only for rows it **created**. If a predicted slug is missing there because the name already matched (the list changed between preview and Publish), look the slug up with `getCatalog(tx)` inside the same transaction; if it differs from the predicted one, rebuild that file's `datasetKey` with the real slug before `publishVersionsTx`.
  - The store already refuses a hidden business for `businessSameAs`, `addAtl`, `addBrand` and `setAtlCategory`; the service must still filter hidden targets out first, so a hidden target is ignored, not an error.
  - `normName` lives in `src/lib/names-normal.ts` (re-exported by `catalog.ts`). `suggestAtlCategory(...).business` is `string | null` and never "Others".
  - The FY reader fills a fixed business list when the file has no business summary table (its warning "Business summary table not found; used the standard business order"). When that warning is present, do not offer those business names as new businesses; treat the FY rows as having no business (brands then need a business in Review and add).

- [ ] **Step 1: Write the failing tests** in `src/server/ingest.test.ts` (in-memory store, synthetic workbooks via `makeXlsx`, plus `skipIf(!hasClientFiles)` real files):
  - empty catalog + Digital file → `needsBusiness`, blocked "Pick the business."; with `decisions.business: "new:Hygiene"` → Ready, key `digital:hygiene`, `pendingChanges` has `addBusiness Hygiene`; preview wrote nothing (`getCatalog` still empty);
  - publish of that file → catalog has Hygiene, history has the version; a forced failure in `publishVersionsTx` (spy throwing) leaves the catalog empty (one transaction);
  - real Billing file, empty catalog → `newBusinesses` has the 13 names, blocked "Decide the new businesses."; decisions "new" for all → Ready; decision `{ name: "ACI Salt", action: "same", slug: "salt" }` when Salt exists → `businessSameAs`;
  - a decision for a name not in the file is ignored; `same` to a hidden or unknown slug is ignored;
  - ATL file "Brand Name: Lux Soap" with empty catalog → `newCategory.title === "Lux Soap"`, blocked "Add the new ATL category."; with `decisions.atl: { business: "new:Toiletries", ownBrand: "Lux" }` → Ready, key `atl:lux-soap`, own `["Lux"]`; `ownBrand` not among the rows → ignored;
  - brands: Billing with businesses decided but no brand decisions → Ready with warning "N brands not on your list."; one brand decision with fullName → `addBrand` with `alsoMatches`;
  - an existing catalog business is matched case-insensitively and adds no change.
  - `upload-routes.test.ts`: `decisions-0` JSON reaches the service; malformed JSON is ignored; the admin/Origin/size order is unchanged.
- [ ] **Step 2: Run** `npx vitest run src/server src/app/api/uploads` → FAIL.
- [ ] **Step 3: Implement.** Keep `prepareFile` pure (it now receives the `Catalog` snapshot as an argument).
- [ ] **Step 4: Mutation proof.** Remove the "decision name must be found in the file" check: a test fails. Restore.
- [ ] **Step 5: Run** `npx vitest run` (whole suite) and `npx tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** `feat(ingest): uploads ask about businesses, brands and ATL categories not on the list`

---

### Task 5: Data Entry preview controls

**Files:**
- Modify: `src/app/(modules)/data-entry/upload-box.tsx`, `logic.ts`, `logic.test.ts`, `page.tsx` (passes the catalog's visible businesses to the box)

**Interfaces:**
- Consumes: `FilePreview` from Task 4; `getCatalog` (server side, in `page.tsx`) → `businesses: { slug, name }[]` (not hidden) as a prop.
- Produces: `uploadForm(files, types, decisions)` where `decisions: (Decisions | null)[]` sets `decisions-<i>` = `JSON.stringify(d)` only where `d` has any content.

UI (exact strings):
- **Business select** on Digital and ATL rows: aria-label `Business for <file name>`, empty option `Pick the business…`, the visible businesses, then `New business…` which shows a text box (aria-label `New business name for <file name>`) and sends `new:<name>`.
- **New businesses** block on a row with `newBusinesses`: chip `New business` (amber, `bg-amber-100 text-amber-900`); one line per name: the name, a select (aria-label `Decision for <name>`) with options `Add as new` and `Same as <business>` for each visible business and each business being added in this row; button `Add all as new` when 2 or more names.
- **New ATL category:** chip `New category` (amber); text `New category found: <title>`; `Business` select (as above, pre-filled from the suggestion when it names a visible business, else `New business…` pre-filled with the suggested name); `Our brand` select of `newCategory.brands`, pre-filled from the suggestion; button `Add category`.
- **New brands:** the warning line comes from the server. A button `Review and add` opens a panel: one line per brand: tick box (aria-label `Add <name>`), full name text box pre-filled with the suggestion or the name (aria-label `Full name for <name>`), business (read-only when known from the row or file; a select when null, e.g. OOH). Buttons `Tick all` and `Done`.
- Any decision change re-runs the preview for all files, like a type change.
- `rowStatus` adds `"new-business"` and `"new-category"` (amber chips above); they block `canPublishAll`.
- Decisions are kept per row and dropped when the row is removed, the list is cleared, or the row's type changes.

- [ ] **Step 1: Write the failing tests** in `logic.test.ts`: `uploadForm` sets `decisions-1` only for the row with decisions and leaves others unset; `rowStatus` returns `new-business` / `new-category`; `canPublishAll` false while any row has either; a helper `addAllAsNew(preview)` returns decisions marking every `newBusinesses` name `new`.
- [ ] **Step 2: Run** `npx vitest run "src/app/(modules)/data-entry"` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the data-entry tests, `npx tsc --noEmit`, `npx eslint "src/app/(modules)/data-entry"` → PASS.
- [ ] **Step 5: Commit** `feat(data-entry): decide new businesses, ATL categories and brands in the preview`

---

### Task 6: Businesses & Brands page

**Files:**
- Create: `src/app/(modules)/businesses/page.tsx`, `[slug]/page.tsx`, `actions.ts`, `actions.test.ts`
- Modify: `src/components/shell/nav-items.ts` (add `{ href: "/businesses", label: "Businesses & Brands", group: "Data" }` after Uploads & History), its test if one checks the list

**Interfaces:**
- Consumes: Task 1's `getCatalog`, `createBusiness`, `renameBusiness`, `setBusinessHidden`, `createBrand`, `renameBrand`, `setBrandHidden`, `setAtlCategory`, `setAtlHidden`; `requireAdmin`, `isAdmin`, `toActionError`, `ActionState`.
- Produces: server actions `createBusinessAction`, `renameBusinessAction`, `setBusinessHiddenAction`, `createBrandAction`, `renameBrandAction`, `setBrandHiddenAction`, `setAtlCategoryAction`, `setAtlHiddenAction`, each `(prev: ActionState, fd: FormData) => Promise<ActionState>`, each calling `requireAdmin()` first, then `revalidatePath("/businesses")` (and the slug page).

UI (exact strings):
- List page title `Businesses & Brands`, subtitle `The businesses and brands your uploads are matched against.`
- Table columns: `Business`, `Brands`, `ATL categories`, and a status tag `Hidden`. Admin: button `Add business` (dialog: `Business name`, `Add`), per row `Rename`, `Hide` / `Show`.
- Empty state: `No businesses yet. Add one here, or upload a file and add the businesses it contains.`
- Business page title = business name, with `Also matches: <names>` when it has more than its own name. Brand table: `Brand`, `Also matches`, status `Hidden`; admin: `Add brand` (dialog `Brand name`), `Rename`, `Hide` / `Show`. ATL table: `Category`, `Our brand`; admin `Change` (dialog `Business`, `Our brand` text), `Hide` / `Show`.
- Viewers see everything with no buttons and no dialogs.
- Errors from the store show as the form error (the store's plain messages).

- [ ] **Step 1: Write the failing tests** in `actions.test.ts` (mock `next/headers` cookies and the store the way `src/app/api/backup/route.test.ts` does, so the real `isAdmin` runs): a viewer gets the not-allowed error from every action and nothing changes; the admin creates, renames, hides a business and a brand; a duplicate name returns the store's message.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the actions and pages.
- [ ] **Step 4: Mutation proof.** Remove `requireAdmin()` from `createBusinessAction`: the viewer test fails. Restore.
- [ ] **Step 5: Run** `npx vitest run "src/app/(modules)/businesses" src/components`, `npx tsc --noEmit`, `npx eslint "src/app/(modules)/businesses"` → PASS.
- [ ] **Step 6: Commit** `feat(businesses): Businesses & Brands page`

---

### Task 7: Browser tests for the new flow

**Files:**
- Modify: `e2e/phase2a-upload.spec.ts` (path 1: "Lux Soap" now shows `New category`, not a read error; replace it with a real read error: an ATL sheet with the "Brand Name:" line but no "Brand Name"/"Brand" header row → `Can't publish`), `e2e/phase2b-upload.spec.ts` (empty lists: Digital rows need a business first; use `New business…`)
- Create: `e2e/phase2c-names.spec.ts`

**Paths (phase2c):**
1. Empty list: `/businesses` shows the empty state.
2. Real Billing file: row shows `New business` with 13 names; `Add all as new`; then set `ACI Salt` to `Same as Salt` (after Salt exists, i.e. re-preview) ; row Ready with the brands warning; Publish; `/businesses` lists the businesses, and Salt shows `Also matches: ACI Salt`.
3. Lux Soap ATL synthetic file: `New category found: Lux Soap`; pick business `Toiletries`, Our brand `Lux`; `Add category`; Ready; Publish; Toiletries page lists category Lux Soap.
4. Review and add: an Activity Calendar synthetic file (built like phase2a path 3, with a Grand Total row) whose row is business "Toiletries", brand "Savlon HW". (Not Digital: his Digital reader turns every Savlon name into "Savlon Soap", so a short Savlon name never reaches the preview.) Decide Toiletries as new; `Review and add` suggests `Savlon Handwash`; tick and Publish; the brand appears with `Also matches: Savlon HW`; uploading the same file again shows no brand warning and no new business.
5. Cancel changes nothing: decide a new business, then Clear; `/businesses` unchanged.
6. Viewer sees `/businesses` with no buttons.
7. Phone 375 px: the new-business block and `/businesses` fit with no side scroll.

Real-file paths use `test.skip(!hasClientFiles, ...)`.

- [ ] **Step 1: Write and update the specs**; run each until green: `npx playwright test e2e/phase2a-upload.spec.ts e2e/phase2b-upload.spec.ts e2e/phase2c-names.spec.ts`.
- [ ] **Step 2: Run `npm run test:e2e`** and report per file. Known failures not from this branch: `plan.spec.ts`, `sample-data.spec.ts` (Neon dev data) and `phase1-access` "viewer sees a Login button" (fails on main too).
- [ ] **Step 3: Commit** `test(e2e): Businesses & Brands upload paths`

---

## Controller-only step (not a subagent task)

After Task 7: update the Phase 2 flow on the user flow artifact (https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h) with the box approved in the spec, section 9, and add a short Businesses & Brands flow. Then the manual walk with Sadril.
