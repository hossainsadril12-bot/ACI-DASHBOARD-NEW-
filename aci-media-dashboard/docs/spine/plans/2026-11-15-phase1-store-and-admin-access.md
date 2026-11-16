# Phase 1: Store and Admin Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Media Mind its own one-file SQLite store and a single admin sign-in, so that anyone with the link reads every page while only the signed-in admin can change data or download a backup.

**Architecture:** A new `src/store/` module owns one SQLite file (via `@libsql/client` + Drizzle's SQLite dialect) holding datasets with version history, original upload files, settings, admin sessions and the sign-in lock. A new `src/auth/` module owns identity: bcrypt password check, 5-tries/10-minutes lock, database-backed session tokens in an HttpOnly cookie, and `requireAdmin()`, which every write server action calls first. The existing Neon-backed pages keep working unchanged until later phases replace them; Phase 1 only adds the guard in front of their writes.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents: true`), React 19, TypeScript, Drizzle ORM 0.45 (`drizzle-orm/libsql`, `drizzle-orm/sqlite-core`), `@libsql/client`, `bcryptjs`, Vitest 5, Playwright.

**Approved inputs:** `docs/design-summary-2026-11-15.md` (approved 15 Nov 2026), `docs/build-plan-2026-11-15.md` (Phase 1), user flows https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h (Phase 1 flow), `.spine/config.md`.

---

## Login design (for Sadril's OK before Tasks 4 to 8 are built)

- Viewers never sign in. Every page is readable.
- One admin account. User name `ADMIN_USER` and password hash `ADMIN_PASSWORD_HASH` live only in the server's `.env.local`, never in git. The hash is made with `npm run admin:hash` (bcrypt, cost 12). Sadril or the server owner types the password; Claude never sees it.
- Sign-in page at `/sign-in`. Five wrong tries in a row lock sign-in for 10 minutes. The lock is saved in the store, so a restart does not clear it. A right password during the lock is still refused.
- On success the server creates a random session token (32 bytes). Only its SHA-256 is stored. The browser keeps it in an `HttpOnly; Secure; SameSite=Lax` cookie for 8 hours. "Sign out" deletes it on the server and in the browser.
- Every write action checks the session on the server first (`requireAdmin()`). A viewer who tries to write gets "Only the admin can change data. Please sign in." and nothing is touched. Hiding buttons is never the protection.
- "Download backup" (admin only) gives one `.db` file, which holds everything including the original uploads. Restore is a command we run on the server with the app stopped, not a button.
- Per-person access is designed in as one policy function (`can()`) but switched off.
- Known trade-off: anyone can lock the admin out for 10 minutes by typing 5 wrong passwords. Existing admin sessions keep working during a lock.

## Decisions taken while planning (differ from earlier notes)

- **Driver: `@libsql/client` instead of `better-sqlite3`.** Windows Application Control on the dev machine blocked `better-sqlite3`'s native binary. libsql loaded fine, uses the stable N-API (works on Node 22 to 26), is auto-externalised by Next.js, and is async, so its queries are not frozen into prerendered pages. It is still one SQLite file.
- **Original uploads (and later photos) are stored inside the SQLite file as BLOBs,** not in a folder. This makes "Download backup gives one file" true. The approved summary said "a folder for photos and original uploads". This plan changes that detail for the one-file backup, and it needs Sadril's OK with the plan.
- **Password hashing: bcrypt (`bcryptjs`, pure JavaScript).** Spine's security standard requires bcrypt or Argon2id. The pure-JS build avoids native binaries that the dev machine blocks. The hash is stored base64url-encoded behind a `bcrypt:` prefix, because `.env` loading expands `$` signs.

## Global Constraints

- Node `>=22.12` (package.json `engines`). Dev machine runs Node 26.10.
- Next.js 16.4.3 with `cacheComponents: true`: reading `cookies()` must sit inside a `<Suspense>` boundary; never call `cookies()` inside `"use cache"`. Read `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` before touching auth UI.
- Middleware is `src/proxy.ts` in Next 16. Do not add auth there; authorise in each server action and route handler.
- The store file lives in `MEDIA_MIND_DATA_DIR`, never inside `src/`, `public/` or `.next/`.
- Old Neon code (`src/db/**`, `src/server/**`) is not modified in Phase 1, except that action files gain `requireAdmin()`.
- UI: every screen follows the client's reference styles, Wix dashboard and Mixpanel (`../docs/spine/plans/2026-11-02-plan-9-mixpanel-wix-ui.md`), using the existing components (`Card`, `Input`, `Label`, `Button`, pill buttons, dark toasts). The sign-in page and the top-bar admin status are checked with desktop and phone screenshots.
- Copy: plain English, short sentences. Refusal text exactly `Only the admin can change data. Please sign in.`
- Tests: unit tests use an in-memory store (`:memory:`). E2E uses a fresh temp data dir and a test-only admin on port 3100. No test touches a real data dir.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

**Security constraints (Spine security standard, section 1, verbatim where this plan's code touches them):**
1. **No secrets in code.** API keys, tokens, passwords, signing secrets and connection strings live only in git-ignored env files and the host's secret store. Never in source, tests, docs, fixtures, client bundles or commit history.
2. **Server env never reaches the client.** Only variables explicitly meant for the browser (e.g. a `VITE_` / `NEXT_PUBLIC_` prefix) are bundled. A server secret behind a public prefix is a leak.
3. **Every route is authenticated and authorised on the server.** Token verification, then (where the project sells products or plans) the subscription check, then the role check, then the handler. Admin routes check an audited admin list where one exists, or an explicit admin role. No route relies on the client hiding a button.
5. **One owner of identity.** Where identity is a separate service, only it creates users, sets roles or touches passwords, and products read identity and never write it. In a single app, identity writes live in one module. A role removal takes effect on the next request.
6. **Parameterised queries only.** No string-built SQL. Never interpolate a JS array or user value into a SQL template. Database roles follow least privilege, one role per product where the platform allows.
7. **Passwords hashed with bcrypt (cost ≥ 10) or Argon2id.** Never stored or logged in clear text. Reset tokens are single-use and expire.
9. **Input is validated on the server, and the database enforces key invariants itself.** CHECK, NOT NULL, UNIQUE and FK constraints for rules that must never break, so a route that forgets is still refused. Uploads: size cap enforced while reading, content type detected from the bytes, never trusted from the client.
11. **Tests never touch production.** Every test refuses to run unless the database is the named development target. Tests create their own tenants or use fixed test tenants. They never discover "another org", because that can land on a real customer.
12. **No production action without the owner's explicit OK.** Queries, writes, migrations, deploys and pushes included. Read-only is not a licence.
13. **No claim without proof.** A security fix is reported as fixed only when a test demonstrates it.

Per-task section 2 checklist items:
- Task 0: no secret in the diff.
- Task 5: identity writes in one module (`src/auth/`); session cookie is HttpOnly, Secure and SameSite=Lax.
- Task 6: the `/api/backup` route and the sign-in action sit behind the gate chain; the sign-in endpoint is rate-limited by the lock; refusals return a plain message with no stack trace; security headers (HSTS, `X-Frame-Options`, `X-Content-Type-Options: nosniff`, a Content-Security-Policy with `frame-ancestors 'none'`).
- Task 7: every write action is guarded, with a mutation proof.
- Tasks 1 and 4: two new dependencies (`@libsql/client`, `bcryptjs`). Run `npm audit --omit=dev` and report any High or Critical advisory.

---

## File structure and seams

```
src/store/                      SEAM: the only module that opens the SQLite file
  schema.ts                     tables: meta, setting, upload_file, dataset_version, dataset, admin_session, login_lock
  client.ts                     openStore(url), getStore(), toFileUrl(path), type Store, type StoreTx
  assert-store-env.ts           assertStoreEnv(env, cwd) -> { dataDir, adminUser, adminPasswordHash }
  test-store.ts                 createTestStore() for unit tests
  settings.ts                   getUsdRate(store), setUsdRate(store, rate)
  files.ts                      saveFile(db, {name, bytes}), getFile(store, id), MAX_FILE_BYTES
  datasets.ts                   publishVersion, getActiveData, listHistory, restoreVersion
  backup.ts                     createBackup(store) -> Buffer, backupFileName(now)
  restore.ts                    restoreBackupFile(dataDir, backupPath, now)   (used by a CLI only)
src/auth/                       SEAM: the only module that touches passwords, sessions or the lock
  password.ts                   hashPassword(plain), verifyPassword(plain, stored)
  lockout.ts                    getLockState, recordFailure, clearFailures, MAX_TRIES, LOCK_MS
  session.ts                    createSession, isValidSession, deleteSession, SESSION_COOKIE, SESSION_MS
  sign-in.ts                    attemptSignIn(store, admin, input, now) -> SignInResult
  policy.ts                     can(viewer, action), PER_PERSON_ACCESS = false
  admin.ts                      isAdmin(), requireAdmin(), NotAdminError, NOT_ADMIN_MESSAGE  (Next-bound: reads cookies())
src/app/sign-in/                page.tsx, sign-in-form.tsx, actions.ts (signInAction, signOutAction)
src/app/api/backup/route.ts     GET: admin-only backup download
src/components/shell/admin-status.tsx   "Admin sign in" link or "Admin · Download backup · Sign out"
scripts/hash-password.ts        npm run admin:hash
scripts/restore-backup.ts       npm run store:restore -- <file>
drizzle.store.config.ts, drizzle-store/   store migrations
```

---

### Task 0: Remove the leaked Neon API key from `.env.example` and add the new variable names

Needs Sadril's OK (tracker task `px-01`). The working copy of the tracked file `.env.example` has a Neon API key on its last line. It must never be committed.

**Files:**
- Modify: `.env.example` (the last line `NeonApi: napi_…` is deleted)

**Interfaces:**
- Produces: documented env names `MEDIA_MIND_DATA_DIR`, `ADMIN_USER`, `ADMIN_PASSWORD_HASH`.

- [ ] **Step 1: Replace the file content**

Write `.env.example` as exactly:

```
# Pulled by `neon checkout dev` / `neon env pull` into .env.local. Never commit real values.
DATABASE_URL=
DATABASE_URL_UNPOOLED=
NEON_BRANCH=
# App guards: endpoint id of the Neon branch this app may use (e.g. ep-example-123456)
NEON_EXPECTED_ENDPOINT=
# Endpoint id of the Neon dev branch; e2e tests refuse to run unless it equals NEON_EXPECTED_ENDPOINT
NEON_DEV_ENDPOINT=

# Media Mind store: folder that holds media-mind.db. Must be outside src/, public/ and .next/ (e.g. ../media-mind-data)
MEDIA_MIND_DATA_DIR=
# The one admin. Make the hash with: npm run admin:hash
ADMIN_USER=
ADMIN_PASSWORD_HASH=
```

- [ ] **Step 2: Prove no key remains**

Run: `git diff --stat .env.example && grep -c "napi_" .env.example`
Expected: grep prints `0`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: drop leaked key line from env example, add store and admin names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Remind Sadril: rotate the Neon API key in the Neon console (tracker `px-02`). The old key was only in the working copy, never committed, but it was pasted into a chat.

---

### Task 1: Store foundation (schema, client, migrations, boot assertion)

**Files:**
- Modify: `package.json` (dependency `@libsql/client`; script `db:store:generate`)
- Create: `drizzle.store.config.ts`, `src/store/schema.ts`, `src/store/client.ts`, `src/store/assert-store-env.ts`, `src/store/test-store.ts`
- Generated: `drizzle-store/0000_*.sql`, `drizzle-store/meta/*`
- Test: `src/store/client.test.ts`, `src/store/assert-store-env.test.ts`

**Interfaces:**
- Produces:
  - `type Store = LibSQLDatabase<typeof schema>`
  - `type StoreTx = Parameters<Parameters<Store["transaction"]>[0]>[0]`
  - `openStore(url: string): Promise<Store>`: opens, sets pragmas, migrates, writes `meta.app = "media-mind"`
  - `getStore(): Promise<Store>`: process-wide singleton from `MEDIA_MIND_DATA_DIR`
  - `toFileUrl(filePath: string): string`
  - `STORE_FILE = "media-mind.db"`, `APP_ID = "media-mind"`
  - `assertStoreEnv(env, cwd?): { dataDir: string; adminUser: string; adminPasswordHash: string }`
  - `createTestStore(): Promise<Store>`
  - tables `meta, setting, uploadFile, datasetVersion, dataset, adminSession, loginLock`

- [ ] **Step 1: Install the driver and add the script**

Run: `npm install @libsql/client`
Then in `package.json` `"scripts"` add after `"db:setup"`:

```json
    "db:store:generate": "drizzle-kit generate --config drizzle.store.config.ts",
```

- [ ] **Step 2: Write the failing tests**

`src/store/assert-store-env.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertStoreEnv } from "./assert-store-env";

const cwd = path.resolve("/app/aci-media-dashboard");
const goodHash = "bcrypt:" + Buffer.from("$2b$12$" + "a".repeat(53)).toString("base64url");
const base = { MEDIA_MIND_DATA_DIR: "../media-mind-data", ADMIN_USER: "admin", ADMIN_PASSWORD_HASH: goodHash };

describe("assertStoreEnv", () => {
  it("returns the resolved data dir and admin settings", () => {
    expect(assertStoreEnv(base, cwd)).toEqual({
      dataDir: path.resolve(cwd, "../media-mind-data"),
      adminUser: "admin",
      adminPasswordHash: goodHash,
    });
  });

  it("refuses a missing data dir", () => {
    expect(() => assertStoreEnv({ ...base, MEDIA_MIND_DATA_DIR: "" }, cwd)).toThrow(/MEDIA_MIND_DATA_DIR is not set/);
  });

  it.each(["src/data", "public", ".next/store"])("refuses a data dir inside %s", (dir) => {
    expect(() => assertStoreEnv({ ...base, MEDIA_MIND_DATA_DIR: dir }, cwd)).toThrow(/must not be inside/);
  });

  it("refuses a missing admin user", () => {
    expect(() => assertStoreEnv({ ...base, ADMIN_USER: " " }, cwd)).toThrow(/ADMIN_USER is not set/);
  });

  it.each(["", "plain-password", "bcrypt:short", "$2b$12$abc"])("refuses a bad password hash %j", (h) => {
    expect(() => assertStoreEnv({ ...base, ADMIN_PASSWORD_HASH: h }, cwd)).toThrow(/ADMIN_PASSWORD_HASH/);
  });
});
```

`src/store/client.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataset, meta } from "./schema";
import { createTestStore } from "./test-store";
import { toFileUrl } from "./client";

describe("openStore", () => {
  it("creates every table and marks the file as Media Mind", async () => {
    const store = await createTestStore();
    const rows = await store.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`);
    const names = rows.map((r) => r.name);
    for (const t of ["admin_session", "dataset", "dataset_version", "login_lock", "meta", "setting", "upload_file"]) {
      expect(names).toContain(t);
    }
    expect(await store.select().from(meta)).toEqual([{ key: "app", value: "media-mind" }]);
  });

  it("enforces foreign keys", async () => {
    const store = await createTestStore();
    await expect(store.insert(dataset).values({ key: "x", kind: "x", activeVersionId: 999, updatedAt: new Date() })).rejects.toThrow();
  });

  it("builds forward-slash file URLs", () => {
    expect(toFileUrl("C:\\data dir\\media-mind.db")).toMatch(/^file:.*\/data dir\/media-mind\.db$/);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/store`
Expected: FAIL (`Cannot find module './assert-store-env'`, `./test-store`, `./client`).

- [ ] **Step 4: Write the schema**

`src/store/schema.ts`:

```ts
import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date();

/** Marks the file as a Media Mind store (key "app" = "media-mind"). */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** App settings such as the USD rate. Values are JSON. */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Original uploaded files, kept so they can be downloaded again and travel in the backup. */
export const uploadFile = sqliteTable("upload_file", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Every published version of every dataset: the Upload History. Never updated, never deleted. */
export const datasetVersion = sqliteTable(
  "dataset_version",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetKey: text("dataset_key").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    source: text("source", { enum: ["upload", "manual"] }).notNull(),
    summary: text("summary", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    fileId: integer("file_id").references(() => uploadFile.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [index("dataset_version_key_idx").on(t.datasetKey, t.id)],
);

/** One row per dataset (e.g. "billing", "atl:Savlon Soap"): which version the pages show. */
export const dataset = sqliteTable("dataset", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  activeVersionId: integer("active_version_id").notNull().references(() => datasetVersion.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Admin sessions. Only the SHA-256 of the cookie token is stored. */
export const adminSession = sqliteTable("admin_session", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** Wrong sign-in tries and the 10-minute lock. One row, key "admin". */
export const loginLock = sqliteTable("login_lock", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});
```

- [ ] **Step 5: Write the boot assertion**

`src/store/assert-store-env.ts`:

```ts
import path from "node:path";

export type StoreEnv = { dataDir: string; adminUser: string; adminPasswordHash: string };

const HASH_RE = /^bcrypt:[A-Za-z0-9_-]{60,}$/;

/** Fails loudly at start-up when the store or the admin is not configured safely. */
export function assertStoreEnv(env: Record<string, string | undefined>, cwd: string = process.cwd()): StoreEnv {
  const raw = env.MEDIA_MIND_DATA_DIR?.trim();
  if (!raw) throw new Error("MEDIA_MIND_DATA_DIR is not set. Point it at a folder outside the app, for example ../media-mind-data.");
  const dataDir = path.resolve(cwd, raw);
  for (const forbidden of ["src", "public", ".next"]) {
    const f = path.resolve(cwd, forbidden);
    if (dataDir === f || dataDir.startsWith(f + path.sep)) {
      throw new Error(`MEDIA_MIND_DATA_DIR must not be inside ${forbidden}/. Refusing to start.`);
    }
  }
  const adminUser = env.ADMIN_USER?.trim();
  if (!adminUser) throw new Error("ADMIN_USER is not set.");
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!HASH_RE.test(adminPasswordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH is missing or not a bcrypt hash. Create one with: npm run admin:hash");
  }
  return { dataDir, adminUser, adminPasswordHash };
}
```

- [ ] **Step 6: Write the client and the test helper**

`src/store/client.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";
import { assertStoreEnv } from "./assert-store-env";

export type Store = LibSQLDatabase<typeof schema>;
export type StoreTx = Parameters<Parameters<Store["transaction"]>[0]>[0];

export const STORE_FILE = "media-mind.db";
export const APP_ID = "media-mind";

/** libsql wants forward slashes, also on Windows ("file:C:/data dir/media-mind.db"). */
export function toFileUrl(filePath: string): string {
  return "file:" + path.resolve(filePath).split(path.sep).join("/");
}

/** Opens a store and brings its tables up to date. `url` is ":memory:" in tests. */
export async function openStore(url: string): Promise<Store> {
  const client = createClient({ url });
  if (url !== ":memory:") {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");
  const store = drizzle({ client, schema });
  await migrate(store, { migrationsFolder: path.join(process.cwd(), "drizzle-store") });
  await store.insert(schema.meta).values({ key: "app", value: APP_ID }).onConflictDoNothing();
  return store;
}

let storePromise: Promise<Store> | undefined;

/** The app's one store, opened once per server process. */
export function getStore(): Promise<Store> {
  if (!storePromise) {
    const { dataDir } = assertStoreEnv(process.env);
    fs.mkdirSync(dataDir, { recursive: true });
    storePromise = openStore(toFileUrl(path.join(dataDir, STORE_FILE))).catch((e: unknown) => {
      storePromise = undefined;
      throw e;
    });
  }
  return storePromise;
}
```

`src/store/test-store.ts`:

```ts
import { openStore, type Store } from "./client";

/** A fresh, empty, migrated store in memory. Never touches a real data dir. */
export function createTestStore(): Promise<Store> {
  return openStore(":memory:");
}
```

`drizzle.store.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/store/schema.ts",
  out: "./drizzle-store",
});
```

- [ ] **Step 7: Generate the migration**

Run: `npm run db:store:generate`
Expected: creates `drizzle-store/0000_<name>.sql` and `drizzle-store/meta/_journal.json`. Open the SQL and check that it has 7 `CREATE TABLE` statements and one `CREATE INDEX`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/store`
Expected: PASS (all tests in `assert-store-env.test.ts` and `client.test.ts`).

- [ ] **Step 9: Audit and commit**

Run: `npm audit --omit=dev` and note any High or Critical advisory for `@libsql/client` in the task report.

```bash
git add package.json package-lock.json drizzle.store.config.ts drizzle-store src/store
git commit -m "feat: one-file SQLite store with migrations and start-up check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Storage layer: settings, original files, datasets with history and restore

**Files:**
- Create: `src/store/settings.ts`, `src/store/files.ts`, `src/store/datasets.ts`
- Test: `src/store/settings.test.ts`, `src/store/datasets.test.ts`

**Interfaces:**
- Consumes: `Store`, `StoreTx`, `createTestStore()`, tables from Task 1; `ValidationError` from `@/server/errors`.
- Produces:
  - `DEFAULT_USD_RATE = 123`; `getUsdRate(store: Store): Promise<number>`; `setUsdRate(store: Store, rate: number): Promise<void>`
  - `MAX_FILE_BYTES = 60 * 1024 * 1024`; `saveFile(db: Store | StoreTx, input: { name: string; bytes: Buffer }): Promise<{ id: number; sha256: string }>`; `getFile(store: Store, id: number): Promise<{ name: string; bytes: Buffer } | null>`
  - `type DatasetSource = "upload" | "manual"`
  - `type PublishInput = { datasetKey: string; kind: string; label: string; source: DatasetSource; summary: Record<string, unknown>; data: unknown; file?: { name: string; bytes: Buffer } }`
  - `publishVersion(store: Store, input: PublishInput): Promise<{ versionId: number }>`
  - `type ActiveData<T> = { versionId: number; label: string; createdAt: Date; data: T }`; `getActiveData<T>(store: Store, datasetKey: string): Promise<ActiveData<T> | null>`
  - `type HistoryRow = { versionId: number; datasetKey: string; kind: string; label: string; source: DatasetSource; summary: Record<string, unknown>; fileId: number | null; fileName: string | null; createdAt: Date; isActive: boolean }`; `listHistory(store: Store, opts?: { datasetKey?: string; limit?: number }): Promise<HistoryRow[]>`
  - `restoreVersion(store: Store, versionId: number): Promise<{ datasetKey: string }>`

- [ ] **Step 1: Write the failing tests**

`src/store/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestStore } from "./test-store";
import { DEFAULT_USD_RATE, getUsdRate, setUsdRate } from "./settings";

describe("USD rate", () => {
  it("defaults to 123 BDT", async () => {
    expect(await getUsdRate(await createTestStore())).toBe(DEFAULT_USD_RATE);
    expect(DEFAULT_USD_RATE).toBe(123);
  });

  it("saves a new rate", async () => {
    const store = await createTestStore();
    await setUsdRate(store, 120.5);
    await setUsdRate(store, 121);
    expect(await getUsdRate(store)).toBe(121);
  });

  it.each([0, -1, 1001, Number.NaN])("refuses %s", async (rate) => {
    await expect(setUsdRate(await createTestStore(), rate)).rejects.toThrow(/USD rate must be/);
  });
});
```

`src/store/datasets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { uploadFile, datasetVersion } from "./schema";
import { createTestStore } from "./test-store";
import { getFile } from "./files";
import { getActiveData, listHistory, publishVersion, restoreVersion, type PublishInput } from "./datasets";

const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  datasetKey: "billing",
  kind: "billing",
  label: "Dashboard Media Final, 26 Oct 2026",
  source: "upload",
  summary: { rows: 2 },
  data: [{ business: "Hygiene", amount: 10 }],
  ...over,
});

describe("datasets", () => {
  it("returns null before anything is published", async () => {
    expect(await getActiveData(await createTestStore(), "billing")).toBeNull();
  });

  it("publishes a version and makes it active", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, input());
    const active = await getActiveData<{ business: string; amount: number }[]>(store, "billing");
    expect(active?.versionId).toBe(versionId);
    expect(active?.data).toEqual([{ business: "Hygiene", amount: 10 }]);
  });

  it("keeps the original file with the version", async () => {
    const store = await createTestStore();
    const bytes = Buffer.from("PK fake xlsx bytes");
    await publishVersion(store, input({ file: { name: "billing.xlsx", bytes } }));
    const [h] = await listHistory(store);
    expect(h.fileName).toBe("billing.xlsx");
    expect((await getFile(store, h.fileId!))?.bytes.equals(bytes)).toBe(true);
  });

  it("lists history newest first and marks the active one", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input({ label: "A" }));
    const b = await publishVersion(store, input({ label: "B" }));
    const h = await listHistory(store, { datasetKey: "billing" });
    expect(h.map((r) => [r.versionId, r.isActive])).toEqual([[b.versionId, true], [a.versionId, false]]);
  });

  it("restores an older version of that dataset only", async () => {
    const store = await createTestStore();
    const soapOld = await publishVersion(store, input({ datasetKey: "atl:Savlon Soap", kind: "atl", data: "soap-old" }));
    await publishVersion(store, input({ datasetKey: "atl:Savlon Soap", kind: "atl", data: "soap-new" }));
    await publishVersion(store, input({ datasetKey: "atl:Septex", kind: "atl", data: "septex" }));
    expect(await restoreVersion(store, soapOld.versionId)).toEqual({ datasetKey: "atl:Savlon Soap" });
    expect((await getActiveData(store, "atl:Savlon Soap"))?.data).toBe("soap-old");
    expect((await getActiveData(store, "atl:Septex"))?.data).toBe("septex");
  });

  it("refuses to restore a version that does not exist", async () => {
    await expect(restoreVersion(await createTestStore(), 42)).rejects.toThrow(/no longer exists/);
  });

  it("writes nothing when the file is refused", async () => {
    const store = await createTestStore();
    await expect(publishVersion(store, input({ file: { name: "empty.xlsx", bytes: Buffer.alloc(0) } }))).rejects.toThrow(/empty/);
    expect(await store.select().from(datasetVersion)).toEqual([]);
    expect(await store.select().from(uploadFile)).toEqual([]);
  });

  it("refuses a blank dataset key", async () => {
    await expect(publishVersion(await createTestStore(), input({ datasetKey: "  " }))).rejects.toThrow(/Dataset key/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/store/settings.test.ts src/store/datasets.test.ts`
Expected: FAIL (`Cannot find module './settings'`, `./datasets`, `./files`).

- [ ] **Step 3: Write `settings.ts`**

```ts
import { eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { setting } from "./schema";
import type { Store } from "./client";

export const DEFAULT_USD_RATE = 123;
const USD_RATE = "usd_rate";

/** BDT per USD, set by the admin. Used for every digital figure outside Digital Performance. */
export async function getUsdRate(store: Store): Promise<number> {
  const row = await store.query.setting.findFirst({ where: eq(setting.key, USD_RATE) });
  return typeof row?.value === "number" ? row.value : DEFAULT_USD_RATE;
}

export async function setUsdRate(store: Store, rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
    throw new ValidationError("USD rate must be a number between 0 and 1,000 BDT.");
  }
  const updatedAt = new Date();
  await store
    .insert(setting)
    .values({ key: USD_RATE, value: rate, updatedAt })
    .onConflictDoUpdate({ target: setting.key, set: { value: rate, updatedAt } });
}
```

- [ ] **Step 4: Write `files.ts`**

```ts
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { uploadFile } from "./schema";
import type { Store, StoreTx } from "./client";

export const MAX_FILE_BYTES = 60 * 1024 * 1024;

/** Keeps an original file inside the store, so the backup holds it too. */
export async function saveFile(db: Store | StoreTx, input: { name: string; bytes: Buffer }): Promise<{ id: number; sha256: string }> {
  if (input.bytes.length === 0) throw new ValidationError("The file is empty.");
  if (input.bytes.length > MAX_FILE_BYTES) throw new ValidationError("The file is larger than 60 MB.");
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [row] = await db
    .insert(uploadFile)
    .values({ name: input.name.slice(0, 255), sizeBytes: input.bytes.length, sha256, bytes: input.bytes })
    .returning({ id: uploadFile.id });
  return { id: row.id, sha256 };
}

export async function getFile(store: Store, id: number): Promise<{ name: string; bytes: Buffer } | null> {
  const row = await store.query.uploadFile.findFirst({ where: eq(uploadFile.id, id), columns: { name: true, bytes: true } });
  return row ? { name: row.name, bytes: Buffer.from(row.bytes) } : null;
}
```

- [ ] **Step 5: Write `datasets.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { dataset, datasetVersion, uploadFile } from "./schema";
import { saveFile } from "./files";
import type { Store } from "./client";

export type DatasetSource = "upload" | "manual";

export type PublishInput = {
  datasetKey: string;
  kind: string;
  label: string;
  source: DatasetSource;
  summary: Record<string, unknown>;
  data: unknown;
  file?: { name: string; bytes: Buffer };
};

export type ActiveData<T> = { versionId: number; label: string; createdAt: Date; data: T };

export type HistoryRow = {
  versionId: number;
  datasetKey: string;
  kind: string;
  label: string;
  source: DatasetSource;
  summary: Record<string, unknown>;
  fileId: number | null;
  fileName: string | null;
  createdAt: Date;
  isActive: boolean;
};

/** Saves a new version (and its original file) and makes it the one the pages show. All or nothing. */
export async function publishVersion(store: Store, input: PublishInput): Promise<{ versionId: number }> {
  const key = input.datasetKey.trim();
  if (!key || key.length > 120) throw new ValidationError("Dataset key must be 1 to 120 characters.");
  return store.transaction(async (tx) => {
    const fileId = input.file ? (await saveFile(tx, input.file)).id : null;
    const [v] = await tx
      .insert(datasetVersion)
      .values({ datasetKey: key, kind: input.kind, label: input.label, source: input.source, summary: input.summary, data: input.data, fileId })
      .returning({ id: datasetVersion.id });
    const updatedAt = new Date();
    await tx
      .insert(dataset)
      .values({ key, kind: input.kind, activeVersionId: v.id, updatedAt })
      .onConflictDoUpdate({ target: dataset.key, set: { activeVersionId: v.id, kind: input.kind, updatedAt } });
    return { versionId: v.id };
  });
}

export async function getActiveData<T>(store: Store, datasetKey: string): Promise<ActiveData<T> | null> {
  const [row] = await store
    .select({ versionId: datasetVersion.id, label: datasetVersion.label, createdAt: datasetVersion.createdAt, data: datasetVersion.data })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .where(eq(dataset.key, datasetKey))
    .limit(1);
  return row ? { ...row, data: row.data as T } : null;
}

/** Upload History, newest first. Leaves out the data itself. */
export async function listHistory(store: Store, opts: { datasetKey?: string; limit?: number } = {}): Promise<HistoryRow[]> {
  const rows = await store
    .select({
      versionId: datasetVersion.id,
      datasetKey: datasetVersion.datasetKey,
      kind: datasetVersion.kind,
      label: datasetVersion.label,
      source: datasetVersion.source,
      summary: datasetVersion.summary,
      fileId: datasetVersion.fileId,
      fileName: uploadFile.name,
      createdAt: datasetVersion.createdAt,
      activeVersionId: dataset.activeVersionId,
    })
    .from(datasetVersion)
    .leftJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .leftJoin(dataset, eq(dataset.key, datasetVersion.datasetKey))
    .where(opts.datasetKey ? eq(datasetVersion.datasetKey, opts.datasetKey) : undefined)
    .orderBy(desc(datasetVersion.id))
    .limit(Math.min(Math.max(opts.limit ?? 200, 1), 1000));
  return rows.map(({ activeVersionId, ...r }) => ({ ...r, isActive: activeVersionId === r.versionId }));
}

/** Points that dataset (only that one) back at an older version. History is never rewritten. */
export async function restoreVersion(store: Store, versionId: number): Promise<{ datasetKey: string }> {
  const v = await store.query.datasetVersion.findFirst({ where: eq(datasetVersion.id, versionId), columns: { datasetKey: true } });
  if (!v) throw new ValidationError("That upload no longer exists.");
  await store.update(dataset).set({ activeVersionId: versionId, updatedAt: new Date() }).where(eq(dataset.key, v.datasetKey));
  return { datasetKey: v.datasetKey };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/store`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store
git commit -m "feat: store settings, original files, dataset versions with history and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One-file backup and the restore command

**Files:**
- Create: `src/store/backup.ts`, `src/store/restore.ts`, `scripts/restore-backup.ts`
- Modify: `package.json` (script `store:restore`)
- Test: `src/store/backup.test.ts`

**Interfaces:**
- Consumes: `Store`, `openStore`, `toFileUrl`, `STORE_FILE`, `APP_ID` (Task 1); `publishVersion`, `getActiveData` (Task 2).
- Produces:
  - `createBackup(store: Store): Promise<Buffer>`: a complete SQLite file via `VACUUM INTO`
  - `backupFileName(now?: Date): string`: `media-mind-backup-YYYY-MM-DD-HH-MM.db`
  - `restoreBackupFile(dataDir: string, backupPath: string, now?: Date): Promise<{ previous: string | null }>`

- [ ] **Step 1: Write the failing tests**

`src/store/backup.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestStore } from "./test-store";
import { openStore, toFileUrl, STORE_FILE } from "./client";
import { publishVersion, getActiveData } from "./datasets";
import { backupFileName, createBackup } from "./backup";
import { restoreBackupFile } from "./restore";

const dirs: string[] = [];
async function tempDir() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "mm-backup-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

const publish = (store: Awaited<ReturnType<typeof createTestStore>>, data: string) =>
  publishVersion(store, { datasetKey: "billing", kind: "billing", label: data, source: "upload", summary: {}, data, file: { name: "b.xlsx", bytes: Buffer.from(data) } });

describe("backup", () => {
  it("is one SQLite file that holds the data and the original files", async () => {
    const store = await createTestStore();
    await publish(store, "billing-v1");
    const bytes = await createBackup(store);
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");

    const file = path.join(await tempDir(), "copy.db");
    await fs.writeFile(file, bytes);
    const copy = await openStore(toFileUrl(file));
    expect((await getActiveData(copy, "billing"))?.data).toBe("billing-v1");
  });

  it("names the file with date and time", () => {
    expect(backupFileName(new Date("2026-11-15T09:05:00Z"))).toBe("media-mind-backup-2026-11-15-09-05.db");
  });
});

describe("restoreBackupFile", () => {
  it("puts the backup in place and keeps the old file aside", async () => {
    const dataDir = await tempDir();
    const live = await openStore(toFileUrl(path.join(dataDir, STORE_FILE)));
    await publish(live, "live-data");
    live.$client.close();

    const source = await createTestStore();
    await publish(source, "backup-data");
    const backupPath = path.join(await tempDir(), "backup.db");
    await fs.writeFile(backupPath, await createBackup(source));

    const { previous } = await restoreBackupFile(dataDir, backupPath, new Date("2026-11-15T10:00:00Z"));
    expect(previous).toBe(path.join(dataDir, "media-mind.before-restore-2026-11-15-10-00.db"));
    const restored = await openStore(toFileUrl(path.join(dataDir, STORE_FILE)));
    expect((await getActiveData(restored, "billing"))?.data).toBe("backup-data");
  });

  it("refuses a file that is not a Media Mind backup", async () => {
    const dir = await tempDir();
    const fake = path.join(dir, "fake.db");
    await fs.writeFile(fake, "not a database at all");
    await expect(restoreBackupFile(dir, fake)).rejects.toThrow(/not a Media Mind backup/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/store/backup.test.ts`
Expected: FAIL (`Cannot find module './backup'`).

- [ ] **Step 3: Write `backup.ts`**

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Store } from "./client";

/** A consistent copy of the whole store as one SQLite file. Safe while the app runs. */
export async function createBackup(store: Store): Promise<Buffer> {
  const file = path.join(os.tmpdir(), `media-mind-backup-${randomUUID()}.db`);
  try {
    await store.run(sql`VACUUM INTO ${file}`);
    return await fs.readFile(file);
  } finally {
    await fs.rm(file, { force: true });
  }
}

export function backupFileName(now: Date = new Date()): string {
  return `media-mind-backup-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.db`;
}
```

- [ ] **Step 4: Write `restore.ts`**

```ts
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { APP_ID, STORE_FILE, toFileUrl } from "./client";

const NOT_BACKUP = "This is not a Media Mind backup file.";

/** Replaces the store file with a backup. Run only while the app is stopped. */
export async function restoreBackupFile(dataDir: string, backupPath: string, now: Date = new Date()): Promise<{ previous: string | null }> {
  const head = Buffer.alloc(16);
  const fh = await fs.open(backupPath, "r");
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  if (head.toString("latin1") !== "SQLite format 3\u0000") throw new Error(NOT_BACKUP);

  const check = createClient({ url: toFileUrl(backupPath) });
  try {
    const r = await check.execute("SELECT value FROM meta WHERE key = 'app'");
    if (r.rows[0]?.value !== APP_ID) throw new Error(NOT_BACKUP);
  } catch {
    throw new Error(NOT_BACKUP);
  } finally {
    check.close();
  }

  const target = path.join(dataDir, STORE_FILE);
  let previous: string | null = null;
  if (existsSync(target)) {
    const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    previous = path.join(dataDir, `media-mind.before-restore-${stamp}.db`);
    await fs.rename(target, previous);
    for (const ext of ["-wal", "-shm"]) {
      if (existsSync(target + ext)) await fs.rename(target + ext, previous + ext);
    }
  }
  await fs.copyFile(backupPath, target);
  return { previous };
}
```

- [ ] **Step 5: Write the command and its script**

`scripts/restore-backup.ts`:

```ts
import { loadEnvConfig } from "@next/env";
import { assertStoreEnv } from "../src/store/assert-store-env";
import { restoreBackupFile } from "../src/store/restore";

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) throw new Error("Usage: npm run store:restore -- <backup.db>   (stop the app first)");
  loadEnvConfig(process.cwd());
  const { dataDir } = assertStoreEnv(process.env);
  const { previous } = await restoreBackupFile(dataDir, backupPath);
  console.log(previous ? `Restored. The old store was kept as ${previous}` : "Restored into an empty data folder.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

In `package.json` `"scripts"` add:

```json
    "store:restore": "tsx scripts/restore-backup.ts",
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/store`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store scripts/restore-backup.ts package.json
git commit -m "feat: one-file store backup and a restore command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Password hashing and the sign-in lock

Needs the login-design OK.

**Files:**
- Modify: `package.json` (dependency `bcryptjs`; script `admin:hash`)
- Create: `src/auth/password.ts`, `src/auth/lockout.ts`, `scripts/hash-password.ts`
- Test: `src/auth/password.test.ts`, `src/auth/lockout.test.ts`

**Interfaces:**
- Consumes: `Store`, `createTestStore()`, `loginLock` (Task 1).
- Produces:
  - `BCRYPT_COST = 12`; `hashPassword(plain: string): Promise<string>`, which returns `bcrypt:<base64url>`; `verifyPassword(plain: string, stored: string): Promise<boolean>`
  - `MAX_TRIES = 5`, `LOCK_MS = 600_000`; `type LockState = { locked: boolean; retryAt: Date | null; triesLeft: number }`
  - `getLockState(store, now?)`, `recordFailure(store, now?)`, `clearFailures(store, now?)`

- [ ] **Step 1: Install bcryptjs**

Run: `npm install bcryptjs`
In `package.json` `"scripts"` add:

```json
    "admin:hash": "tsx scripts/hash-password.ts",
```

- [ ] **Step 2: Write the failing tests**

`src/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BCRYPT_COST, hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with bcrypt at cost 12 and verifies", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("bcrypt:")).toBe(true);
    const inner = Buffer.from(stored.slice(7), "base64url").toString("utf8");
    expect(inner).toMatch(/^\$2[aby]\$12\$/);
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(10);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).not.toContain("correct horse battery");
    expect(Buffer.from(stored.slice(7), "base64url").toString("utf8")).not.toContain("correct horse battery");
  });

  it("refuses short and over-long passwords when hashing", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
    await expect(hashPassword("x".repeat(73))).rejects.toThrow(/at most 72/);
  });

  it.each(["", "plain", "bcrypt:", "bcrypt:@@@", "scrypt:1:2:3:4:5"])("treats a malformed hash %j as no match", async (h) => {
    expect(await verifyPassword("anything at all", h)).toBe(false);
  });
});
```

`src/auth/lockout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { LOCK_MS, MAX_TRIES, clearFailures, getLockState, recordFailure } from "./lockout";

const t0 = new Date("2026-11-15T10:00:00Z");

describe("sign-in lock", () => {
  it("starts unlocked with 5 tries", async () => {
    expect(await getLockState(await createTestStore(), t0)).toEqual({ locked: false, retryAt: null, triesLeft: 5 });
    expect(MAX_TRIES).toBe(5);
    expect(LOCK_MS).toBe(10 * 60 * 1000);
  });

  it("counts down and locks on the 5th wrong try for 10 minutes", async () => {
    const store = await createTestStore();
    for (let i = 1; i <= 4; i++) expect((await recordFailure(store, t0)).triesLeft).toBe(5 - i);
    const fifth = await recordFailure(store, t0);
    expect(fifth).toEqual({ locked: true, retryAt: new Date(t0.getTime() + LOCK_MS), triesLeft: 0 });
    expect((await getLockState(store, new Date(t0.getTime() + LOCK_MS - 1))).locked).toBe(true);
  });

  it("unlocks after 10 minutes with 5 fresh tries", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await recordFailure(store, t0);
    expect(await getLockState(store, new Date(t0.getTime() + LOCK_MS))).toEqual({ locked: false, retryAt: null, triesLeft: 5 });
  });

  it("does not extend the lock while locked", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await recordFailure(store, t0);
    const during = await recordFailure(store, new Date(t0.getTime() + 60_000));
    expect(during.retryAt).toEqual(new Date(t0.getTime() + LOCK_MS));
  });

  it("clears the count after a good sign-in", async () => {
    const store = await createTestStore();
    await recordFailure(store, t0);
    await recordFailure(store, t0);
    await clearFailures(store, t0);
    expect((await getLockState(store, t0)).triesLeft).toBe(5);
  });

  it("counts parallel wrong tries correctly", async () => {
    const store = await createTestStore();
    await Promise.all([1, 2, 3, 4, 5].map(() => recordFailure(store, t0)));
    expect((await getLockState(store, t0)).locked).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/auth`
Expected: FAIL (`Cannot find module './password'`, `./lockout`).

- [ ] **Step 4: Write `password.ts`**

```ts
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;
const PREFIX = "bcrypt:";
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Hash for ADMIN_PASSWORD_HASH. Base64url keeps "$" out of .env files, which would expand it. */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) throw new Error("Use a password of at least 12 characters.");
  if (Buffer.byteLength(plain, "utf8") > 72) throw new Error("Use a password of at most 72 bytes.");
  const hash = await bcrypt.hash(plain, BCRYPT_COST);
  return PREFIX + Buffer.from(hash, "utf8").toString("base64url");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false;
  const hash = Buffer.from(stored.slice(PREFIX.length), "base64url").toString("utf8");
  if (!BCRYPT_RE.test(hash)) return false;
  if (Buffer.byteLength(plain, "utf8") > 72) return false;
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Write `lockout.ts`**

```ts
import { eq, sql } from "drizzle-orm";
import { loginLock } from "@/store/schema";
import type { Store } from "@/store/client";

export const MAX_TRIES = 5;
export const LOCK_MS = 10 * 60 * 1000;
const KEY = "admin";

export type LockState = { locked: boolean; retryAt: Date | null; triesLeft: number };

export async function getLockState(store: Store, now: Date = new Date()): Promise<LockState> {
  const row = await store.query.loginLock.findFirst({ where: eq(loginLock.key, KEY) });
  if (row?.lockedUntil && row.lockedUntil > now) return { locked: true, retryAt: row.lockedUntil, triesLeft: 0 };
  return { locked: false, retryAt: null, triesLeft: MAX_TRIES - (row?.failedCount ?? 0) };
}

/** One wrong try. The count goes up in one SQL statement, so parallel tries cannot skip the lock. */
export async function recordFailure(store: Store, now: Date = new Date()): Promise<LockState> {
  const current = await getLockState(store, now);
  if (current.locked) return current;
  const [row] = await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 1, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: loginLock.key, set: { failedCount: sql`${loginLock.failedCount} + 1`, updatedAt: now } })
    .returning({ failedCount: loginLock.failedCount });
  if (row.failedCount >= MAX_TRIES) {
    const retryAt = new Date(now.getTime() + LOCK_MS);
    await store.update(loginLock).set({ failedCount: 0, lockedUntil: retryAt, updatedAt: now }).where(eq(loginLock.key, KEY));
    return { locked: true, retryAt, triesLeft: 0 };
  }
  return { locked: false, retryAt: null, triesLeft: MAX_TRIES - row.failedCount };
}

export async function clearFailures(store: Store, now: Date = new Date()): Promise<void> {
  await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 0, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: loginLock.key, set: { failedCount: 0, lockedUntil: null, updatedAt: now } });
}
```

- [ ] **Step 6: Write the hash command**

`scripts/hash-password.ts`:

```ts
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/auth/password";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const plain = await rl.question("New admin password (12 to 72 characters): ");
  rl.close();
  console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(plain)}`);
  console.error("Put that line in .env.local (never in git).");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run src/auth`
Expected: PASS.

- [ ] **Step 8: Mutation proof for the lock**

Copy `src/auth/lockout.ts` to `%TEMP%/lockout.ts.bak`. Change `if (row.failedCount >= MAX_TRIES)` to `if (row.failedCount >= MAX_TRIES + 1)`. Run `npx vitest run src/auth/lockout.test.ts`. Expected: FAIL ("locks on the 5th wrong try"). Copy the backup back over the file, never with `git checkout`. Run again. Expected: PASS. Record both outputs in the task report.

- [ ] **Step 9: Audit and commit**

Run: `npm audit --omit=dev`. Report any High or Critical advisory for `bcryptjs`.

```bash
git add package.json package-lock.json src/auth/password.ts src/auth/password.test.ts src/auth/lockout.ts src/auth/lockout.test.ts scripts/hash-password.ts
git commit -m "feat: bcrypt admin password hash and 5-tries 10-minute sign-in lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sessions, sign-in logic and the admin guard

Needs the login-design OK.

**Files:**
- Create: `src/auth/session.ts`, `src/auth/sign-in.ts`, `src/auth/policy.ts`, `src/auth/admin.ts`
- Test: `src/auth/session.test.ts`, `src/auth/sign-in.test.ts`, `src/auth/policy.test.ts`, `src/auth/admin.test.ts`

**Interfaces:**
- Consumes: `Store`, `getStore`, `createTestStore`, `adminSession` (Task 1); `verifyPassword`, `hashPassword`, `getLockState`, `recordFailure`, `clearFailures` (Task 4); `ValidationError`.
- Produces:
  - `SESSION_COOKIE = "mm_admin"`, `SESSION_MS = 8 * 60 * 60 * 1000`
  - `createSession(store, now?): Promise<{ token: string; expiresAt: Date }>`; `isValidSession(store, token: string | undefined, now?): Promise<boolean>`; `deleteSession(store, token: string | undefined): Promise<void>`
  - `type SignInResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string }`
  - `attemptSignIn(store, admin: { user: string; passwordHash: string }, input: { user: string; password: string }, now?): Promise<SignInResult>`; `lockedMessage(retryAt: Date): string`
  - `PER_PERSON_ACCESS = false`; `type Viewer = { kind: "admin" } | { kind: "viewer" }`; `type Action = "read" | "write"`; `can(viewer: Viewer, action: Action): boolean`
  - `NOT_ADMIN_MESSAGE = "Only the admin can change data. Please sign in."`; `class NotAdminError extends ValidationError`; `isAdmin(): Promise<boolean>`; `requireAdmin(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/auth/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { adminSession } from "@/store/schema";
import { SESSION_MS, createSession, deleteSession, isValidSession } from "./session";

const t0 = new Date("2026-11-15T10:00:00Z");

describe("admin sessions", () => {
  it("accepts a fresh token and stores only its hash", async () => {
    const store = await createTestStore();
    const { token, expiresAt } = await createSession(store, t0);
    expect(expiresAt).toEqual(new Date(t0.getTime() + SESSION_MS));
    expect(await isValidSession(store, token, t0)).toBe(true);
    const rows = await store.select().from(adminSession);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("rejects missing, unknown, over-long and expired tokens", async () => {
    const store = await createTestStore();
    const { token } = await createSession(store, t0);
    expect(await isValidSession(store, undefined, t0)).toBe(false);
    expect(await isValidSession(store, "nope", t0)).toBe(false);
    expect(await isValidSession(store, "x".repeat(500), t0)).toBe(false);
    expect(await isValidSession(store, token, new Date(t0.getTime() + SESSION_MS))).toBe(false);
  });

  it("signs out by deleting the session", async () => {
    const store = await createTestStore();
    const { token } = await createSession(store, t0);
    await deleteSession(store, token);
    expect(await isValidSession(store, token, t0)).toBe(false);
  });

  it("clears expired sessions when a new one is made", async () => {
    const store = await createTestStore();
    await createSession(store, t0);
    await createSession(store, new Date(t0.getTime() + SESSION_MS + 1));
    expect(await store.select().from(adminSession)).toHaveLength(1);
  });
});
```

`src/auth/sign-in.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { hashPassword } from "./password";
import { LOCK_MS } from "./lockout";
import { isValidSession } from "./session";
import { attemptSignIn } from "./sign-in";

const t0 = new Date("2026-11-15T10:00:00Z");
let admin: { user: string; passwordHash: string };
beforeAll(async () => {
  admin = { user: "admin", passwordHash: await hashPassword("correct horse battery") };
});
const good = { user: "admin", password: "correct horse battery" };
const bad = { user: "admin", password: "wrong password here" };

describe("attemptSignIn", () => {
  it("signs in with the right user and password", async () => {
    const store = await createTestStore();
    const r = await attemptSignIn(store, admin, good, t0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await isValidSession(store, r.token, t0)).toBe(true);
  });

  it("says how many tries are left after a wrong password", async () => {
    const r = await attemptSignIn(await createTestStore(), admin, bad, t0);
    expect(r).toEqual({ ok: false, error: "Wrong user name or password. 4 tries left." });
  });

  it("counts a wrong user name as a wrong try", async () => {
    const r = await attemptSignIn(await createTestStore(), admin, { ...good, user: "root" }, t0);
    expect(r).toEqual({ ok: false, error: "Wrong user name or password. 4 tries left." });
  });

  it("locks on the 5th wrong try and refuses even the right password during the lock", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 4; i++) await attemptSignIn(store, admin, bad, t0);
    const fifth = await attemptSignIn(store, admin, bad, t0);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.error).toMatch(/^Too many wrong tries\. Sign-in is locked until 16:10/);
    const during = await attemptSignIn(store, admin, good, new Date(t0.getTime() + 60_000));
    expect(during.ok).toBe(false);
  });

  it("lets the right password in once the lock is over", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await attemptSignIn(store, admin, bad, t0);
    expect((await attemptSignIn(store, admin, good, new Date(t0.getTime() + LOCK_MS))).ok).toBe(true);
  });
});
```

(16:10 is 10:10 UTC in Dhaka time, UTC+6.)

`src/auth/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PER_PERSON_ACCESS, can } from "./policy";

describe("policy", () => {
  it("lets everyone read and only the admin write", () => {
    expect(can({ kind: "viewer" }, "read")).toBe(true);
    expect(can({ kind: "viewer" }, "write")).toBe(false);
    expect(can({ kind: "admin" }, "read")).toBe(true);
    expect(can({ kind: "admin" }, "write")).toBe(true);
  });

  it("keeps per-person access switched off", () => {
    expect(PER_PERSON_ACCESS).toBe(false);
  });
});
```

`src/auth/admin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));
let store: Store;
vi.mock("@/store/client", () => ({ getStore: async () => store }));

const { NOT_ADMIN_MESSAGE, NotAdminError, isAdmin, requireAdmin } = await import("./admin");
const { SESSION_COOKIE, SESSION_MS, createSession } = await import("./session");

beforeEach(async () => {
  jar.clear();
  store = await createTestStore();
});

describe("admin guard", () => {
  it("refuses a request without a session cookie", async () => {
    expect(await isAdmin()).toBe(false);
    await expect(requireAdmin()).rejects.toBeInstanceOf(NotAdminError);
    await expect(requireAdmin()).rejects.toThrow(NOT_ADMIN_MESSAGE);
    expect(NOT_ADMIN_MESSAGE).toBe("Only the admin can change data. Please sign in.");
  });

  it("refuses a made-up cookie", async () => {
    jar.set(SESSION_COOKIE, "made-up-token");
    expect(await isAdmin()).toBe(false);
  });

  it("refuses an expired session", async () => {
    const { token } = await createSession(store, new Date(Date.now() - SESSION_MS - 1000));
    jar.set(SESSION_COOKIE, token);
    expect(await isAdmin()).toBe(false);
  });

  it("lets a valid admin session through", async () => {
    const { token } = await createSession(store);
    jar.set(SESSION_COOKIE, token);
    expect(await isAdmin()).toBe(true);
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/auth`
Expected: FAIL (`Cannot find module './session'`, `./sign-in`, `./policy`, `./admin`).

- [ ] **Step 3: Write `session.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { adminSession } from "@/store/schema";
import type { Store } from "@/store/client";

export const SESSION_COOKIE = "mm_admin";
export const SESSION_MS = 8 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(store: Store, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  await store.delete(adminSession).where(lte(adminSession.expiresAt, now));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  await store.insert(adminSession).values({ tokenHash: hashToken(token), createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function isValidSession(store: Store, token: string | undefined, now: Date = new Date()): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const row = await store.query.adminSession.findFirst({
    where: and(eq(adminSession.tokenHash, hashToken(token)), gt(adminSession.expiresAt, now)),
    columns: { tokenHash: true },
  });
  return row !== undefined;
}

export async function deleteSession(store: Store, token: string | undefined): Promise<void> {
  if (token) await store.delete(adminSession).where(eq(adminSession.tokenHash, hashToken(token)));
}
```

- [ ] **Step 4: Write `sign-in.ts`**

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "@/store/client";
import { verifyPassword } from "./password";
import { clearFailures, getLockState, recordFailure } from "./lockout";
import { createSession } from "./session";

export type SignInResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string };

const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export function lockedMessage(retryAt: Date): string {
  const time = retryAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });
  return `Too many wrong tries. Sign-in is locked until ${time} (Dhaka time).`;
}

