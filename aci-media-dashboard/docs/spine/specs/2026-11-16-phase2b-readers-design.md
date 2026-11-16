# Phase 2, Part B: the other six readers (design)

Date: 16 Nov 2026. Status: **approved by Sadril on 16 Nov 2026**.
Builds on Part A (`2026-11-16-phase2a-uploads-design.md` and the plan's "Amendment to Task 7"), which was merged as 4373d32.
Source of the readers: the client's `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/template.html`. The answer keys are his built-in data in `source/data/`.

## 1. Decisions taken while framing (16 Nov 2026)

1. **Which business a Digital file belongs to** is read from the brands inside it, using his Brand and Business list. If the brands don't settle it, the file name is used as a hint ("Hygiene_Business.xlsx" means Hygiene). If it is still unclear, the preview asks the admin to pick the business.
2. **The OOH Billboard Master Sheet** is read and saved now, as a dataset with history like every other file. Phase 4 builds sites, photos and the map on top of it, matching by Sl. No.

## 2. Scope

**In Part B:**
- Six readers, each a faithful port of his reader:
  - **Digital** (p2-06): `parseDigital`, one file per business;
  - **Channel Cost** (p2-07): `parseChannel`;
  - **FY spend** (p2-08): `parseFY`;
  - **Billing master** (p2-10): `parseBilling`, including his rule that a bill split across several lines is counted once;
  - **Billboard billing** (p2-11): `parseBillboard`, including the status read from the row colour;
  - **OOH master sheet** (p2-12): the reading part of `masterRead`.
- **A business picker** on Digital preview lines, for when the business is unclear.
- **Backups** (p2-83):
  - the backup download streams from disk instead of loading the whole file into memory;
  - restoring a backup refuses one made by a newer version of the app.
- **Detection tests for every type** without client files, closing the Part A gaps:
  - a partial-match test and a full-match test made with small test workbooks, for every type;
  - a test for when two types fully match.
- **The browser test (p2-90)** grows to cover a Digital upload with the business picker, and one upload of each of the new types.

**Not in Part B:**
- Pages that show the data (Phase 3).
- Merging OOH sites with photos, pins and the map (Phase 4).
- Full official brand names: readers keep the names as written, as his readers do. Pages apply the full names in Phase 3.
- Food & Beverage Digital files. His app has none, and the picker offers only Toiletries, Hygiene and Salt.
- Live Meta, Google or TikTok data.

## 3. Readers

Every reader returns the same `ReadResult` as Part A: type, dataset key, label, summary, months, row count, data and warnings. Its data has exactly the shape of his reader's output, so Phase 3 can reuse his page logic.

| Type | Dataset key | Label example | Data shape (his) | Answer key |
|---|---|---|---|---|
| Digital | `digital:<Business>` | "Digital, Hygiene, Jul'26 to Oct'26" | `{ dig, raw }` | `dig3.json` and `digraw.json`, filtered to that business |
| Channel Cost | `channel` | "Channel Cost, Jul'26 to Oct'26" | `{ elec, dig, press }` | `channel.json` |
| FY spend | `fy` | "FY spend, FY 2026-27" | brand rows | `data.json` → `fy` |
| Billing master | `billing` | "Billing master, 2,956 lines" | `{ bl, br }` | `billing.json` (bl) and `billraw.json` (br) |
| Billboard billing | `billboard` | "Billboard billing, 169 bills" | `{ legend, rows }` | `billboard.json` |
| OOH master sheet | `ooh-sites` | "OOH master sheet, 40 sites" | site rows | `sites.json` |

**Matching his data.**
- For each of the 9 real files involved, the test reads the file and the result must equal his built-in data.
- For OOH, his `sites.json` adds fields the sheet doesn't have (id, photos, city, which he added on his site page). The test compares the sheet's own fields only: sl, location, brand, size, start, end, cost, vendor, lat and lng.
- Where his built-in data and his own reader disagree, we look into it and follow the PRD. Each such difference is written down, never hidden.
  - **Digital (found 16 Nov 2026):** his `digraw.json` was made by a separate script (`source/scripts/digraw.py`), not by his app's reader, and it differs in two ways. We follow his app's reader, which is what his dashboard shows after any upload.
    1. The script adds an `ob` field (the brand as written). His pages never read it, so we leave it out.
    2. His app fills an empty Content Type on Savlon rows with "Master TVC – …" (template.html line 602). The script doesn't. This changes 3 Toiletries YouTube rows ("Savlon Relaunch - All Placement / - TV / - Mobile").
    - Everything else matches exactly. That includes all 424 summary ad rows (`dig3.json`).
  - **FY spend (found 16 Nov 2026):** his `data.json` → `fy` was made by `source/scripts/extract.py`. That script keeps 59 rows that are all zeros (108 rows in total). His app's reader drops rows with no value in any month and no last-year value (template.html line 614). We follow his app, so the test compares with his data after that same filter, which leaves 49 rows that are identical.
  - **Billing master (found 16 Nov 2026):** his `billing.json` and `billraw.json` were made by `source/scripts/billing.py` and `billraw.py`, not by his app's reader. We follow his app. The differences, all explained and counted in the test:
    1. **Rounding.** Python rounds halves to even; his app rounds them up. Money cells differ by at most 1 BDT (or 0.01 in the raw sheet).
    2. **Invoice dates.** The script writes invoice dates as "1930-04-24 00:00:00"; his app writes "1930-04-24".
    3. **Leading spaces.** The script keeps a leading space in invoice numbers; his app trims it.
    4. **One bill.** PO 2505004341 has two lines for invoice D096, typed "D096" on one and " D096" (with a leading space) on the other. His app trims the space and treats both lines as the same bill, so no unbilled amount is spread. The script treated them as two bills.
  - **Channel Cost:** the 11 Nov file already has Nov'26 amounts for 26 TV channels, so its label reads "Jul'26 to Nov'26". The month labels sit in row 2 of the real file, not row 1.

**Read errors and warnings.** Each reader keeps his own messages. Warnings never block a publish, and read errors do. His warnings include:
- Digital: no rows have a month;
- Channel: a monthly sum doesn't match the sheet's total column;
- Billing: lines have a month that can't be read;
- Billboard: a bill's end date is before its start date, or bills have no status colour;
- OOH: no latitude or longitude, coordinates outside Bangladesh, end date before start date, or no amount.

**Billboard status colours.** The workbook adapter gets an option to read cell fill colours. Only the Billboard billing reader turns it on, so the other files are read as fast as before.

## 4. Digital business

1. **Brands.** Read every brand in the Meta, YouTube and TikTok sheets, in his short form via `dNorm`. Look each one up in his Brand and Business list (`BRANDLIST`/`BALIAS`).
   - If all known brands belong to one business, the business is sure.
2. **File name.** If the brands are mixed or unknown, and the file name names exactly one of Toiletries, Hygiene or Salt, that business is used. The preview says so: "Business taken from the file name."
3. **Admin pick.** If it is still unclear, the line shows "Needs a business" with a Business picker. It can't be published until the admin picks.
   - The picked value is checked on the server against the three businesses, like the type override.
   - It travels as form field `business-<i>`.
4. **One business per batch.** Two Digital files for the same business in one batch block each other, using the existing "Two files are for …" rule.

## 5. Backups (p2-83)

- **Download.** "Download backup" writes the `VACUUM INTO` copy to a temp file and streams it to the browser. The temp file is deleted when the stream ends or the download is cancelled. The whole file is never held in memory.
- **Restore.** Restoring a backup (`npm run store:restore`) reads the backup's list of applied store migrations.
  - If the backup has a migration this app doesn't know, it refuses: "This backup was made by a newer version of Media Mind. Update the app first, then restore."
  - Older backups are still accepted. The app brings them up to date when it next opens.

## 6. Approaches considered

1. **Port each reader faithfully, keep his data shapes, and test against his data (chosen).** This is the same method that worked in Part A. Phase 3 can reuse his page logic.
2. **Normalise every dataset into our own shapes now.** It is cleaner later, but there is no answer key, and Phase 3 would have to rewrite his page logic too.
3. **One generic table reader driven by settings.** It means less code, but his files are irregular (merged headers, colour status, split bills), so it would end up full of special cases.

## 7. Tests (written first)

- **Each reader:** the real-file answer-key test (skipped without client files), plus small test-workbook tests for its read errors and warnings.
- **Digital business:** brands-sure, file-name hint, unclear needs a pick, a bad business value is ignored, and two files for one business are blocked.
- **Service and routes:** a Digital file with `business-<i>` publishes to `digital:Hygiene`. Each new type publishes, and its history row shows the label.
- **Backups:**
  - the download route streams (the response body is a stream and the temp file is gone afterwards);
  - restore refuses a backup with an unknown migration and accepts an older one.
- **Detection:** synthetic full and partial tests for all 8 types, and a test for two full matches.
- **Playwright:** upload a Digital file and see its business. Pick a business when unclear. Upload one file of each new type and see it Ready and then in Upload History.

## 8. Assumptions (90% sure or more)

- The 60 MB request cap, the zip check and the admin-only routes from Part A stay as they are.
- Brand names stay as written, as decided in Part A.
- Money stays in the units his readers use: Digital in USD, Channel in whole BDT, FY in BDT Mn, Billing and Billboard in BDT. Pages convert them in Phase 3.
- The Billing master holds lines back to 2021. All of them are kept, and pages filter by FY in Phase 3.

## 9. Done means

- Tracker items p2-06, p2-07, p2-08, p2-10, p2-11, p2-12 and p2-83 are ticked, and p2-90 is updated.
- All tests pass, and the flow is walked in the browser on desktop and phone.
- After the merge, the p2-16 gate is yours: you try an upload from start to end.
