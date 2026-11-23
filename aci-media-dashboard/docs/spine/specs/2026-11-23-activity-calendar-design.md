# 3.1 Monthly Activity Calendar page

Approved by Sadril on 23 Nov 2026 (FRAME, branch `phase3-calendar`). Content reference: `docs/page-specs/02-ooh-calendar-fy-channel.md`, section 3.1. Our UI design (Wix/Mixpanel style), his template as content spec only.

## Goal

Show which brand ran on which medium in each month of the FY, and how much it spent, from his "All Activity Calendar" file. There are two views, a Gantt and an Excel-like sheet, plus four summary cards and a month-on-month chart. Totals must match his sheets. The PRD acceptance number is the Oct'26 Grand Total of 39.327 Mn.

## Decisions (FRAME)

- Follows the FY Media Spend decisions of 23 Nov:
  - business groups follow the file's own order (first appearance);
  - brands show their full names from the Businesses & Brands list;
  - months not uploaded are never guessed;
  - values keep 6 decimals and are rounded only at display.
- The calendar reader moves from 4 to 6 decimals, for the same reason as the FY reader.
- Gantt lanes are one per medium, and consecutive active months join into one bar, as in his app.
- View controls live in the address so the page works and reloads without client state:
  - `view=gantt|sheet` (default gantt);
  - `media=TV,Digital,...` for the Gantt media toggles (default all four, never empty);
  - `inactive=1` for "Show inactive brands";
  - `sheet=YYYY-MM|fytd` for the Sheet view month (default the latest uploaded month).
- "Current month" is today's month in Dhaka, not the browser's clock.
- The chart is built from plain elements. No chart library is installed, and none is added.

## Data

- **Dataset:** the active version of `calendar`, holding `{ months: [{ m: "YYYY-MM", label, rows: [{ biz, b, v: [TV, Digital, Print, OOH], t }], notes: { tvCount?, channels?, digital? } }] }`.
- **FY:** from `fyStartOf(active, now)`, using the version's summary months. The 12 months run Jul to Jun from `fyMonths` / `fyMonthLabels`. A month is uploaded when the data has it.
- **Business:** `catalog.businessOf(row.biz)`, else the row's own name. Groups follow the first appearance across all months in month order. The Business filter (`getBusinessChoice()`) keeps only rows whose looked-up business slug matches.
- **Brand:** `catalog.brandOf(row.b)?.name ?? row.b`. Rows of one brand in one group are added together. A brand missing from a month counts as zero there.

## Page

**Header.**
- Title "3.1 Monthly Activity Calendar".
- Subline "Brand × media activity and spend (BDT Mn), month on month".
- Controls: the Business filter, and a segmented "Gantt chart" | "Sheet view".

**Cards** (follow the Business filter only).
1. "FY 2026-27 to date": the total of all uploaded months (`formatMn`). Sub line "4 months: Jul'26 to Oct'26" ("1 month: Jul'26" when there is one).
2. "Oct'26 spend": the latest uploaded month's total. Sub line is one of:
   - "▲ 12.3% vs Sep'26" or "▼ 4.0% vs Sep'26", the change against the month before, to 1 decimal;
   - "Latest month" when there is no earlier month or it was 0.
3. "Active brands": the number of brands with a total above 0 in the latest month. Sub line "in Oct'26 · 24 so far this FY", where the second number counts brands with any spend in any uploaded month.
4. "Media mix Oct'26": four whole percentages of the latest month's total, written "62% TV · 21% Digital · 3% Print · 14% OOH", each figure in its medium colour. They are rounded separately, so they may not add to 100. When the latest month's total is 0, each is "0%".

**Gantt view.** A card "Activity Gantt · FY 2026-27" with the sub line "Each coloured lane is a medium; a continuous bar means the brand stayed on air month after month. Number = month spend (BDT Mn) for the media shown."
- **Controls:**
  - TV, Digital, Print, OOH toggle links, each with its colour square, all on by default. Turning off the last one is not offered (its link is disabled).
  - "Show inactive brands", off by default. When off, it hides brands with no spend in any uploaded month for the media switched on.
