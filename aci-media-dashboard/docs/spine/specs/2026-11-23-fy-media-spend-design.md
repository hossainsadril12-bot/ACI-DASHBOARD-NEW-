# 3.2 FY Media Spend page

Approved by Sadril on 23 Nov 2026 (FRAME, branch `phase3-fy-calendar`). This is the first real Phase 3 page. The Monthly Activity Calendar (3.1) is the next page, on its own branch.

## Goal

Show the client's FY media spend (the CB Media Spent Report, or its Manual Entry edits) as cards and a brand by month table, filtered by business and medium. Every number must match his file, and no month that has not been reported is guessed.

## Decisions (FRAME)

- **Last year column (Sadril, 23 Nov).** His file has only last year's full-year total per brand, so the percentage compares this year so far with all of last year.
  - Keep the percentage and label it clearly: "FY to date", "FY 2025-26 full year", "% of FY 2025-26".
  - Example: 4 Mn so far against 10 Mn for the whole of last year shows 40%, and the label makes clear this is not a drop.
- **One page per branch.** FY Media Spend is built here and the Calendar comes next.
- **Look.**
  - Our UI design (Wix/Mixpanel style), built from the shared parts:
    - the Phase 3 shell's Business filter;
    - `NoDataYet`;
    - `formatBdtMn` style amounts;
    - `PageHeader`;
    - `SegmentedLinks`;
    - `StatCard`.
  - His template is the content spec only (`docs/page-specs/02-ooh-calendar-fy-channel.md`, section 3.2).

## Data

- **Dataset:** the active version of dataset `fy`, from an upload or a Manual Entry save. Rows are `{ biz, b, med, m[12] Jul to Jun in BDT Mn, py }`.
- **FY:** `fyStartOf(activeVersion, now)` from `src/lib/manual/rules.ts`. That reads Manual Entry's own `fyStart`, else "FY 2026-27" in the label, else the first month. Labels come from `fyName` and `fyMonthLabels`, so nothing is hard-coded.
- **Business:**
  - Each row's stored `biz`, looked up on the Businesses & Brands list (`catalog.businessOf`). The plan decision of 22 Nov says FY pages read the stored `biz`.
  - Groups follow the business order of the uploaded FY file (owner decision, 23 Nov): each group sits where its business first appears in the stored rows, before any business or media filter, so the page reads like his Excel. The Businesses & Brands list does not set the order.
  - A row whose business is not on the list stays under its own `biz` name (normalised). Two file spellings of one list business are one group, placed at the first appearance.
- **Brand name:** the full name from the list (`catalog.brandOf(b)?.name`), else the name as stored. A brand's media rows are added together when "All media" is chosen.
- **Reported months:** month 1 up to the last month in which any row of the whole dataset has spend. Later months are not reported yet.

## Page

**Header.**
- Title "3.2 FY Media Spend".
- Subline "BDT Mn by brand and month · FY 2026-27 vs FY 2025-26", with the years from the data.
- Controls:
  - the shared Business filter;
  - media buttons "All media", "TV", "Digital", "Print", "OOH" (a view control, kept in the address as `?media=`, default All media).

**Cards.** Four, one per medium (TV, Digital, Print, OOH), always shown. A fifth card "Other" appears only when the chosen business has rows in another medium (Manual Entry allows any medium text), so the cards always add up to the Grand total.
- Value: that medium's FY to date for the chosen business, for example "12.34 BDT Mn".
- Sub line: "FY 2025-26 full year: 8.10 BDT Mn".
- The cards follow the Business filter, not the media buttons, because each card already is one medium.

**Table card "Brand × month spend".**
- Title gains " · TV" when a medium is chosen.
- Sub line: "Darker cells = higher spend · months after Oct'26 not reported yet", naming the last reported month.
- Columns:
  - Brand;
  - the 12 month labels (Jul'26 to Jun'27);
  - "FY to date";
  - "FY 2025-26 full year";
  - "% of FY 2025-26".
- Rows:
  - For each business group (only the chosen one when the filter is set): its brands, biggest FY to date first, then a shaded "<Business> total" row.
  - The last row is "Grand total".
  - Brands with no spend this year and no last-year figure are left out.
- Cells:
  - Amounts are BDT Mn with 2 decimals.
  - A zero in a reported month shows "–".
  - A month not reported yet is an empty cell: no projection, no guess.
  - Brand-row month cells get a light tint of the accent colour. It gets stronger with the value, relative to the biggest brand month cell on screen. Total rows have no tint.
  - "FY to date" is bold.
  - "FY 2025-26 full year" shows "–" when zero.
  - "% of FY 2025-26" is the whole percent of FY to date over last year, or "–" when there is no last year.
- On a phone the table scrolls sideways inside its card, not the page.

**Empty states.**
- No `fy` data at all: `NoDataYet` with file "CB Media Spent Report" and card `fy`. The admin gets "Upload it"; a viewer gets "Not uploaded yet.". No cards and no table are shown.
- Data exists but the chosen business (or business and medium) has no rows: the cards show 0.00, and the table card shows "No spend for <business> in FY 2026-27 yet." instead of the table.

Viewer and admin see the same page. Nothing on it is editable.

## Out of scope

- Charts: his page has none here.
- Downloads (Phase 5).
- The Calendar (next branch).
- Same-months-of-last-year comparison: the file does not carry it.

## Tests

**Unit, pure view builder:**
- grouping by list business;
- full brand names;
- media filter;
- reported months and blank future months;
- totals and percentages;
- business filter;
- empty cases.

**Unit with his real file:**
- the page's Grand total per month equals the "Grand Total" row of the file's Final Report sheet;
- each medium card equals the sum of that medium's rows.

**Playwright:**
- From the empty store: `/fy-spend` shows the "No data yet" state naming the CB Media Spent Report. The admin's "Upload it" opens the FY card; a viewer sees no button.
- With his real FY file uploaded:
  - the four cards and the Grand total match the file;
  - the TV button narrows the table;
  - choosing a business narrows cards and table;
  - months after the last reported month are empty cells;
  - at 375px the page does not scroll sideways.
