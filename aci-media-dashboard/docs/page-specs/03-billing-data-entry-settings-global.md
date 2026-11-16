# Content spec 03: Billing, Data Entry, Settings and global parts

Source read: `Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/template.html` (single file, hash-routed, plain JS, hand-drawn SVG charts) plus `docs/TECHNICAL_SPEC.md`, `server.js` and `public/claude-shim.js` for the self-host login and roles. Sample data in `source/data/billing.json`, `billraw.json`, `billboard.json`.

Conventions used below: "BDT Mn" means BDT divided by 1,000,000 with two decimals. "Page header" means the standard top block on every page: big title, muted subtitle, and on the right the page's own controls followed by the Download menu (see G7). Row/field names for datasets are described in words, not code.

---

# PART A. GLOBAL PARTS

## G1. Left navigation and numbering
- Fixed left sidebar, 268 px wide, full height, sticky, scrolls on its own. Top: product name "Media Mind" with small line "ACI Consumer Brands · FY 2026-27" (the FY text is hard-coded).
- Under the logo: a role pill (coloured dot plus text) and a small line for the admin sign-in or sign-out link (see G12).
- Menu, in this exact order and numbering. Number is shown in small grey tabular figures before each label:
  - 1 Home (a plain link, no group).
  - 2 Campaign Performance: 2.1 ATL Media Performance, 2.2 Digital Media Performance, 2.3 OOH Media Performance, 2.4 Influencer Campaign Performance.
  - 3 Media Spend: 3.1 Monthly Activity Calendar, 3.2 FY Media Spend Data.
  - 4 Channel Wise Spend: 4.1 Electronic Media, 4.2 Digital Media, 4.3 Press & Radio.
  - 5 Billing & Statement: 5.1 Billing Overview, 5.2 Vendor Statement, 5.3 Media Billing Data Sheet, 5.4 OOH Media Bill Details.
  - 6 Data Entry: 6.1 Upload Data, 6.2 Manual Entry, 6.3 Upload History.
  - 7 Settings: 7.1 User Settings, 7.2 Data Sources, 7.3 My Access, then an italic non-clickable line "+ More modules coming" (shown to super admin only).
- Groups 2 to 7 are collapsible (chevron at right turns when open). Open by default: groups 2, 3, 4, 5. Closed by default: 6 and 7. Opening state is not saved across reloads. Opening a page always forces its own group open.
- The active link gets the primary colour fill with white text and a slightly faded number.
- Routes are the URL hash: home, atl, digital, ooh, influencer, calendar, fy-spend, ch-electronic, ch-digital, ch-press, bill-overview, bill-vendor, bill-register, bill-ooh, data-upload, data-manual, data-history, user-settings, sources, access. Old aliases still work: overview goes to home, cost to fy-spend, channel to ch-electronic, bill-board to bill-ooh. Unknown hash goes to home.
- Links the person may not see are hidden; a group with no visible link is hidden (see G11).
- Footer of the sidebar (hidden on mobile): "Data updated: channel cost 11 Nov 2026 · media spend 27 Oct 2026 · billing 26 Oct 2026". This text is typed into the page, it does not read upload dates.
- Navigating scrolls to top; re-rendering after a filter change keeps scroll position (except some selects that jump to top).

Questions
- Footer dates and the "FY 2026-27" under the logo are static text. Should the rebuild read them from the latest upload dates and the active FY?
- The "+ More modules coming" line: keep or drop?

## G2. Business filter at the top of each page
- A bar above the page title: label "Business", a segmented button group, and on the right a muted summary line.
- Buttons: "All businesses", "Toiletries", "Hygiene", "Salt", "Food & Beverage". Internally the last one is named "Others" (see G6); the user always sees "Food & Beverage". If a person's access is limited to fewer than all four businesses the first button reads "All my businesses" and shows only their businesses.
- Summary line on the right: when All, "Toiletries · Hygiene · Salt · Food & Beverage"; when Food & Beverage, "Food & Beverage · N brands"; otherwise "N brands". N is the count of distinct brands in the FY media spend dataset for the current selection (so it does not change with the billing data).
- The choice is shared across all pages and is remembered in the browser (key "mm-biz"). Default All. The bar is hidden on 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3.
- Effect on billing pages: only rows whose business group matches are used (groups are Toiletries, Hygiene, Salt, Others). All means every group the person may see.
- A second filter, brand-level, exists in the code (keyword list per person). It only matters when per-person access is switched on (see G11).

Questions
- 4.x pages hide the business filter. Intentional (channel cost files have no business column)?

## G3. Financial year and month handling
- Financial year runs July to June. Internal id looks like "FY26-27"; shown as "FY 2026-27" (all years shows "All years"). A month is stored as "YYYY-MM" and shown as Mon'YY, for example "Jul'26".
- FY month column labels for the current year are fixed: Jul'26, Aug'26, Sep'26, Oct'26, Nov'26, Dec'26, Jan'27, Feb'27, Mar'27, Apr'27, May'27, Jun'27. These are hard-coded to FY 2026-27.
- "Reported months" for Home and spend pages = highest month in the FY spend dataset that has any value. Unreported months are blank, never projected.
- There is no global month picker. Billing pages 5.1 to 5.3 have a "Financial year" dropdown (default FY 2026-27, shared by those three pages, not remembered after reload). 5.4 has its own FY dropdown (default All, based on the bill submit date).
- Billing FY options come from the data: "All years (FY21-22 to date)" (text hard-coded), then each FY found in the data, newest first, labelled like "FY 2025-26". A line whose month could not be read appears only under All years.

Questions
- The "FY21-22 to date" text and the hard-coded 26/27 year labels will break next July. Should the rebuild derive them?
- Which year-month an invoice belongs to on 5.1 to 5.3 is the sheet's "Month" column, but on 5.4 it is the submit date. Is that deliberate?

## G4. Unit labelling
- Money in KPI cards and charts: BDT Mn, two decimals, with a small "Mn" after the number. Chart axes use one decimal.
- Statement tables (5.2 statement, 5.3 sheet, 5.4 table) use whole BDT with thousand separators (the 5.3 sheet allows up to two decimals).
- Percentages: one decimal on KPI sub-lines, zero decimals next to progress bars.
- Page subtitles state the unit, for example "BDT Mn, incl. VAT" or "BDT".
- Digital performance (page 2.2) shows USD exactly as uploaded; every other digital figure is USD times the exchange rate (default 123 BDT per USD, set in 7.2; allowed 50 to 500).
- Compact numbers (K, M, B) exist for impressions and reach, not used in my pages.

