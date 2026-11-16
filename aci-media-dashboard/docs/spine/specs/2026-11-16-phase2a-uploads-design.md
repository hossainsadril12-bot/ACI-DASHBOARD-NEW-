# Phase 2, Part A: upload pipeline (design)

Date: 16 Nov 2026. Status: **approved by Sadril on 16 Nov 2026**.
User flow (the yardstick): https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h#phase-2
Sources: `docs/design-summary-2026-11-15.md` section 3, `docs/build-plan-2026-11-15.md` Phase 2, the client's own app in `Asset/MediaMind_SelfHost_v2.1/` (readers in `source/template.html`, built-in data in `source/data/*.json`, `docs/TECHNICAL_SPEC.md` section 5).

## 1. Decisions taken while framing (16 Nov 2026)

1. **Phase 2 ships in two parts.**
   - Part A (this design): the whole pipeline, detection of all 8 file types, and the ATL and Activity Calendar readers.
   - Part B: the other 6 readers.
2. **New "Data Entry" page.** It has two tabs: Upload and Upload History. The old "Uploads & History" page stays untouched until Phase 6, because the old pages still need it. Sadril left this choice to Claude; Claude chose the option that breaks nothing.
3. **Several files at once.** The admin can drop all 13 ATL files together. Each file gets its own preview line.
4. **Proof by matching his data.** We port his readers and keep his data shapes. A test reads each real file and must give the same numbers as his built-in data. The PRD checks apply on top of that.

## 2. Scope

**In Part A:**
- Data Entry page (`/data-entry`) with Upload and Upload History tabs, and a "Data Entry" menu item.
- Upload size cap and file-type check from the bytes (tracker p2-80).
- Detection of all 8 types: ATL, Digital, Channel Cost, FY spend, Activity Calendar, Billing master, Billboard billing, OOH master sheet (p2-01).
- Preview with what was found and its warnings (p2-02, p2-13).
- The admin picks the type when detection is not sure (p2-03).
- A file that matches no type is refused (p2-04).
- Readers: ATL (p2-05) and Activity Calendar (p2-09).
- Publishing, Upload History with restore, and the original file kept (p2-14).
- The database blocks any change or delete of Upload History rows (p2-81).
- Stronger guard test: every server action is called as a viewer and refused (p2-82).
- Test: every one of the 22 real files is detected as the right type (p2-15).
- The Phase 2 user flow walked in the browser and saved as a Playwright test (p2-90, for the Part A paths).

**Not in Part A (explicit):**
- The other 6 readers: Digital, Channel Cost, FY spend, Billing master, Billboard billing, OOH master sheet. These come in Part B.
- Restore refusing a backup from a newer app version, and streaming the backup (p2-83). This comes in Part B.
- Pages that show the uploaded data. These come in Phase 3.
- Manual Entry (channel cost, FY spend, OOH bills). This comes in Phase 3.
- OOH sites, photos and the map. These come in Phase 4.
- Source Excel downloads for viewers. These come in Phase 5.
- Removing the old Uploads page. This happens in Phase 6.
- Live Meta, Google or TikTok data.

## 3. How an upload works

1. The admin opens Data Entry, then Upload, and drops one or more `.xlsx` files.
2. The browser sends the files to the server action `previewUploads`. Only the admin may call it.
3. For each file, the server:
   - refuses it if it is over 60 MB;
   - refuses it if the bytes are not an `.xlsx` workbook (zip signature and `xl/workbook.xml`);
   - refuses it if the unpacked size is over 200 MB, which guards against zip bombs;
   - reads only the visible sheets with SheetJS;
   - detects the type and runs that type's reader.
4. The preview shows one line per file:
   - the file name;
   - the type and what it covers, for example "ATL, Savlon Soap, Jul'26 to Oct'26";
   - the number of rows;
   - warnings in amber and read errors in red.
5. A type selector sits on every line.
   - When detection is sure, the type is already selected.
   - When detection is not sure, nothing is selected. The line cannot be published until the admin picks a type.
   - When the admin changes the type, the server reads that file again as the new type and the line is refreshed.
6. These lines cannot be published:
   - lines with read errors;
   - lines whose type has no reader yet in Part A, shown as "Recognised as Billing master. Its reader comes in the next update.";
   - lines with no type picked.

   The admin can also remove any line. Warnings never block a publish.
7. **Publish** sends the files and the chosen types to `publishUploads`. Only the admin may call it. The server reads every file again and never trusts the preview. It then publishes all the files in one transaction: either all of them are saved or none is.
   - Each file becomes a new version of its dataset, with the original file attached.
   - Only that dataset changes. For ATL, only that category changes.
8. **Cancel**, or leaving the page, changes nothing.
9. **Upload History** lists every version, newest first. Each row shows:
   - the type, what it covered and the file name;
   - when it was uploaded;
   - an "In use" badge on the active version.

   The admin can restore an older version, which points only that dataset back to it. The admin can also download the original file. Viewers see the list but none of its buttons.

**Dataset keys:**
- `atl:<his category key>`, for example `atl:soap` for Savlon Soap. We use his stable category keys because display names can change;
- `calendar`;
- `fy`;
- `channel`;
- `billing`;
- `billboard`;
- `digital:<Business>`;
- `ooh-sites`.

The key's type part is stored as the version's `kind`.

**Same file again:** if a file's SHA-256 equals the original file of the version in use, the preview warns "This is the same file as the one in use." The file can still be published.

## 4. Detection