/** The one place that decides a sign-in. Checks the lock first, so a locked account never reaches the password check. */
export async function attemptSignIn(
  store: Store,
  admin: { user: string; passwordHash: string },
  input: { user: string; password: string },
  now: Date = new Date(),
): Promise<SignInResult> {
  const lock = await getLockState(store, now);
  if (lock.locked && lock.retryAt) return { ok: false, error: lockedMessage(lock.retryAt) };

  const userOk = sameText(input.user.trim(), admin.user);
  const passOk = await verifyPassword(input.password, admin.passwordHash);
  if (!userOk || !passOk) {
    const after = await recordFailure(store, now);
    if (after.locked && after.retryAt) return { ok: false, error: lockedMessage(after.retryAt) };
    return { ok: false, error: `Wrong user name or password. ${after.triesLeft} ${after.triesLeft === 1 ? "try" : "tries"} left.` };
  }
  await clearFailures(store, now);
  const { token, expiresAt } = await createSession(store, now);
  return { ok: true, token, expiresAt };
}
```

- [ ] **Step 5: Write `policy.ts` and `admin.ts`**

`src/auth/policy.ts`:

```ts
/**
 * Who may do what. First release: everyone reads everything, only the admin writes.
 * Per-person access (staff ID, sections, businesses, brands) plugs in here later. It is switched off.
 */
