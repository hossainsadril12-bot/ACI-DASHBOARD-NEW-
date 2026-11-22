# Manual Entry view controls: design

Asked for by Sadril on 22 Nov 2026 during the Manual Entry walk: the Manual Entry tables are too wide. The user should pick which months to see and which columns to show. Approved the same day. His own app (page spec 6.2) shows all 12 months and every bill column with no picker, so these controls are an addition on top of his app. They change only what the tables show, never the data that is saved.

## 1. Decisions

1. **Quarter buttons on Channel cost and FY media spend.** A joined button row above the table: "Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun", "Full year". Only the chosen quarter's month columns show (3 months, or 12 for Full year).
   - It opens on the quarter that today (Asia/Dhaka) falls in, when today is inside the FY the editor shows. Otherwise it opens on "Full year".
   - One choice is shared by the Channel cost and FY media spend sections (it lives in the Manual Entry shell). It is not remembered after a reload.
   - The FY table always keeps its "Last FY" column. The Channel table always keeps SL, the name column and the remove button.
2. **Month range filter on OOH bills.** In the bills toolbar: "Submitted from" [month] "to" [month], on each bill's Submit Date.
   - Each list starts with "Any", then every month that appears in the bills' Submit Dates, oldest first, shown as Mon'YY.
   - It opens on Any to Any, which shows every bill. A bill with no Submit Date shows only when both ends are Any.
   - "From" alone means that month and later; "to" alone means up to and including that month. If From is later than To, no bill matches.
   - It works together with the search box and the 40-row "Show all N" rule. A count line shows "N of M bills" when a filter or search is active.
   - When nothing matches, the table body shows "No bills match." 
3. **Columns menu on OOH bills.** A "Columns" button opens a tick list.
   - SL, Vendor, Status and Edit always show and are not in the list.
   - The list has PO, Bill No, PO Amount, Bill Amount, Brand, Location, in that order.
   - It opens with Bill No and Bill Amount ticked. The browser remembers the ticks (per browser, wrapped in try/catch, falling back to the default).
4. **View only.** Hiding a month or a column never removes data. Saving still sends all 12 months and every bill field, exactly as before.
5. **Viewers** can use all three controls; they change only the view.
6. **Phone (375 px).** The quarter row and the bills toolbar wrap or scroll inside their own box, with no page side scroll.

## 2. Scope

In scope: the three controls above, in `manual-entry.tsx`, `channel-editor.tsx`, `fy-editor.tsx` and `billboard-editor.tsx`, with pure helpers in `manual-drafts.ts`, unit tests and browser tests.

Out of scope: save rules and the server; uploads and every other page; a Columns menu on Channel cost or FY media spend; a sticky Edit column; remembering the quarter after reload.

## 3. Approach

View state stays in the client editors. Pure, tested helpers do the work: the quarter's month indexes, the default quarter for a date and FY, the Submit Date month list, the date-range filter, and the default column set. The Columns menu uses the shared `DropdownMenuCheckboxItem`. Nothing changes on the server.

## 4. Strings

"Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun", "Full year"; "Submitted from", "to", "Any"; "Columns"; "N of M bills"; "No bills match."

## 5. Tests

- Unit: quarter months for each quarter and Full year; the default quarter inside and outside the FY, at the Dhaka day edge; the month list from Submit Dates (blank dates skipped, sorted); the range filter (Any/Any, From only, To only, both, reversed, blank Submit Date); the default column set and reading a bad stored value.
- Browser: Channel cost opens on the current quarter with 3 month columns, Full year shows 12, and an edit in a hidden month survives a quarter switch and a save; FY keeps Last FY; bills range filter narrows the count; Columns adds Brand and hides Bill No, and the choice survives a reload; a viewer can switch quarters; no page side scroll at 375 px.