- **Columns:** "Brand", the 12 month labels, "FYTD". The current month's header and cells have an outline.
- **Rows:** for each business group, a shaded business row with:
  - its name;
  - each month's total for the media shown, in bold, "–" when 0;
  - its FYTD.

  Then one row per brand: an indented bold name, and for each month a small spend number (blank when 0) over one thin lane per switched-on medium, in the fixed order TV, Digital, Print, OOH.
- **Lanes:** a lane is filled when that medium is above 0 in that month. Consecutive filled months join into one bar, rounded only at the run's first and last month.
- **Months not uploaded:** grey diagonal hatching, no number, no lanes.
- **Hover:** each uploaded brand cell has a `title` of "Brand · Oct'26", one line per active medium ("TV: 0.25 BDT Mn"), then "Total: 1.23 BDT Mn". A cell with no activity says "No activity".
- **Total row:** a last "Total" row for the rows shown, month by month plus FYTD.
- **Legend:** the switched-on media colours plus a hatched swatch "Not yet uploaded".

**Sheet view.** A card "CB Media Activity & Spending Amount (Mn) · October 2026", or "· FY 2026-27 to date (Jul'26 to Oct'26)" for FY to date. Its sub line is "Same layout as the Excel sheet · blank = no activity".
- **Controls:** a segmented choice of one button per uploaded month plus "FY to date". The default is the latest month, and an unknown choice falls back to the latest.
- **Table:**
  - Columns: Business, Brand, TV, Digital, Print, OOH (each with its colour square), Total.
  - The business name shows once, on its first brand row.
  - Every brand of the business is listed, including those with no spend.
  - After each business comes an amber-tinted "Total" row; last is a green-tinted "Grand Total" row.
  - Numbers have 2 to 3 decimals and are blank when 0.
  - The sheet view ignores the Gantt media toggles, but follows the Business filter.
- **Notes card**, single month only: "<Mon'YY> media notes", with the sub line "From the bottom of the month's sheet". It holds up to three chip groups, each shown only when it has entries:
  - "TV channels used by brand": "Leona · 9 channels", from "Leona: 09 ; Twinkle Baby Diaper: 12".
  - "TV channels on air (21)": the comma-separated list.
  - "Digital platforms": the comma-separated list.

**Chart** (under either view). A card "Month-on-month spend by media", sub line "BDT Mn". One stacked column per uploaded month with four segments in medium colours. The total is printed above each column with 2 decimals, and the month label sits below. Each segment has a `title` like "TV: 12.34 BDT Mn". It follows the Business filter.

**Empty state.** With no `calendar` data, show `NoDataYet` with file "All Activity Calendar" and card `calendar` (admin "Upload it", viewer "Not uploaded yet."). No cards, views or chart are shown.

**Medium colours.** TV teal, Digital rose, Print amber, OOH emerald, matching `src/lib/channel-colors.ts` (Print uses the PRESS colour).

**Viewers and admin** see the same page. Nothing on it is editable.

## Out of scope

- Downloads (Phase 5).
- A click-through from a cell.
- Projections.
- Changing FY Media Spend.

## Tests

**Unit (pure builder):**
- cards (counts, change %, mix, single month, zero last month);
- grouping and brand merging;
- media toggles and the inactive filter;
- uploaded vs not-uploaded months;
- the current month;
- lane runs (start and end);
- sheet month and FY to date, and the fallback;
- notes parsing;
- chart series;
- the empty case.

**Unit with his real file:**
- every month's business "Total" rows and "Grand Total" row in his sheets equal the builder's sheet totals as displayed text;
- Oct'26 Grand Total is "39.327".

**Playwright:**
- From the empty store, `/calendar` shows "No data yet" naming the All Activity Calendar file, the admin's "Upload it" opens the calendar card, and a viewer sees no button.
- With his real file:
  - the cards match;
  - the Gantt shows hatching on not-uploaded months;
  - turning TV off removes the TV lanes;
  - the Sheet view for Oct'26 shows Grand Total 39.327;
  - FY to date sums the months;
  - the Business filter narrows the page;
  - at 375px the page does not scroll sideways.