export const PER_PERSON_ACCESS = false as const;

export type Viewer = { kind: "admin" } | { kind: "viewer" };
export type Action = "read" | "write";

export function can(viewer: Viewer, action: Action): boolean {
  return action === "read" ? true : viewer.kind === "admin";
}
```

`src/auth/admin.ts`:

```ts
import { cookies } from "next/headers";
import { getStore } from "@/store/client";
import { ValidationError } from "@/server/errors";
import { can } from "./policy";
import { SESSION_COOKIE, isValidSession } from "./session";

export const NOT_ADMIN_MESSAGE = "Only the admin can change data. Please sign in.";

export class NotAdminError extends ValidationError {
  constructor() {
    super(NOT_ADMIN_MESSAGE);
    this.name = "NotAdminError";
  }
}

/** True when this request carries a valid admin session. Reads cookies(), so call it inside a Suspense boundary. */
export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(await getStore(), token);
}

/** The first line of every write. Viewers get NotAdminError, which actions turn into the plain refusal message. */
export async function requireAdmin(): Promise<void> {
  const viewer = (await isAdmin()) ? ({ kind: "admin" } as const) : ({ kind: "viewer" } as const);
  if (!can(viewer, "write")) throw new NotAdminError();
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/auth`
Expected: PASS.

- [ ] **Step 7: Mutation proof for the guard**

Copy `src/auth/policy.ts` to `%TEMP%/policy.ts.bak`. In `policy.ts`, change `return action === "read" ? true : viewer.kind === "admin";` to `return true;`. Run `npx vitest run src/auth/admin.test.ts src/auth/policy.test.ts`. Expected: FAIL ("refuses a request without a session cookie" and "lets everyone read and only the admin write"). Copy the backup back over `policy.ts`, never with `git checkout`. Run again. Expected: PASS. Record both outputs.

- [ ] **Step 8: Commit**

```bash
git add src/auth
git commit -m "feat: admin sessions, sign-in decision with lock, and requireAdmin guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sign-in page, admin status, backup download, start-up check, security headers

Needs the login-design OK.

**Files:**
- Create: `src/app/sign-in/actions.ts`, `src/app/sign-in/page.tsx`, `src/app/sign-in/sign-in-form.tsx`, `src/components/shell/admin-status.tsx`, `src/app/api/backup/route.ts`
- Modify: `src/components/shell/top-bar.tsx` (new `adminSlot` prop), `src/app/layout.tsx` (pass the slot), `src/instrumentation.ts` (store check), `next.config.ts` (security headers)
- Test: `src/app/api/backup/route.test.ts`

**Interfaces:**
- Consumes: `attemptSignIn`, `SESSION_COOKIE`, `deleteSession` (Task 5); `isAdmin` (Task 5); `createBackup`, `backupFileName` (Task 3); `getStore`, `assertStoreEnv` (Task 1).
- Produces: `signInAction(prev: SignInState, fd: FormData): Promise<SignInState>`, `signOutAction(): Promise<void>`, `type SignInState = { error: string | null }`; `AdminStatus` server component; `GET /api/backup`; `TopBar({ adminSlot?: ReactNode })`.

- [ ] **Step 1: Write the failing route test**

`src/app/api/backup/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

let admin = false;
vi.mock("@/auth/admin", () => ({ isAdmin: async () => admin }));
let store: Store;
vi.mock("@/store/client", () => ({ getStore: async () => store }));

const { GET } = await import("./route");

beforeEach(async () => {
  admin = false;
  store = await createTestStore();
});

describe("GET /api/backup", () => {
  it("refuses viewers with 403 and a plain message", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Only the admin can download a backup. Please sign in.");
  });

  it("gives the admin one SQLite file", async () => {
    admin = true;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="media-mind-backup-.*\.db"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/api/backup`
Expected: FAIL (`Cannot find module './route'`).

- [ ] **Step 3: Write the backup route**

`src/app/api/backup/route.ts`:

```ts
import { isAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { backupFileName, createBackup } from "@/store/backup";

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) {
    return new Response("Only the admin can download a backup. Please sign in.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const bytes = await createBackup(await getStore());
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

Run: `npx vitest run src/app/api/backup`
Expected: PASS.

- [ ] **Step 4: Write the sign-in actions**

`src/app/sign-in/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "@/store/client";
import { assertStoreEnv } from "@/store/assert-store-env";
import { attemptSignIn } from "@/auth/sign-in";
import { SESSION_COOKIE, deleteSession } from "@/auth/session";

export type SignInState = { error: string | null };

export async function signInAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const { adminUser, adminPasswordHash } = assertStoreEnv(process.env);
  const result = await attemptSignIn(
    await getStore(),
    { user: adminUser, passwordHash: adminPasswordHash },
    { user: String(fd.get("user") ?? "").slice(0, 200), password: String(fd.get("password") ?? "").slice(0, 200) },
  );
  if (!result.ok) return { error: result.error };
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  await deleteSession(await getStore(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
```

(`secure: true` also works on `http://localhost`, which browsers treat as a secure origin.)

- [ ] **Step 5: Write the sign-in page and form**

`src/app/sign-in/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Admin sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Admin sign in</h1>
      <p className="mt-1 text-sm text-gray-600">Only the admin signs in. Everyone else can read every page without signing in.</p>
      <SignInForm />
    </div>
  );
}
```

`src/app/sign-in/sign-in-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, { error: null });
  return (
    <form action={formAction} className="mt-6 grid gap-4" aria-busy={pending}>
      <div className="grid gap-1.5">
        <Label htmlFor="user">User name</Label>
        <Input id="user" name="user" autoComplete="username" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Write the admin status and put it in the top bar**

`src/components/shell/admin-status.tsx`:

```tsx
import Link from "next/link";
import { isAdmin } from "@/auth/admin";
import { signOutAction } from "@/app/sign-in/actions";

/** Reads the session cookie, so the layout renders it inside <Suspense>. */
export async function AdminStatus() {
  if (!(await isAdmin())) {
    return (
      <Link href="/sign-in" className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
        Admin sign in
      </Link>
    );
  }
  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">Admin</span>
      <a href="/api/backup" className="text-xs text-gray-700 underline-offset-2 hover:underline">Download backup</a>
      <button type="submit" className="text-xs text-gray-700 underline-offset-2 hover:underline">Sign out</button>
    </form>
  );
}
```

In `src/components/shell/top-bar.tsx`:
- change the import line `import { useSyncExternalStore } from "react";` to `import { useSyncExternalStore, type ReactNode } from "react";`
- change `export function TopBar() {` to `export function TopBar({ adminSlot }: { adminSlot?: ReactNode }) {`
- inside `<div className="flex items-center gap-2">`, add `{adminSlot}` as the first child, before `{today && (`.

In `src/app/layout.tsx`:
- add the imports `import { Suspense } from "react";` and `import { AdminStatus } from "@/components/shell/admin-status";`
- replace `<TopBar />` with `<TopBar adminSlot={<Suspense fallback={null}><AdminStatus /></Suspense>} />`

- [ ] **Step 7: Check the store at start-up**

Replace `src/instrumentation.ts` with:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./db/assert-env");
    assertEnv(process.env);
    const { assertStoreEnv } = await import("./store/assert-store-env");
    assertStoreEnv(process.env);
  }
}
```

- [ ] **Step 8: Add security headers**

In `next.config.ts`, add this property to `nextConfig` (after `partialPrefetching: true,`):

```ts
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
    ];
  },
```

- [ ] **Step 9: Set up your own admin for local dev (Sadril does this step)**

Sadril runs `npm run admin:hash`, types a password of his own, and adds three lines to `.env.local`:

```
MEDIA_MIND_DATA_DIR=../media-mind-data
ADMIN_USER=<your admin name>
ADMIN_PASSWORD_HASH=<the line the command printed>
```

Claude does not see or type this password.

- [ ] **Step 10: Check in the browser**

Run: `npm run dev` and open `http://localhost:3000`:
- the top bar shows "Admin sign in";
- `/sign-in` with a wrong password shows "Wrong user name or password. 4 tries left.";
- the right password goes to `/`, and the top bar shows "Admin", "Download backup" and "Sign out";
- "Download backup" saves `media-mind-backup-….db`;
- "Sign out" brings back "Admin sign in".

Also run `npx vitest run` (all unit tests). Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/app/sign-in src/app/api/backup src/components/shell/admin-status.tsx src/components/shell/top-bar.tsx src/app/layout.tsx src/instrumentation.ts next.config.ts
git commit -m "feat: admin sign-in page, top-bar status, backup download and security headers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Guard every existing write action

**Files:**
- Modify: `src/app/(modules)/billing/actions.ts`, `competitors/actions.ts`, `digital/actions.ts`, `performance/actions.ts`, `plan/actions.ts`, `settings/actions.ts`, `spend/actions.ts`, `uploads/actions.ts`
- Test: `src/auth/guard-coverage.test.ts`, `src/auth/guard-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `NOT_ADMIN_MESSAGE` (Task 5); `createSession`, `SESSION_COOKIE` (Task 5).
- Produces: every exported write action refuses viewers with `{ error: NOT_ADMIN_MESSAGE }` before it touches any data.

- [ ] **Step 1: Write the failing tests**

`src/auth/guard-coverage.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Exported server actions that only read (or that sign in and out) and so need no guard. */
const NO_GUARD = new Set(["billHistoryAction", "signInAction", "signOutAction"]);

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name)) return [];
    return /^\s*["']use server["'];/.test(fs.readFileSync(p, "utf8")) ? [p] : [];
  });
}

describe("server action guard coverage", () => {
  const files = serverActionFiles(path.resolve("src/app"));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it("calls requireAdmin before any data access in every write action", () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const runIsGuarded = /async function run\([\s\S]*?\{\s*try\s*\{\s*await requireAdmin\(\);/.test(src);
      for (const part of src.split(/(?=export async function )/).slice(1)) {
        const name = /export async function (\w+)/.exec(part)![1];
        if (NO_GUARD.has(name)) continue;
        const guardAt = [part.indexOf("await requireAdmin()"), runIsGuarded ? part.search(/\brun\(/) : -1]
          .filter((i) => i >= 0)
          .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
        const dataAt = part.search(/\b(getDb|getStore|readForm)\(/);
        if (guardAt === Number.POSITIVE_INFINITY || (dataAt >= 0 && dataAt < guardAt)) missing.push(`${path.relative(process.cwd(), file)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
```

`src/auth/guard-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
let store: Store;
vi.mock("@/store/client", () => ({ getStore: async () => store }));
const getDb = vi.fn(() => {
  throw new Error("DB touched");
});
vi.mock("@/db/client", () => ({ getDb }));

const { NOT_ADMIN_MESSAGE } = await import("./admin");
const { SESSION_COOKIE, createSession } = await import("./session");
const spend = await import("@/app/(modules)/spend/actions");
const billing = await import("@/app/(modules)/billing/actions");
const uploads = await import("@/app/(modules)/uploads/actions");
const settings = await import("@/app/(modules)/settings/actions");

beforeEach(async () => {
  jar.clear();
  getDb.mockClear();
  store = await createTestStore();
});

const uploadForm = () => {
  const fd = new FormData();
  fd.set("kind", "spend");
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "x.xlsx"));
  return fd;
};

describe("write actions for a viewer (no session)", () => {
  it.each([
    ["deleteSpendAction", () => spend.deleteSpendAction(1)],
    ["deleteBillAction (via run)", () => billing.deleteBillAction(1)],
    ["confirmUploadAction", () => uploads.confirmUploadAction(uploadForm())],
    ["removeSampleDataAction", () => settings.removeSampleDataAction()],
  ])("%s refuses and never touches data", async (_name, call) => {
    expect(await call()).toMatchObject({ error: NOT_ADMIN_MESSAGE });
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe("write actions for the admin", () => {
  it("passes the guard and reaches the data layer", async () => {
    const { token } = await createSession(store);
    jar.set(SESSION_COOKIE, token);
    const res = await spend.deleteSpendAction(1);
    expect(getDb).toHaveBeenCalled();
    expect(res.error).not.toBe(NOT_ADMIN_MESSAGE);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/auth/guard-coverage.test.ts src/auth/guard-actions.test.ts`
Expected: FAIL. The coverage test lists every unguarded action; the viewer tests show `getDb` was called.

- [ ] **Step 3: Add the guard**

In each of the 8 action files, add `import { requireAdmin } from "@/auth/admin";` after the other `@/` imports. Then:

- `billing/actions.ts` and `competitors/actions.ts`: in `async function run(...)`, make the first line inside `try {` be `await requireAdmin();`:

```ts
async function run(work: () => Promise<unknown>): Promise<ActionState> {
  try {
    await requireAdmin();
    await work();
```

  Leave `billHistoryAction` unchanged (read only).
- `digital`, `performance`, `plan`, `settings`, `spend`, `uploads` actions: make `await requireAdmin();` the first line inside each exported function's `try {`. Example (`spend/actions.ts`):

```ts
export async function deleteSpendAction(id: number): Promise<ActionState> {
  try {
    await requireAdmin();
    await deleteSpend(getDb(), id);
```

  For `uploads/actions.ts` this goes before `readForm(fd)` in `previewUploadAction` and `confirmUploadAction`, and before `restoreUpload` in `restoreUploadAction`.

The full list that must be guarded (the coverage test checks it): billing (via `run`): `saveBillAction, deleteBillAction, markPaidAction, remindAction, resolveReminderAction, setNoteAction, remindOverdueAction`; competitors (via `run`): `saveMediaAction, deleteMediaAction, saveAdAction, deleteAdAction, saveYoutubeAction, setOwnerAction`; digital: `saveDigitalAction, deleteDigitalAction`; performance: `savePerformanceAction`; plan: `saveCampaignAction, deleteCampaignAction, setBudgetAction`; settings: `createBrandAction, addRivalAction, removeRivalAction, createVendorAction, createTvStationAction, setThresholdsAction, loadSampleDataAction, removeSampleDataAction`; spend: `saveSpendAction, deleteSpendAction`; uploads: `previewUploadAction, confirmUploadAction, restoreUploadAction`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run`
Expected: PASS (all unit tests, old and new).

- [ ] **Step 5: Mutation proof**

Copy `src/app/(modules)/spend/actions.ts` to `%TEMP%/spend-actions.ts.bak`. Delete the `await requireAdmin();` line from `deleteSpendAction`. Run `npx vitest run src/auth/guard-coverage.test.ts src/auth/guard-actions.test.ts`. Expected: FAIL in both. The coverage test names `spend/actions.ts: deleteSpendAction`, and the viewer test shows `getDb` was called. Restore from the backup, never with `git checkout`. Run again. Expected: PASS. Record both outputs.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(modules)" src/auth/guard-coverage.test.ts src/auth/guard-actions.test.ts
git commit -m "feat: every write action requires the admin; viewers get a plain refusal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Browser tests: admin sign-in for existing specs, and the Phase 1 user flow

This is the yardstick. Every box and arrow of the Phase 1 user flow is walked in a real browser.

**Files:**
- Create: `e2e/admin-credentials.ts`, `e2e/auth.setup.ts`, `e2e/phase1-access.spec.ts`
- Modify: `playwright.config.ts`, `playwright.demo.config.ts`, `.gitignore` (add `e2e/.auth/`)

**Interfaces:**
- Consumes: `/sign-in` page (labels "User name", "Password", button "Sign in"), top-bar texts "Admin sign in", "Admin", "Download backup", "Sign out" (Task 6); refusal text (Task 5); settings "Vendor name" field and "Add vendor" button (existing page).
- Produces: `e2e/.auth/admin.json` storage state for the admin; a test-only admin on a dedicated dev server at port 3100.

- [ ] **Step 1: Add the test-only admin and the setup**

`e2e/admin-credentials.ts`:

```ts
/** Test-only admin for the local e2e server on port 3100. Never used anywhere else. */
export const E2E_ADMIN = { user: "e2e-admin", password: "e2e-only-Password-2031" } as const;
```

`e2e/auth.setup.ts`:

```ts
import { test as setup, expect } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

setup("sign in as the admin", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
```

Add the line `e2e/.auth/` to `.gitignore`.

- [ ] **Step 2: Point Playwright at a dedicated server with the test admin**

Replace `playwright.config.ts` with:

```ts
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN } from "./e2e/admin-credentials";

// A dedicated dev server on port 3100 with a fresh temp store and a test-only admin,
// so e2e never uses a real data folder or the real admin password.
const adminHash = "bcrypt:" + Buffer.from(bcrypt.hashSync(E2E_ADMIN.password, 10)).toString("base64url");
const dataDir = path.join(os.tmpdir(), `media-mind-e2e-${process.pid}`);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: "http://localhost:3100" },
  projects: [
    { name: "admin-setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["admin-setup"],
      testIgnore: /phase1-.*\.spec\.ts/,
    },
    { name: "phase1-flow", use: { ...devices["Desktop Chrome"] }, testMatch: /phase1-.*\.spec\.ts/, dependencies: ["admin-setup"] },
  ],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { MEDIA_MIND_DATA_DIR: dataDir, ADMIN_USER: E2E_ADMIN.user, ADMIN_PASSWORD_HASH: adminHash },
  },
});
```

In `playwright.demo.config.ts`, make the same changes so the walkthrough signs in first:
- add the same three imports and the `adminHash` and `dataDir` constants;
- set `baseURL: "http://localhost:3100"`;
- set `projects` to `[{ name: "admin-setup", testDir: "./e2e", testMatch: /auth\.setup\.ts/ }, { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "e2e/.auth/admin.json" }, dependencies: ["admin-setup"] }]`;
- use the same `webServer` block as `playwright.config.ts`.

- [ ] **Step 3: Write the Phase 1 user flow spec**

`e2e/phase1-access.spec.ts`:

```ts
import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

// Phase 1 user flow (https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h#phase-1), every box and arrow.
// Serial: the last test locks sign-in for 10 minutes on this throwaway server.
test.describe.configure({ mode: "serial" });

test("viewer opens the link and reads every page without signing in", async ({ page }) => {
  for (const p of ["/", "/spend", "/performance", "/digital", "/competitors", "/billing", "/uploads", "/settings"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBeLessThan(400);
  }
  await expect(page.getByRole("link", { name: "Admin sign in" })).toBeVisible();
});

test("viewer tries to change data and the server refuses", async ({ page }) => {
  const vendor = `E2E Viewer ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Vendor name").fill(vendor);
  await page.getByRole("button", { name: "Add vendor" }).click();
  await expect(page.getByRole("alert")).toHaveText("Only the admin can change data. Please sign in.");
  await page.reload();
  await expect(page.getByText(vendor)).toHaveCount(0);
});

test("viewer cannot download a backup", async ({ request }) => {
  const res = await request.get("/api/backup");
  expect(res.status()).toBe(403);
  expect(await res.text()).toBe("Only the admin can download a backup. Please sign in.");
});

test.describe("signed-in admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("sees Admin, downloads one backup file, and can sign out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^media-mind-backup-.*\.db$/);
    const head = (await fs.readFile(await download.path())).subarray(0, 16).toString("latin1");
    expect(head).toBe("SQLite format 3\u0000");
  });
});

test("admin password: wrong tries count down, the 5th locks, and the right password is refused while locked", async ({ page }) => {
  await page.goto("/sign-in");
  for (const left of [4, 3, 2, 1]) {
    await page.getByLabel("User name").fill(E2E_ADMIN.user);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText(`Wrong user name or password. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }
  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many wrong tries. Sign-in is locked until");

  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many wrong tries");
  await expect(page).toHaveURL(/\/sign-in$/);
});
```

The "right password signs in" path is walked by `auth.setup.ts`, which every run executes first.

- [ ] **Step 4: Run the browser tests**

Stop any dev server on port 3100 first. Run: `npx playwright test`
Expected: `admin-setup` passes, all existing `chromium` specs pass while signed in as admin, and all 5 `phase1-flow` tests pass. If an old spec fails only because it ran as a viewer, check that its project uses the admin storage state. Do not weaken the guard.

- [ ] **Step 5: Walk the flow by eye and report**

Open the Phase 1 flow diagram and tick each box against the passing tests:
- Opens link → every page read-only: test 1.
- Tries to change → server refuses: tests 2 and 3.
- Opens Sign in → enters password → right → signed in: `auth.setup.ts`.
- Wrong → 5 wrong tries? no → try again: test 5 (counting down).
- Yes → locked 10 minutes: test 5.
- Signed in → Download backup → one backup file: test 4.

Report the Playwright output and this mapping to Sadril before asking for the Phase 1 gate. Tick tracker task `p1-90`.

- [ ] **Step 6: Commit**

```bash
git add e2e playwright.config.ts playwright.demo.config.ts .gitignore
git commit -m "test: e2e signs in as a test-only admin; Phase 1 user flow walked end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage (tracker Phase 1 and the Phase 1 flow):**
  - storage layer: Tasks 1 and 2;
  - backup and restore: Task 3, plus the Task 6 download;
  - admin sign-in with the password from env: Tasks 4 to 6;
  - lock after 5 tries for 10 minutes: Task 4, tested in Tasks 5 and 8;
  - read-only guard on every change: Task 7;
  - per-person access designed in but off: Task 5 `policy.ts`;
  - tests (viewer cannot write, wrong password locks): Tasks 5, 7 and 8;
  - flow walkthrough: Task 8;
  - leaked key removed: Task 0.
  - Not in Phase 1: OOH sites tables (Phase 4); the upload screens (Phase 2).
- **Placeholders:** none. Every code step has the full code. The only step left to a person is Task 6 Step 9 (Sadril's own password), because Claude must not handle it.
- **Type consistency:**
  - `Store` and `StoreTx` from `client.ts` are used everywhere.
  - `SESSION_COOKIE`, `createSession`, `isValidSession`, `deleteSession`, `requireAdmin` and `NOT_ADMIN_MESSAGE` keep the same names in Tasks 5 to 8.
  - The hash format `bcrypt:<base64url>` is the same in `password.ts`, `assert-store-env.ts` (HASH_RE needs 60+ characters after the prefix; a bcrypt hash is 60 characters and encodes to 80) and `playwright.config.ts`.