## G5. Colour palette and media colours
- Light mode tokens: page background grey #f3f4f6, card white, text navy #0b1a3a, muted #64708a, border #e3e7f0, soft grey #eceff5, primary blue #0041a0, highlight tint #eef2ff, "on primary" white, ok green #15803d, error red #b91c1c.
- Four series colours, used everywhere as the chart palette: series 1 blue #2a78d6, series 2 orange #eb6834, series 3 green #1baf7a, series 4 amber #eda100.
- Media colours: TV is series 1 blue, Digital is series 2 orange, Print is series 3 green, OOH is series 4 amber. Platform colours: Meta blue, YouTube orange, TikTok green. Business colours: Toiletries blue, Hygiene orange, Salt green, Others amber.
- Billing: Billed is blue, Unbilled is amber. Paid in the vendor chart is full amber, awaiting is the same amber at 40 percent.
- OOH bill status colours (tag is a pill filled with 18 percent of the colour, text in normal text colour, with a symbol): Payment Done green with check mark; Cheque in Hand blue with a diamond; Cheque in Counter green (series 3) with a diamond; Finance/Audit amber with an ellipsis sign; Bill Error/DOC Problem red with an exclamation mark; anything else (for example Unmarked) muted grey with no symbol. Unpaid rows get a faint amber row tint.
- Other small tags: green tag (light green fill), amber tag (light amber fill), grey tag.
- Font: Inter (Google Fonts), 14 px base, tabular numbers on all figures.

## G6. Brand alias and business mapping
- Official brand names come from Brand_and_Business_list.xlsx and are built into the page: Toiletries (14 names, for example Savlon Liquid Antiseptic, Savlon Soap, Savlon Handwash, Septex, Baby Soft, Shinex, Leona), Hygiene (7, for example Freedom Sanitary Napkin, Twinkle Baby Diaper), Salt (ACI Pure Salt, ACI Pure Honey), Food & Beverage (Basic Spices, Mustard Oil, ACI Electrolyte).
- An alias table (about 45 entries, case-insensitive) maps short or misspelled names to the official one, for example "Savlon LA", "LA", "Savlon antiseptic liquid" to Savlon Liquid Antiseptic; "Savlon HW", "hand wash" to Savlon Handwash; "SkinGen", "SkinZen" to SkinZen Shower Gel; "Neem" to ACI Neem Original; "Super Dry" to Super Dry Sanitary Napkin; "ACI pure mustard oil" to Mustard Oil. Every official name also maps to itself. Unknown names stay as typed (spaces collapsed).
- A cell with several brands separated by "/" or "," is split, each part mapped, then joined back with the same separator.
- Applied automatically after every load and every upload to: FY spend, calendar, billing lines (5.1, 5.2), billing raw sheet (5.3), OOH bills (5.4), ATL category names. Not applied to 2.2 Digital, which keeps uploaded names.
- Business mapping by dataset: FY spend groups Foods, Electrolyte, Commodity (and anything unknown) become Others. Billing sheet "Business" column: Toiletries, Hygiene, Salt, and "ACI Salt" (as Salt) are kept; everything else is Others (the note says Others covers Foods, SCJ, IB, Electrical, Commodity, Beverage, Rice, CB). OOH bills: Toiletries, Hygiene, Salt kept; anything else is Others.
- Display label for Others / Foods / Electrolyte / Food is always "Food & Beverage". Billing overview "By business" table shows the raw group name, so it prints "Others", not "Food & Beverage".

Questions
- 5.1 "By business" prints "Others" while the filter bar says "Food & Beverage". Should both say Food & Beverage?
- The manual bill form offers business values Toiletries, Hygiene, Salt, AI, Foods, Others. "AI" and "Foods" are not in the list used elsewhere; the sample billboard data has one bill tagged "AI". What does AI mean?

## G7. Download menu (button "⤓ Download")
- Appears in the page header of every report page (Home, 2.x, 3.x, 4.x, 5.x). Not shown on 6.x, 7.x, the login page, or when the person cannot see the page. Opens a small panel; clicking elsewhere closes it. While working the button reads "Preparing…". Any failure opens a pop-up "Download: Download failed: <reason>"; if nothing is on the page the reason is "There is nothing to export on this page yet."
- Panel top part, "Source Excel · same format as uploaded": one item per source file behind the page. 5.1, 5.2, 5.3 offer the billing file; 5.4 offers the billboard billing status file. Item shows file name and a hint. Cases: (a) data is the built-in version, the original workbook shipped with the page is downloaded; (b) data came from an upload and the original was kept, that file is downloaded under its uploaded name; (c) data was later changed by Manual Entry, the hint says "last upload; later manual edits are not in this file"; (d) uploaded before originals were kept, the item is disabled with the message "This data was uploaded before source files were kept; upload the file again to make it downloadable."
- Then a heading "Report formats · this page as shown" and four items:
  - Excel (.xlsx): a sheet per table, numbers kept as numbers. Sheet 1 "Summary" lists title, subtitle, "Business: X · Exported date by name · ACI Consumer Brands, Media Department", a Key numbers list (Metric, Value, Note) and each table name with its row count. Then one sheet per table named after the card heading (max 28 characters, unique). Header row navy, header frozen, total rows bold. A cell is a number only if its on-screen text is a plain number (with optional thousand separators); percent or "Mn" text stays text.
  - CSV (.csv): UTF-8 with byte-order mark. Lines: title, subtitle, Business and export date, then Key numbers block, then each table with its title above. Same number rule.
  - PDF: A4 landscape, navy header bar "ACI Consumer Brands | Media Department" with the page title, page title large, business and export line, KPI cards (up to 4 per row), every chart as an image, every table (navy header, zebra rows, total rows highlighted, header repeated on page break; font shrinks with column count so the 22-column billing sheet is very small). Maximum 3,000 rows per table, then a note pointing to Excel. Footer "Media Mind · page i of n".
  - PowerPoint (.pptx): wide screen, "Media Department slide format": dark title slide (four colour bars, "ACI CONSUMER BRANDS · MEDIA DEPARTMENT", title, subtitle, "Business · FY 2026-27 · Prepared date by name"), a Key numbers slide, one slide per chart image, tables split over as many slides as fit. Maximum 400 rows per table, then a note.
- How filters apply: reports are built by reading what the page currently shows, after temporarily switching to light theme and "show all rows" (the 60/100 row limits are lifted). So the business filter, FY dropdown, search text, status or "Unbilled only" toggle and chosen vendor all apply exactly as set. Tables inside the page are exported; charts are only in PDF and PowerPoint. Excel and CSV carry KPI cards and tables only.
- File name: MediaMind_<Page-title>_<Business>_<YYYY-MM-DD>.<ext>.
- PDF and PowerPoint libraries load on first use; Excel also loads the PowerPoint bundle because it supplies the zip helper.
- The Show/Hide flag in the 5.4 data (column R) is never used by any page; ask the client what it was for.

