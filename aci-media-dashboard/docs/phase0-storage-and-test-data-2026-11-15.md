# Phase 0: test data and storage test

Date: 15 Nov 2026. Status: test done. Sadril approved one SQLite file on 15 Nov 2026.

## 1. Test data

- All 22 of the client's real Excel files were decoded from his package (`public/src/*.json`, base64) into `Asset/xlsx/`.
- `Asset/` is gitignored, so the client's files never go into git.
- To extract again when he sends a new package:
  `node scripts/phase0/extract-client-xlsx.cjs <package>/public/src Asset/xlsx`
- Every file opens. There are 60 sheets and 7,514 non-empty rows in total.

Files:
- ATL: 13 files in `Asset/xlsx/atl/`, one per TV category.
- Digital: Toiletries, Hygiene, Salt.
- Channel Cost, CB Media Spent Report (FY spend), All Activity Calendar.
- Dashboard Media Final (billing master, 2,956 rows), Billboard Billing Status, Billboard Master Sheet (40 sites).

Facts that matter for auto-detect (Phase 2):
- **ATL files come in two layouts.** Nine files have a visible "GRP-COST-SOV-SOE" (or "SOV-SOE") sheet with a "Brand Name:" line. Four Food & Beverage files (Mustard Oil, Rice, Salt, Spices) have one sheet with "Category:", "Brand:" and "Period:" lines instead.
- **Hidden sheets can name the wrong brand.** For example, the Septex file's hidden sheets say "Savlon Soap". Detection must read the visible first sheet.
- The FY spend file has hidden monthly summary sheets that look exactly like the Activity Calendar. Detection must use the visible "2026-27 Final Report" sheet.
- The Channel Cost file has hidden "... Channel Cost Final" sheets. Detection uses the visible Electronic, Digital and Press & Radio sheets.
- Digital files have Meta, YouTube and TikTok sheets. Salt's metrics sheet is spelt "Metrix " with a trailing space.

## 2. Storage test

Script: `scripts/phase0/storage-test.mjs`. It loads every sheet of all 22 files, the original files, and the 2,956 billing rows into each store. It reopens the store and sums PO amount by business.

Run on Node 26.10 (the dev machine):

**PGlite folder (Postgres in a folder)**
- Write 3.1 s, reopen 120 ms, query 5 ms. Totals correct.
- Disk 58.9 MB. Backup file 11.3 MB.
- **Extra memory about 273 MB.**
- Plus: same Postgres code and tests we have today.

**One SQLite file**
- Write 0.12 s, reopen under 1 ms, query 2 ms. Totals correct.
- Disk 5.5 MB. Backup is one 5.5 MB file copy, made in 66 ms.
- Small extra memory.
- Minus: the Drizzle schema moves to its SQLite dialect. Most old tables (Plan, Budget, Alerts) are removed anyway.

**Plain JSON files (like his server.js)**
- Fast and 5.5 MB.
- Minus: no queries and no transactions. Every page must read and sum in code. An upload that writes several files can be cut in half by a crash.

## 3. Recommendation

**One SQLite file**, through Drizzle's SQLite dialect with the `better-sqlite3` driver.

Why:
- His server has 1 GB RAM. Next.js needs about 250 MB. PGlite would add about 270 MB, plus the memory used to read a 60 MB upload. SQLite adds almost nothing.
- One file is easy to back up: "Download backup" sends one file.
- It is the most proven embedded database. Writes are safe on a crash, and transactions keep an upload all-or-nothing.
- `better-sqlite3` is used rather than Node's built-in `node:sqlite`. The built-in one still prints an "experimental" warning on Node 22, and Drizzle 0.45 has no driver for it.

Cost:
- The Drizzle schema and migrations are rewritten for SQLite in Phase 1.
- DB tests switch from in-memory PGlite to in-memory SQLite, which is just as fast.
- `better-sqlite3` is a native module. The Docker image and the standalone build must include its prebuilt binary for the server's OS.