- Detection looks only at the content. It uses the visible sheet names, the header names, and the "Brand Name:" or "Category:" lines. The file name is used only as a hint for which business a Digital file belongs to, and is never enough on its own.
- Each type has a rule ported from his readers:
  - **ATL:** a "Brand Name:" line at the top of the first visible sheet, and a header row with "Brand Name" or "Brand".
  - **Activity Calendar:** sheets with a "Business / Brand" header and a "Grand Total" row.
  - **FY spend:** a visible sheet whose name contains "Final Report".
  - **Channel Cost:** sheets named Electronic, Digital and Press & Radio.
  - **Billing master:** a "Master" sheet with the 22 billing headers.
  - **Billboard billing:** a header row with "Sl" and "Vendor" or "Media".
  - **Digital:** Meta, YouTube and TikTok sheets.
  - **OOH master sheet:** location headers with latitude and longitude.
- The result is one of three:
  - **sure:** exactly one type matches fully;
  - **not sure:** more than one type matches, or one matches only partly. The admin must pick;
  - **none:** no type matches. The file is refused with "This is not one of the usual Media Mind files," followed by what was looked for.

## 5. Readers in Part A

- **ATL.** Port `parseATLFile`.
  - It reads the category from the "Brand Name:" line and finds the month blocks from the date row.
  - SOV is brand NGRP ÷ category NGRP. SOE is brand spend ÷ category spend.
  - A month heading out of sequence is read as the next month and reported as a warning.
  - Brand names are kept exactly as in the file, as his reader does, so the result matches his data. Full official names (from his Brand and Business list) are applied when pages read the data in Phase 3, as his app does.
- **Activity Calendar.** Port `parseCalendar`. It reads one sheet per month, from the "Business / Brand" header down to "Grand Total". The notes for each month are kept.
- **Read error vs warning.**
  - A read error means we cannot trust the numbers, for example a missing header row, a missing "Brand Name:" line, or no month found. It blocks that file.
  - A warning means the numbers are usable but something looks odd. It never blocks. Part A's warnings are:
    - his reader's own warnings (a month out of sequence, the category's own brand row missing);
    - impossible values: 1+ Reach above 100%, or more than 3,000 GRP for one brand in one month (the Lux 7,087 case);
    - a calendar sheet with no Grand Total row;
    - the same file as the one in use.

## 6. Data and safety

- **Storage.** Everything goes into the Phase 1 store: `dataset_version`, `dataset` and `upload_file` via `publishVersion`. A batch version of `publishVersion` publishes several files in one transaction.
- **History cannot change.** A new store migration adds SQLite triggers. They refuse any UPDATE or DELETE on `dataset_version` and `upload_file`. Restore changes only `dataset.active_version_id`.
- **Request size.** The `serverActions.bodySizeLimit` in `next.config.ts` goes from 4 MB to 60 MB. The per-file cap is also checked in code.
- **Admin only.** Every new server action and the original-file download call `requireAdmin()` first. The guard test calls each exported server action as a viewer and expects it to be refused.
- **Safe errors.** Error messages never show stack traces or file paths. SheetJS stays at 0.20.3, which has no known prototype-pollution issue.

## 7. Approaches considered

1. **The server reads twice, and nothing is stored between preview and publish (chosen).** The browser keeps the files and sends them again on Publish. There is no drafts table and nothing to clean up, and the publish never trusts an old preview. The cost is a second upload of a few MB.
2. **The server stores a draft at preview and publishes it by id.** Each file is uploaded only once. But this needs a drafts table, an expiry and a clean-up job, and a stale draft could be published.
3. **The browser reads the files, like his app.** This needs no server work for parsing, but the server would have to trust numbers worked out in the browser. Rejected.

## 8. Tests (written first)

- **Unit tests** for detection, one per real file: all 22 files, where each ATL file must also give its category.
- **Unit tests** for the rest of the pipeline:
  - a wrong file is refused (a non-Excel file, an old `.xls`, an empty workbook, a renamed `.zip`);
  - an oversize file is refused;
  - a zip bomb is refused.
- **Unit tests** for the readers, comparing against his built-in data:
  - ATL output matches `source/data/atl.json` for all 13 files;
  - the Activity Calendar matches `source/data/calendar.json`;
  - the Oct'26 grand total is 39.327 Mn;
  - SOV and SOE add up to 100%.
  - Where his built-in data and his own reader disagree, we look into it and follow the PRD. Each such difference is written down, not hidden.
- **Store tests:**
  - a batch publish is all or nothing;
  - the triggers refuse UPDATE and DELETE;
  - a restore changes only one dataset.
- **Guard test:** every server action, called as a viewer, is refused.
- **Playwright test** of the Phase 2 flow:
  - a read error is blocked;
  - an unsure type is picked by the admin;
  - the preview is shown;
  - cancel changes nothing;
  - publishing several files works;
  - restore works;
  - a viewer sees History with no buttons.
- Tests that need the real files are skipped when `Asset/xlsx/` is missing. The real files are never committed.

## 9. Assumptions (90% sure or more, so not asked)

- Only `.xlsx` files are accepted. All 22 of his files are `.xlsx`.
- The page follows the current Wix and Mixpanel look, built from the existing shared components, with desktop and phone screenshots.
- Upload History is visible to viewers, because the design summary says everyone reads every page. Restore and download stay admin-only.
- The old Neon pages are not touched.

## 10. Done means

- Every Part A tracker item is ticked.
- All tests pass.
- The flow has been walked in the browser on desktop and phone.
- Then Part B starts. The p2-16 gate ("You try an upload from start to end") comes after Part B.