Questions
- Exports ignore dark mode (forced light). Confirm.
- 5.1 exports contain no per-line detail, only what the page shows. Is a full line export expected from 5.3 only?

## G8. Light and dark mode
- Pure CSS: dark values apply automatically when the device prefers dark. There is no switch in the interface. A manual attribute on the page root can force light or dark, but nothing sets it except the export routine.
- Dark tokens: background #0d1220, card #151c2f, text #e8ecf7, muted #93a0bd, border #26304a, soft grey #222b42, primary #5b8dff, highlight #1b2540, on-primary #0d1220, ok #4ade80, error #f87171, series colours blue #3987e5, orange #d95926, green #199e70, amber #c98500.

Questions
- Should the rebuild add a visible theme toggle? None exists today.

## G9. Mobile layout
- Breakpoint 900 px. Below it the sidebar stops being fixed and becomes a normal block at the top of the page (full width, bottom border, all groups still listed, no hamburger, sidebar footer hidden). Page padding drops to 16/14 px. Two-column grids (charts 3:2, and 1:1 card pairs) become one column. KPI cards use auto-fit columns (minimum 180 px) so they reflow at any width. Wide tables scroll sideways inside their card. The viewport uses safe-area padding for notches.
- Sticky table headers and the 640 px tall table scroll areas stay on mobile.

Questions
- On a phone the full menu pushes content far down. Should the rebuild use a drawer?

## G10. Page header, cards and states used everywhere
- KPI card: small grey label, large bold value (with small "Mn"), grey sub-line. Chart cards: bold heading and grey caption. Hover on bars shows a floating dark tooltip.
- Loading: a dark pill at bottom right "Loading the latest uploaded data…"; error pill "Couldn't reach the latest uploaded data; showing the last version available." Pages first render with the built-in data, then swap when uploaded data arrives (polling every 8 s, 30 s when the tab is hidden).
- Access states: "Checking your access…" card while rights load; "No access" with "This section isn't shared with you. Ask the super admin if you need it. See what you can open →" (link to 7.3).
- Pop-ups: centered card (max 720 px) over a dark veil; click outside closes.

## G11. Admin versus viewer (as shipped for self-hosting)
- Two real roles: Viewer (anyone with the link, no sign-in) and Super admin (signed in at /login). The "Editor" role exists in the code but the self-host server never produces it (a signed-in person is either admin or viewer).
- Open-access switch is on: every viewer can open every page, including 6.1, 6.2, 6.3, 7.2 and 7.3, and sees all businesses and brands. Per-person access (staff-ID sign-in, section lists, business and brand limits) is dormant behind that switch.
- Viewer sees but cannot: upload (no Upload Excel button, a note appears), edit (inputs disabled, no Save or Add), restore or reset history, change the exchange rate, download the backup, open 7.1 (shows "Super admin only"). Download menu and all report filters work for viewers.
- Admin: everything, plus the "+ More modules coming" line.
- Server enforces it: every write needs the admin cookie; the "people" collection is unreadable to viewers.

Questions
- Notes on 6.x pages tell viewers to ask for "Editor access in the dashboard's Share menu". That wording is from the claude.ai version and makes no sense when self-hosted. New wording?
- Should viewers see the Data Entry pages at all? Today they can, read only.

## G12. Login page and sign-in
- Self-host admin sign-in (separate page at /login, plain styling): centered white card, title "Media Mind", line "Admin sign-in · viewers don't need to sign in", fields "User name" and "Password", button "Sign in". Error text "Wrong user name or password." (the same text is shown for any failure, including the lock-out). After 5 failed tries from one address the server refuses for 10 minutes. Success sets a 12-hour session cookie (hours configurable) and returns to the dashboard. Admin user name defaults to "admin"; the password must be set in the environment or the server will not start. Name shown to others as "Media Admin".
- In the sidebar a viewer sees a link "Admin sign-in" (goes to /login); the admin sees "Admin sign out" (clears the cookie and reloads). The role pill reads "Super admin" or "Viewer · read only". While loading it reads "Checking access…"; with no database connector it reads "Preview mode".
- Staff-ID login screen (in the page, dormant while open access is on): hides the sidebar and the business bar; centered card with "Media Mind", "ACI Consumer Brands · media dashboard", fields "Staff ID" (numeric keypad hint) and "Password", hint "First time? Your password is your staff ID.", button "Sign in". Messages: "Enter your staff ID.", "This staff ID doesn't have access yet. Ask the media team.", "Wrong password. Your first password is your staff ID.", "Couldn't sign in right now. Please try again." Leading zeros in the staff ID are ignored; ID and password are compared case-insensitively as one-way hashes; the session is kept in the browser.

Questions
- Which login does the rebuild need: the single admin login, the staff-ID login, or company single sign-on? The code comments say the staff-ID mode "isn't a security boundary".

---

# PART B. BILLING AND STATEMENT

Billing dataset (key `billing`, built from the sheet "Master" of "Dashboard Media Final"): two parts. Part one is a cleaned list of lines used by 5.1 and 5.2. Part two is the raw sheet (22 headings plus the raw rows) used by 5.3. Sample: 2,956 lines, July 2021 to 2026, 35 vendors. For 5.1 and 5.2 each line has: vendor, business group, original business text, brand, month (YYYY-MM), media group (TV, Digital, Print, Branding/OOH, Research, Radio, Other), raw media text, PO number, invoice number, PO amount including VAT, bill amount, unbilled amount, ASF, VAT, remittance tax, net bill, a split marker (0 normal, 1 one bill spread over several brands, 2 one PO billed through several invoices), month text, remarks plus location.
Media grouping: TVC and Electronic become TV; Digital stays; Print, Newspaper, Magazine, Press Ad become Print; Branding, Film Branding, Cineplex Branding become Branding/OOH; Research and Radio stay; anything else is "Other".

## 5.1 Billing Overview
Title "Billing Overview", subtitle "Purchase orders, vendor bills and unbilled balance · BDT Mn, incl. VAT". Control: Financial year dropdown (see G3). Business filter above.
- Four KPI cards: "PO value" (sum of PO amounts in Mn; sub-line "N POs · M invoices", N = distinct PO numbers, M = distinct PO plus invoice pairs). "Billed" (sum of bill amounts; sub-line "x% of PO value"). "Unbilled balance" (sum of unbilled; sub-line "N lines still open", N = lines with unbilled above zero). "ASF + VAT on bills" (ASF plus VAT in Mn; sub-line "ASF x · VAT y").
- Chart card 1 (wide), heading "Billed vs unbilled by financial year" when All years, else "Billed vs unbilled by month · FY 20xx-yy"; caption "BDT Mn · bar height = PO value". Stacked columns, Billed blue below Unbilled amber, total printed above each bar, tooltip with both parts. All years: one bar per FY found. One FY: 12 bars Jul to Jun (Mon'YY). Lines with unreadable month are left out of the chart but counted in KPIs.
- Chart card 2, "Unbilled balance by media", caption "BDT Mn · what vendors still have to bill": horizontal bars per media group with unbilled above zero, largest first, amber, tooltip "Billed x Mn". "No data." if none.
- Table card "By media" (caption "BDT Mn"): columns Media, PO value, Billed, Unbilled, Billed %. Rows per media group sorted by billed plus unbilled, descending. Billed % shows a small progress bar and a whole-number percent; "–" when the base is zero.
- Table card "By business": same columns with first column "Business"; rows Toiletries, Hygiene, Salt, Others as present. Footnote "Others = Foods, SCJ, IB, Electrical, Commodity, Beverage, Rice, CB."
- Closing note: the source repeats amounts in two cases and each is counted once: one bill covering several brands (split equally across them), and one PO billed through several invoices (PO value counted once; unbilled = PO value minus all bills against it).
- Layout: KPI row of 4, charts 3:2, tables side by side (stacked on mobile).
Rules and calculations
- Everything comes from the cleaned line list filtered by business and FY. PO value in the KPI is the sum of the line PO amounts; Billed is the sum of bill amounts; Unbilled is the sum of the unbilled column (not PO minus billed).
- The "By media" and "By business" tables define PO value as billed plus unbilled per group, which can differ slightly from the KPI.
- De-duplication happens at upload (see 6.1 Billing rules).
States: no rows for the filters gives zeros, empty chart axes and empty tables with no dedicated empty message. Viewer and admin see the same.
Questions
- The KPI "PO value" and the table "PO value" are computed differently (sum of PO amounts versus billed plus unbilled). Which is right? In the sample they differ by a few taka per line.
- No message appears when the filters match nothing. Wanted?
- "Net Bill" and "Remittance Tax" are held but not shown on 5.1.

## 5.2 Vendor Statement
Title "Vendor Statement", subtitle "Statement of POs and bills for one vendor · BDT". Controls: Financial year dropdown, Vendor dropdown (all vendors in the current business and FY filter, largest PO value first). The chosen vendor is remembered while moving between pages in the session; if it is not present under the new filter the largest vendor is chosen.
- Four KPI cards: "PO value" (Mn; sub "N PO / invoice lines"), "Billed" (Mn; sub "x% of PO value"), "Unbilled balance" (Mn; sub "N lines open"), "Share of all POs" (percent of all vendors' PO value; sub "rank n of N vendors").
- Statement card: heading "<Vendor> · statement" plus " · FY 20xx-yy" unless All years; caption "One line per PO and invoice · running unbilled balance on the right". Columns, exactly: Month, PO no., Invoice, Business, Brand(s), Media, PO amount, Billed, Unbilled, ASF, VAT, Running unbilled. Amounts are whole BDT; zero Unbilled, ASF and VAT show "–".
- Total row (dark): label "Total" spanning the first six columns, then totals of PO amount, Billed, Unbilled, ASF, VAT (the last column is empty).
- Card "All vendors": caption "Click a vendor to open its statement · BDT Mn". Columns: Vendor, Lines, PO value, Billed, Unbilled, Billed %. Whole row clickable (sets the vendor, scrolls to top).
Rules and calculations
- One statement line is one combination of PO number, invoice number and month. Brands and businesses on that line are merged: Business shows the distinct groups joined by commas; Brand(s) shows up to three distinct names and "+N" for the rest. Media shows the first row's raw media text.
- Lines sorted by month ascending, then invoice number. "Running unbilled" is the cumulative sum of the Unbilled column in that order.
- "Lines" in All vendors = distinct PO plus invoice pairs.
Empty state: "No vendor activity for these filters." (replaces KPIs and statement; the All vendors card is still drawn).
Viewer and admin same.
Questions
- Running unbilled adds each line's unbilled amount, so a PO billed in several invoices shows its unbilled share on each line. Confirm this is wanted (the upload splits the unbilled pro rata, so the total is right).
- Media is taken from only the first row of a line; mixed-media lines hide the others.

## 5.3 Media Billing Data Sheet
Title "Media Billing Data Sheet", subtitle "Every line and every column of the Dashboard Media Final sheet · BDT". Controls: Financial year dropdown; "Search" box (placeholder "Vendor, brand, media, PO, invoice"; applies on blur or Enter; searches vendor, brand, media, PO number, invoice number, remarks, location); two-way toggle "All lines" / "Unbilled only" (keeps lines whose Unbilled Amount is above zero).
- One card "Billing lines", caption "Same order as the sheet" (or "Lines with an unbilled amount") followed by "· N of M lines shown · scroll sideways for all 22 columns". Table with sticky header, max height 640 px, small text, scrolls both ways.
- The 22 column headings, exactly, in this order: SL; Media/ Vendor; Business; Brand; Month; Media; PO Number; PO Amount (W/H VAT); PO Amount (incl. VAT); Invoice No; Bill Amount; Net Bill; ASF; Remittance Tax; ADD Cost; VAT; Unbilled Amount; Chalan; Bill qty; Cheque No; Remarks; Location. (Note: the second heading really is "Media/ Vendor" with the space after the slash.) The headings are read from row 1 of the uploaded sheet, so they follow the file; the list above is the built-in file.
- Number columns, right aligned with thousand separators and up to two decimals: PO Amount (W/H VAT), PO Amount (incl. VAT), Bill Amount, Net Bill, ASF, Remittance Tax, ADD Cost, VAT, Unbilled Amount. "Bill qty" is right aligned and, when numeric, is shown as a percent with one decimal (a value of 1 shows 100.0%). Remarks and Location wrap (min width 160 px). Empty cells stay blank.
- Footer row (dark): "Column totals (as in the sheet)" over the first seven columns, then a whole-number total under each of the nine number columns above (no total for Bill qty).
- Below the table: first 100 lines shown; button "Show all N lines" and back "Show first 100". Footnote: column totals add the sheet as it is; where one bill covers several brands, or one PO is billed in parts, the sheet repeats the amount on each row, whereas 5.1 and 5.2 count those once.
Rules and calculations
- Row filter: FY uses the line's month (hidden extra field) and business uses the hidden business group; both are added by the uploader after the 22 columns. Brand is replaced by its official name. No de-duplication here, by design.
- Sheet rows with no value in the vendor column are skipped at upload. Date cells are stored as text dates (YYYY-MM-DD). Numbers under 10 in size are stored to 4 decimals, others to 2.
States: no match shows an empty table with zero totals (no message). Same for viewer and admin.
Questions
- "Bill qty" being a percentage looks odd; in the sample it is mostly 1. Is it a ratio of quantity delivered?
- "Month" shows the sheet text (for example July'21), not the normalised month.
- Sample data has 2,956 lines; confirm that 100 rows then "Show all" (no paging) is acceptable.

## 5.4 OOH Media Bill Details
Dataset: key `billboard` (first visible sheet of "Billboard Billing Status"). Title "OOH Media Bill Details", subtitle "OOH / billboard bills and their payment status · status as of 10 Nov 2026 · BDT · FY runs July–June" (date typed into the page). Controls (top right, above KPIs): "Financial year (by submit date)" dropdown (All years plus FYs found in submit dates, newest first) and Search box (placeholder "Vendor, PO, bill, brand, location"; searches vendor, PO, bill number, brand, location, comments).
- Five KPI cards (based on the FY and business filter, not on status chips or search): "Bills" (count; sub "N not yet paid"), "PO amount" (Mn; sub "for these bills"), "Bill amount" (Mn; sub "Paid x Mn"), "Awaiting payment" (Mn of bills not Payment Done; sub "N bills · <list of statuses present>" or "none"), "PO balance after these bills" (sum of Bill Difference, Mn; sub "Bill Difference column").
- Card "Bill amount by status", caption "BDT Mn · status from the colour legend in the sheet": one horizontal bar per legend status in legend order (default order Payment Done, Cheque in Hand, Finance/Audit, Bill Error/DOC Problem, Cheque in Counter), each with its coloured tag, bar scaled to the largest status, value "x Mn · n", tooltip "n bills · BDT amount".
- Card "Bill amount by vendor", caption "BDT Mn · dark = paid, light = awaiting payment": horizontal stacked bars (paid solid amber, awaiting pale amber) per vendor, largest total first, total in Mn at right, tooltip with Paid and Awaiting in BDT.
- Table card "OOH / billboard billing statement", caption "Same columns as the sheet · newest first · N of M bills". Status chips (segmented): "All", "Not yet paid", then each legend status with count, for example "Payment Done (160)". Counts come from the FY-filtered set.
- Table columns, exactly 18: SL; Name of the Media/ Vendor; Purchase Order; Bill No; PO Amount; Bill Amount; Bill Difference; Start Date; End Date; Business; Brand; Submit Date; Payment Request Date; Bill; Cheque; Location; Comments; Status. Sticky header, max height 640 px, small text. SL, PO Amount, Bill Amount, Bill Difference are right aligned; Bill Difference zero shows "–". Dates are shown as 01 Jan 2025; if a date could not be read the original text is shown in grey. An amber "check" tag follows End Date when it is before Start Date (tooltip "End date is before start date in the sheet"). Vendor is bold. Rows not Payment Done have a faint amber tint. The SL cell has a tooltip "SL n in the sheet". Business column shows the sheet text (for example Salt, AI).
- Footer row: "Total (N bills)" over first four columns, then totals of PO Amount, Bill Amount and Bill Difference (based on all rows matching filters, chips and search).
- First 60 rows shown; button "Show all N bills" and back "Show first 60". Footnote on corrected dates and the "check" tag.
Rules and calculations
- Business filter uses the business group (Toiletries, Hygiene, Salt, else Others); brand uses the official name.
- Serials: at upload each bill's SL becomes its position in the sheet (1, 2, 3 from the top data row), the sheet's own SL is kept as "SL in the sheet". Rows are skipped only if both SL and vendor are empty. Display sort is SL descending, so the last row of the sheet comes first. After every manual add, edit or delete, all bills are renumbered 1 to N in stored order (new bills are added at the end, so they get the highest SL and show first).
- Status: from a "Status" column when the header exists and the cell is filled; otherwise from the fill colour of the vendor cell (column B) compared with the colour legend. The legend is read from coloured cells above the header (colour in column A, label text in column B); if none, a default legend is used (yellow FFFF00 Payment Done, blue 00B0F0 Cheque in Hand, peach FBD4B4 Finance/Audit, red FF0000 Bill Error/DOC Problem, green 00B050 Cheque in Counter). A colour not in the legend takes the nearest legend colour. No colour gives "Unmarked".
- Dates: a date cell whose day is 12 or less is read with day and month swapped (see Questions); day above 12 is read as is. Text dates like 12.03.2026 or 12/3/26 are read day first. Two-digit years add 2000.
- Bill Difference is the sheet value; manual entry fills it with PO minus Bill when left blank.
States: no matches gives an empty table body with zero totals; KPIs show zeros. Viewer and admin same here (editing is in 6.2).
Questions
- Day/month swap: the code swaps every date cell with day 12 or less, even a correct one (stored 5 March becomes 3 May). The footnote says this fixes cells "stored with day and month swapped". Is the whole source file known to be swapped, or only some cells?
- Status Unmarked is counted in the table but gets no bar in "Bill amount by status" (only legend statuses get bars).
- The business filter hides bills tagged "AI" unless Others is chosen. Confirm mapping.

---

# PART C. DATA ENTRY

Common rules: only writers (admin) get Upload and Save buttons; viewers get a note. Every publish writes the data to the server and adds a history record. Others see changes within about 8 seconds (they are polled, no push). Without a data store (preview mode) the pages say they work "on the hosted dashboard".

## 6.1 Upload Data
Title "Upload Data", subtitle "Upload the Excel files in the same format you use today; every section updates for everyone with access". Non-writers see a note: "You can view this page, but uploading needs Editor access in the dashboard's Share menu. Ask the super admin." (or "Uploads work on the hosted dashboard (open it on claude.ai)." in preview mode).
- Nine dataset cards in two columns (one on mobile). Each card: bold title, grey file description, blue button "Upload Excel" (writers only; accepts .xlsx), a line "Updates: <pages>", a line "Now showing: <source>", and below it the stored summary of the last read if any. "Now showing" reads "Built-in data (<base>)", "Uploaded <file> · date time · person" or "Manual edit · date time · person".
- Cards in order, with the exact titles, files, pages they update and built-in base:
  - "ATL (TV) performance · any category": a "2026 Dash Board – <category>" file, one per category, "Upload one file at a time; the category is read from its “Brand Name:” line and only that category is replaced". Updates 2.1 and Home. Base "Oct'26 files, 13 categories".
  - "Digital performance · Toiletries", "· Hygiene", "· Salt": business digital data files with sheets Meta, YouTube, TikTok. Update 2.2, 2.4, 3.1, Home. Base "9 Nov 2026 file".
  - "FY media spend": CB Media Spent Report, the "… Final Report" sheet. Updates Home, 2.3, 3.1, 3.2. Base "27 Oct 2026 file".
  - "Channel cost": Channel Cost with sheets Electronic, Digital, Press & Radio. Updates 4.1, 4.2, 4.3. Base "11 Nov 2026 file".
  - "Media billing data": Dashboard Media Final, sheet "Master". Updates 5.1, 5.2, 5.3. Base "26 Oct 2026 file".
  - "Monthly activity calendar": All Activity Calendar, one sheet per month (July'26, Aug'26 …). Updates 3.1. Base "12 Nov 2026 file (Jul–Oct'26)".
  - "OOH / billboard bill status": Billboard Billing Status, first sheet, status by row colour (or a "Status" column). Updates 5.4. Base "10 Nov 2026 file".
- Card "How uploading works": four steps: click Upload Excel on the matching card and choose the .xlsx; the dashboard reads it in your browser and shows what it found, nothing changes yet; click Publish to dashboard and every listed section updates for everyone; if wrong, open 6.3 Upload History and restore the previous version. Note: keep the same sheet names, header rows and column order; to fix a few numbers use 6.2.
Upload flow
- The dataset is chosen by which card's button you press. There is no auto-detection of dataset from the file. A wrong file simply fails the checks below, or, if its sheet names happen to match, is read as that dataset.
- Step 1, reading pop-up "Reading <file>…". Must end in .xlsx, else error "Please choose an .xlsx file (Excel 2007 or later). Save .xls or .csv files as .xlsx first." The workbook is unzipped and read in the browser (no server involved).
- Step 2, preview pop-up "Check before publishing · <dataset title>" with file name; green-edged box "What was read" with the summary; amber box "Please check" with a bullet list when there are warnings; text "This replaces: <current source>. It updates <pages> for everyone with access. You can go back to the previous version from Upload History."; buttons Cancel and "Publish to dashboard".
- Step 3, publish: button text steps "Keeping the original file…", then "Saving i of n…" (data is cut into 100,000-character pieces). On success pop-up "Published. <pages> now show(s) the new data." The original Excel is stored for the Source Excel download; if storing it fails the publish still goes ahead.
- What blocks a publish: only errors thrown while reading, which replace the preview with a pop-up "Couldn't read this file", the message, and "Expected: <file description>. Keep the same layout as the current sheet: same sheet names, header rows and column order." with an OK button. Warnings never block. Save failures show in red under the preview: permission message ("You don't have permission to change data…"), "The dashboard's storage is full…", or "Couldn't save right now. Please try again."
How each file is recognised and read (header names, not column positions, wherever possible)
- ATL: first visible sheet. In rows 1 to 8, columns A to C, it looks for "Brand Name:" (or "Brand:"), "Category:", "TG" and a population or TG size number. No "Brand Name:" line is an error ("Couldn't find the “Brand Name:” line at the top of sheet…"). The line text picks the category in a fixed order by keyword: Savlon Soap; Septex; Hand Wash; Antiseptic (but not if it says Septex); Baby Soft; Savlon Baby Wipes; Twinkle Baby Wipes; Freedom; Diaper; Salt; Mustard; Rice; Spice or Masala. No match is an error listing the 13 categories. Header row is the row with "Brand Name" in column A (month row above it) or "Brand" in column B (year row two above). Month blocks start at each month header; headers can be dates or text like "Oct'26". Columns per month by header text: GRP, ACD, NGRP, Spend (or Spend Mn), SOV%, SOE%, 1+ Reach, Total Spot(s), CPRP. Rows stop at Total, Note or Source. SOV is recomputed as brand NGRP over total NGRP (or GRP if no NGRP); SOE as brand spend over total spend. Only that one category is replaced; others are kept (the saved data holds all categories). Own brand rows are recognised by name pattern; if none is found a warning says every brand is treated as a competitor.
- Digital (per business): sheets named exactly Meta, YouTube, TikTok. Row 1 holds headings, with a second heading row for video-play percentages. A missing sheet is a warning ("No "Meta" sheet"); no rows at all is an error ("No ad rows were found…"). Rows need a number in spend (Spent (USD) or Cost) or Impressions. Brand and month carry down from the row above; "Total" and "Grand total" rows are skipped. Brand names are shortened (for example any Savlon except Savlon Men becomes Savlon Soap).
- FY media spend: sheet with "final report" in its name, else the first visible; header row has "Brand" in column A within rows 1 to 10, else error. Business groups are read from the summary table after a row "Business"; if absent a standard order is used with a warning. Columns C to N are Jul to Jun, column Q is the previous FY total. "Press" is renamed "Print". Stops at "Grand Total".
- Channel cost: sheets Electronic, Digital, Press & Radio, data from row 3, 12 month columns C to N. Total and Contribution rows are skipped. A row whose months do not add up to the sheet's own total (column O) is noted. All three empty is an error.
- Billing: sheet "Master" must exist (error "Sheet "Master" wasn't found in this file."). Row 1 is the header, exactly 22 columns are read; rows with no vendor are skipped; empty sheet is error. Rules below.
- Calendar: every visible sheet needs a month in its A1 title or its name (for example "July'26"), else warning "Sheet "x": month not recognised". Header row has "Business" in column A and "Brand" in column B within rows 1 to 8, else warning. Columns TV, Digital, Print, OOH, Total are found by heading. Stops at "Grand Total". "SkinGen" is corrected to SkinZen. Notes on TV channels and digital platforms are kept per month. No sheet recognised is an error.
- Billboard: see 5.4 rules. Header row is the first row within rows 1 to 20 where column A is "SL" and column B contains "vendor" or "media", else error ("The header row ("SL · Name of the Media/ Vendor · …") wasn't found."). After that the columns are read by fixed position: A SL, B vendor, C PO, D bill no, E PO amount, F bill amount, G difference, H start date, I end date, J business, K brand, L submit date, M payment request date, N bill, O cheque, P location, Q comments, R a Show/Hide flag (kept but not displayed). No bill rows is an error.
Billing rules (applied while reading)
- Amount rows with the same PO number and invoice number whose PO amount, bill amount and unbilled amount are all identical are treated as one bill split over several brands: each row takes an equal share (marker 1).
- Next, for each PO with two or more invoices whose PO amounts are all equal: if the PO amount is above zero and total bills do not exceed 102 percent of the PO, the unbilled amount is the PO amount minus all bills (not below zero), shared across the lines pro rata to their bills (equal shares if bills are zero); each line's PO amount becomes its bill plus its share (marker 2).
- All amounts are rounded to whole BDT. Month text such as "July'21" becomes 2021-07; unreadable gives a blank month.
Preview summary and warnings produced
- ATL: "Updated <category> · N months (Mon'YY – Mon'YY) · N brands on air · N categories on the dashboard". Warnings: out-of-sequence month header read as the next month; own row not found.
- Digital: "<Business>: N ads · $spend spend · month list". Warnings: missing sheet; "<platform>: no rows with spend or impressions"; "N rows have no month".
- FY: "N brands · N business groups · FY spend x Mn over N months". Warning when the business table is absent.
- Channel: "Electronic x Mn · Digital x Mn · Press & Radio x Mn".
- Billing: "N lines · PO value x Mn · unbilled y Mn (each bill counted once)". Warning "N lines have a month that couldn't be read".
- Calendar: "N months (list) · N active brands · x Mn total". Warnings per unrecognised sheet.
- Billboard: "N bills · <status n · …> · bill amount x Mn". Warnings "N bills have an end date before the start date" and "N bills have no status colour".
States: loading, empty and error as above. Viewer: cards without buttons, plus the note.
Questions
- No cross-check that the right file went into the right card.
- A warning-only upload can still replace good data with partly wrong data; should some warnings block?
- ATL history entries hold every category, so restoring an old ATL entry silently reverts all other categories too.
- "How uploading works" and the note refer to claude.ai and Share; reword.

## 6.2 Manual Entry
Title "Manual Entry", subtitle "Type in or correct data directly; saving publishes it to every section that uses it". Control: three-way toggle "Channel cost", "FY media spend", "OOH / billboard bills". Viewer note: "Saving needs Editor access in the dashboard's Share menu." Billing (5.1 to 5.3) has no manual entry.
- Tab "Channel cost": card with a second toggle Electronic / Digital / Press & Radio, heading "Channel cost · <name>", caption "BDT · type amounts, add or remove rows, then Save & publish". Table: SL, first column "Channel" (Electronic) or "Platform" (Digital) or "Newspaper / station" (Press & Radio), twelve month columns Jul'26 to Jun'27, then a remove button (✕). Name box plus 12 number boxes per row (blank means 0). Button "+ Add channel / platform / newspaper / station". Bottom bar: status text, "Discard changes", "Save & publish".
- Save rules: all three sub-tabs are saved together as the single dataset `channel`; rows with an empty name are dropped; names trimmed; SL renumbered 1 to N; the "months do not add up" notes are cleared; summary recorded as "Electronic x Mn · Digital x Mn · Press & Radio x Mn". Unsaved edits are kept in memory when switching sub-tabs and cleared by Discard or by switching the main tab.
- Tab "FY media spend": heading "FY media spend · <brand>", caption "BDT Mn (million) · <business> · FY 2026-27 months Jul'26–Jun'27, plus the FY 2025-26 total". Brand dropdown grouped by business (Toiletries, Hygiene, Salt, Foods, Electrolyte, Commodity); button "+ Add brand" opens a pop-up with "Brand name", "Business" (the six groups) and Cancel / Add. Table: rows TV, Digital, Print, OOH; columns the 12 months and "FY 2025-26"; numeric inputs. A note says changes to several brands are kept until saved or discarded. Save keeps only rows with any non-zero value, rounds to 4 decimals, drops the derived business field, and records "N brands · FY spend x Mn".
- Tab "OOH / billboard bills": heading "OOH / billboard bills", caption "N bills · add a bill or update a status; each save publishes to 5.4 OOH Media Bill Details". Search box (vendor, PO, bill, brand, location), button "+ Add bill". Table columns: SL, Vendor, PO, Bill No, PO Amount, Bill Amount, Brand, Location, Status, and an Edit button. Newest first, first 40 rows, then "Show all N" / "Show 40".
- Bill pop-up ("Add bill" or "Edit bill · SL n") has 17 fields in two columns: Name of the Media/ Vendor (required), Purchase Order, Bill No, PO Amount (number), Bill Amount (number), "Bill Difference (blank = PO − Bill)" (number), Start Date, End Date (date pickers), Business (select: Toiletries, Hygiene, Salt, AI, Foods, Others), Brand, Submit Date (date picker), Payment Request Date (date picker), Bill, Cheque, Location, Comments, Status (select of the legend statuses). New bill defaults: Status "Finance/Audit", Submit Date today. Buttons: "Delete bill" (edit mode only, red, deletes at once without a confirm), Cancel, "Save & publish". Save rules: blank number becomes empty, blank date empty; Bill Difference blank becomes PO minus Bill; PO and Bill blank become 0; business group is recomputed; unreadable-date text is cleared; then all bills are renumbered 1 to N and the whole `billboard` dataset is published with a summary like "Added bill 811/25 · Vendor · Status", "Edited …" or "Deleted …". Errors appear in red inside the pop-up.
States: empty bills list shows only the header. Viewer: inputs disabled, no Add, Edit, Save or remove.
Questions
- Delete has no confirmation or undo other than Upload History.
- Business dropdown contains "AI" and "Foods" (see G6).
- Brand names typed in manually are not checked against the official list until the next load.

## 6.3 Upload History
Dataset: collection of upload records (latest 200, newest first), each with dataset key, file name or "manual", summary, time, person, number of pieces, stored original file. Title "Upload History", subtitle "Every upload and manual edit, newest first · restore any earlier version". Control: "Refresh" button.
- One table: columns When, Data, Source, By, What was read, and an unnamed last column. When is "12 Nov 2026, 14:05" style. Data is the dataset title. Source is the file name, or a tag "Manual edit". By is the person's name or "–". What was read is the saved summary (muted).
- Last column: green tag "Showing now" on the version currently in use; otherwise a "Restore" button (writers only).
- Below, for writers: "To go back to the data built into the dashboard for one dataset:" followed by one button per dataset that currently has an upload; if none "nothing uploaded yet.".
Rules
- Restore only points the dataset at the chosen older record (it keeps the old data, adds no new history row and re-uses that record's original time and person). The previous current id is stored but there is no "undo restore" button. All viewers pick it up on the next refresh. Pop-up on success "Restored. All sections now show this version."; on failure the permission message.
- Built-in reset deletes the dataset pointer, then a pop-up "<Dataset> will use the built-in data. Reload to apply." with "Reload now". Uploaded records are not deleted.
- History keeps every piece of every upload, so storage grows; there is no purge.
States: "Loading history…" first; empty "No uploads yet. The dashboard is showing its built-in data."; without a data store "Available on the hosted dashboard. History is kept with the dashboard's saved data."
Viewer: sees the table and the "Showing now" tag, no buttons.
Questions
- Restoring the ATL dataset reverts all categories (see 6.1).
- Only 200 entries are shown; older ones cannot be restored from the page.
- After "Restore" no row says it was restored, so the audit trail does not show who restored.

---

# PART D. SETTINGS

## 7.1 User Settings
Admin only. Others see "Super admin only. Only the dashboard owner can manage access." Without a data store: "Available on the hosted dashboard." While loading: "Loading people…". The business bar and Download menu are hidden. In the self-hosted build this page works but changes nothing visible, because open access is on (see G11).
- Header: title "User Settings", subtitle "N people · sign-in is by staff ID · you decide what each person sees". Controls: "Search" box (name, staff ID, designation, business) and button "Add person".
- Note: "How people get in: send them the dashboard link. They sign in with their staff ID; their first password is also their staff ID. They need a claude.ai account and access in the dashboard's Share menu…".
- Table, columns: Name, Designation, Business, Staff ID, Access, Password, and an Edit button. Access cell shows a green "All sections" tag or "N sections", one grey tag per business or "All businesses", a "N brands" tag (tooltip lists them), and a blue "Data entry" tag. A person with no access record shows an amber "Can't sign in"; no staff ID shows an amber "No staff ID". Password shows "Changed" or "Staff ID".
- Footnote: sign-in only selects the view and is not a security boundary; anyone knowing a staff ID and password can be that person; everyone technically receives all data.
- Add or Edit pop-up ("Add person" or "Access for <name>"): fields Name (required), "Staff ID (used to sign in)" (required), Designation, Business; "Sections they can see" as checkboxes in groups with "all" and "none" links (Home; 2.1 to 2.4; 3.1, 3.2; 4.1 to 4.3; 5.1 to 5.4; 7.2 Data Sources); "Businesses" checkboxes (Toiletries, Hygiene, Salt, Food & Beverage; none ticked means all); "Brands only (optional, comma-separated words; e.g. Septex, Neem). Leave blank for all brands"; checkbox "Can use 6 Data Entry (upload and edit data). They also need Editor access in Share."; password field "New password (leave blank to keep the staff ID / the current one)" and, when a custom password exists, a checkbox "Reset to staff ID". Buttons: "Remove person" (red, edit only, no confirm), Cancel, Save.
Rules
- Staff ID is trimmed, leading zeros dropped for numbers. Must be present ("Enter a staff ID.") and unique ("Another person already has this staff ID."). The access record is stored under a one-way hash of the staff ID. Passwords are stored only as hashes. Changing a staff ID moves the access record. A new person's password defaults to the staff ID.
- Sections list does not include 6.x, 7.1 or 7.3 (6 is a single yes/no; 7.1 is admin only; 7.3 is for everyone).
- Brand limit matches when any listed word appears inside a brand name or its official name.
Questions
- Is this per-person access system required in the rebuild, or is the single admin plus open viewers enough?
- Messages refer to claude.ai accounts and the Share menu.
- "Remove person" and password edits have no confirmation step.

## 7.2 Data Sources
Title "Data Sources", subtitle "What feeds each page, and where each dataset currently comes from". Open to everyone; business bar and Download menu hidden. Two cards side by side, then Backup (admin only) and Currency.
- Card "Data in this dashboard", caption "Update any of these in 6.1 Upload Data or 6.2 Manual Entry": nine rows, each with a coloured square icon, bold title, grey "feeds" text, then the "Now showing" line, and at right a tag: grey "Uploaded" or green "Built-in". Icon text and colour: ATL blue; DIG orange (three digital rows); FY green; CH amber (channel); BIL amber (billing); OOH amber (billboard and, oddly, the activity calendar).
- Card "Live ad-platform connections", caption "For daily spend and delivery without manual uploads": three rows "Meta Ads Manager" (Facebook and Instagram · Marketing API), "Google Ads" (YouTube and Display · Google Ads API), "TikTok Ads Manager" (TikTok Marketing API), each tagged "Not connected". Note: live connections need a small server-side connector holding each platform's token. This card is a placeholder; no setting exists.
- Card "Backup" (admin only): text on what the file holds and the command to restore on a self-hosted copy; button "Download backup". It reads the collections ooh, datasets, uploads, chunks, access, people, budget, then every referenced photo and original Excel file, shows progress on the button ("Reading <collection>…", "Photos and files i/n…") and saves MediaMind_backup_<YYYY-MM-DD>.json (app "Media Mind", version 1, time, collections, files as base64). Failure pop-up "Backup failed: <reason>".
- Card "Currency for digital spend", caption "Meta, YouTube and TikTok bill in USD; the dashboard shows all spend in BDT million using this rate". Admin: number box "BDT per 1 USD" (step 0.01, default 123) and "Save rate". Rule: must be above 50 and below 500, else "Enter a rate between 50 and 500."; success text "Saved. All digital spend now uses BDT <rate> per USD." and the page redraws. Everyone else: "BDT 123 per USD" as text.
States: viewer sees everything except Backup and the rate editor.
Questions
- Is the live-connection card to be built or dropped?
- The calendar row shows an "OOH" icon, almost certainly a mistake.

## 7.3 My Access
Open to everyone (even when other pages are hidden); business bar and Download menu hidden. Title "My Access", subtitle "What you can see and change in this dashboard".
- Card "Your role": large word Super admin, Editor or Viewer, with a sentence: super admin "You own this dashboard: you see everything, can upload data, and decide what everyone else sees in 7.1 User Settings."; editor "You can view the sections given to you and upload or edit data in 6 Data Entry." (the data-entry half only if allowed); viewer "You can view the sections given to you." If a staff-ID name exists, "Signed in as <name> · Sign out".
- Card "Your view", caption "Set by the super admin": three items: Businesses (list or "All businesses"), Brands ("All brands" or list), Data entry (Yes or No).
- Card "Sections you can open": tags for each visible section (full numbered names for the 15 sections that can be given: 1 Home, 2.1 to 2.4, 3.1, 3.2, 4.1 to 4.3, 5.1 to 5.4, 7.2); "Only this page. Ask the super admin for access." when none.
- Card "Roles": table with columns Action, Super admin, Data entry (Editor), Viewer. Rows: "View the sections and businesses given to them" (All, As set, As set); "Upload Excel files and edit data (6 Data Entry)" (✓, ✓, –); "Add and edit billboard sites on the OOH map" (✓, ✓, –); "Decide who sees what (7.1 User Settings)" (✓, –, –); "Set sign-in passwords and invite people" (✓, –, –).
Questions
- With open access on, every viewer is told they can open all sections; the Roles table also implies an Editor role that self-hosting cannot create.

---

# SUMMARY (5 lines)
1. Wrote a rebuild spec for the global shell (nav, business filter, FY, units, palette, brand aliases, downloads, themes, mobile, roles, logins) and pages 5.1 to 5.4, 6.1 to 6.3 and 7.1 to 7.3, with the exact 22-column billing sheet headings and 18-column OOH bill headings.
2. Upload detection is by card, not by file; only read errors block publishing, warnings never do; Upload History restore just repoints the dataset.
3. Billing de-duplication (split bills, multi-invoice POs), status-by-colour logic, serial renumbering and the day/month date swap are all described in plain English.
4. Open questions that matter most: unconditional day/month swap for dates up to 12; PO value computed two ways on 5.1; "AI" and "Foods" business values; claude.ai wording on a self-hosted build; whether per-person access (7.1, staff-ID login) is in scope.
5. Also unclear: hard-coded FY 2026-27 labels and "as of" dates, no theme toggle, no mobile menu drawer, ATL restore reverting every category.
