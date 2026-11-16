# Content spec: OOH Media Performance, Activity Calendar, FY Media Spend, Channel Wise Spend

Source read: media-mind-selfhost/source/template.html (render code: OOH page "ooh()" and helpers at about lines 404-414 and 1010-1275; calendar 294-350; FY spend 282-292; channel pages 986-998) plus docs/TECHNICAL_SPEC.md and the sample data in source/data. This is a plain-English description of what his code does today. Where it looks like a mistake it is listed under Questions, not silently fixed.

## Shared rules (apply to every page below)

- Currency: BDT. FY pages show BDT Mn with 2 decimals (thousands separators). Channel table shows whole BDT. Financial year runs July to June; labels are "FY 2026-27", month labels like "Jul'26". The current FY is hard-coded as FY 2026-27 on FY, calendar and channel pages. Only the OOH page works out the FY from today's date.
- Page header: big title, one grey sub-line, then on the right the page's own controls plus a "Download" button (menu: the original source Excel, then Excel, CSV, PDF, PowerPoint exports of the page). Controls sit in the header.
- Business bar (Business: All businesses, Toiletries, Hygiene, Salt, Food & Beverage) shows above pages 2.3, 3.1, 3.2 and filters them. It is hidden on 4.1-4.3. The chosen business is remembered in the browser. The internal name "Others" (also Foods, Electrolyte, Commodity) is always displayed as "Food & Beverage".
- Brand-name conversion: a built-in alias list turns short sheet names into official names (for example "Savlon LA" becomes "Savlon Liquid Antiseptic", "Savlon HW" becomes "Savlon Handwash", "Neem" becomes "ACI Neem Original", "Super Dry" becomes "Super Dry Sanitary Napkin"). Matching ignores case and extra spaces; unknown names stay as written. Applied to the FY data, the calendar data and OOH site brands (split on "/" or ","). Not applied to channel names.
- Tooltips: every chart bar, map shape and Gantt cell shows a dark floating tooltip that follows the mouse. Stacked bar charts show a total number above each bar, 5 grid lines, a legend when more than one series, and a tooltip listing each series and "Total".
- Colour tokens: series 1 blue #2a78d6, series 2 orange #eb6834, series 3 green #1baf7a, series 4 amber #eda100, muted grey #64708a. Media colours: TV blue, Digital orange, Print green, OOH amber. Light and dark themes exist.
- Roles: viewer (anyone with the link) can see everything and edit nothing. Super admin (and "editor" in his code, not used in the self-host build) can edit. Only page 2.3 has edit controls; the other pages are read-only for everyone, their data changes only through Upload Data (6.1) or Manual Entry (6.2).
- Global data banner at bottom right: "Loading the latest uploaded data…" and "Couldn't reach the latest uploaded data; showing the last version available."
- Months not yet reported: "reported" means the latest month with any spend in the FY dataset. Stack charts stop at that month. Tables show "·" (FY page), blank hatched cells (Gantt) or "–" (channel).

## 2.3 OOH Media Performance (route #ooh)

Title "OOH Media Performance", sub "Billboard locations and out-of-home spend · BDT". Order top to bottom: KPI row, map and division card, billboard cost by month card, all-sites table, two charts.

KPI cards (five, auto-fit row), all respect the business bar and brand access:
- "Billboard sites": count of sites. Sub: "N pinned on the map" (sites with a valid latitude and longitude).
- "Active this month": count of sites where start date is on or before today and end date is on or after today. Sub: "start–end covers today". (Logic is "today", not "this month".)
- "Billboard cost FY 2026-27": label uses the FY found from today's date. Value in Mn: each site's contract cost spread evenly by day (see rules) and summed for that FY. Sub: "site contracts spread over their months".
- "OOH spend to date": Mn, sum of the OOH rows of the FY media spend report, July to last reported month. Sub: "Jul–Oct'26 · FY media spend report".
- "Share of total spend": OOH spend to date divided by all-media spend to date, one decimal percent, or "–". Sub: "FY 2025-26 OOH: x.xx Mn".

Card "OOH map · Bangladesh by division" (sub-line: "Billboard sites entered in the dashboard, placed by their map pin. Click a division to zoom in; hover a pin for the photo." While sites load: "Loading saved sites…"; preview mode: "Billboard sites are saved on the hosted dashboard.").
- Controls top right: segmented "Sites" | "Cost 2026-27" (switches the number printed on each division); dropdown "Financial year" (current FY plus every FY any site touches, newest first); admin-only buttons "Upload master sheet", "Paste from Excel", "Add billboard" (primary); super-admin-only "Boundaries" (replace division outlines).
- Left (about 55 percent): map, 660 px tall (520 on phones). Light grey-blue panel with soft shadow. Eight division shapes from built-in boundary data (BBS/OCHA via geoBoundaries), each in a fixed colour: Dhaka #e08a1e, Chattogram #3c9447, Rajshahi #1f74bb, Khulna #c13b7b, Barishal #2c3f8c, Sylhet #cf3f3a, Rangpur #7a4fa0, Mymensingh #118a83; white borders. Each shows its name (bold white) and, under it, the chosen metric ("n site(s)" or "x.xx Mn", "–" if zero), and a small white dot at the division capital.
- Map behaviour: wheel zoom, drag to pan, + / − / Reset buttons (zoom 1x to 40x). Title "BANGLADESH / 8 administrative divisions" top right; credit bottom right "Boundaries: BBS / OCHA via geoBoundaries (CC BY 4.0)"; "No billboard pins yet" when no site has a pin.
- Division click (map or table row): selects it, zooms to it (up to 4x), dims other divisions to about 30 percent and shows only that division's pins; click again or Reset to clear. Hover tooltip: "<Name> Division", "n billboard sites · n live", "Contract cost: BDT x", "FY 2026-27: BDT y", then top four brands with site counts.
- Pins: navy teardrop with white dot, drawn on top of divisions. Hover tooltip: first photo (220x130), location, city, brand, size, vendor, "BDT cost", "start → end". Click opens the site detail pop-up. The location text appears beside pins once zoomed to 3x or more. A focused pin is 35 percent bigger and orange.
- Right (about 45 percent): table with headings "Division", "Sites", "Live", "Contract (Mn)", "FY2026-27 (Mn)", "Share", "Brands". One row per division (colour square plus bold name), sorted by the selected metric, largest first, ties by site count. Zero shows "–". Share is the division's FY cost over the total FY cost, no decimals. Brands = the two brands with most sites. Last row "Total" (sites, live, contract Mn, FY Mn, "100%"). Selected row highlighted. Footnote: "Contract = full cost of the sites; FY 2026-27 = the part of each contract that falls in that financial year (cost spread evenly from start to end date)." plus, if any site has no division, " N site(s) has no map pin yet: first three locations." Unassigned sites count in the Total but have no row.
- If the boundary data is missing (not the case in the built-in build): plain outline of Bangladesh with eight capital dots; super admin sees "Add division boundaries"; others see "Division borders appear once the super admin adds the boundary file."

Card "Billboard cost by month · FY 2026-27" (below the map): own "Financial year" dropdown (same setting as the map's). Sub: "Each site's contract cost is spread evenly over its start–end period, so every month and financial year carries only its own share · BDT thousand (K) · by business".
- Left two-thirds: stacked column chart, Jul'26 to Jun'27 (all 12 months, including future months that the contracts cover), series by business (Toiletries blue, Hygiene orange, Salt green, Others amber), values in BDT thousand labelled "123K".
- Right third: table "Business", "FY 2026-27 (BDT)", "Share"; one row per business with cost (colour square, name with Others shown as Food & Beverage), then "Total" with "100%".
- Empty: "No billboard cost in FY 2026-27 / Add sites with a cost and start/end dates." Footnote lists sites that have a cost but no start or end date (they cannot be spread): "N site(s) has a cost but no start or end date, so it can't be spread over months: names."

Card "All billboard sites" (only when at least one site). Sub: "N sites · M on the map · click a location to see it on the map" (admin: "· use Set on map to place or move a pin by clicking the map"). Columns in order: "SL", "Photo", "Location", "Division", "Brand", "Size / format", "Vendor", "Business", "Period", "Contract cost (BDT)", "Per month", "FY 2026-27" (heading follows the selected FY), "Map pin", and for admins an unlabelled last column with "Edit". No totals row, no paging, no sort controls. Sort order is fixed: by SL number (blank last), then by location name.
- Photo: 80x54 thumbnail of first photo (click opens pop-up), else admin sees "+ Photo" button, viewer sees "–". Location: bold link (click scrolls to and zooms the map on that pin) with city grey beneath. Division: coloured pill with division name or "–". Business: Food & Beverage naming. Period: "2026-05-04 → 2027-05-03" plus a green "Live" pill if active today. Contract cost: whole BDT. Per month: cost divided by days times 365 / 12 (average month length), whole BDT; "no dates" in grey if there is a cost but no valid dates; blank if no cost. FY column: bold whole BDT share for the selected FY, blank if the dates are not valid.
- Map pin: "📍 View" link with latitude and longitude to 4 decimals, or amber pill "Not on map". Admin also sees a small "Move pin" (has pin) or "Set on map" button.
- Empty: admin sees "No billboard sites yet / Use Add billboard or Paste from Excel above the map, then Set on map to place each pin." Viewer sees nothing at all (the card is omitted).

Bottom two cards (side by side, 3:2): "Monthly OOH spend" (sub "BDT Mn · top 3 brands, rest grouped · FY media spend report"): stacked columns July to last reported month, three biggest OOH brands plus grey "Other brands". Empty: "No OOH spend / for this business in FY 2026-27 so far." and "OOH spend by brand" (sub "FY to date, BDT Mn"): amber horizontal bars sorted largest first, value in Mn, tooltip adds "FY 2025-26: x.xx Mn". Only brands with spend this FY appear.

Site pop-up (click a pin, photo, or the table's photo): title location, grey city and green "Live" pill, photo viewer (large image on black, thumbnails 72x52 to switch; "Photo unavailable" if broken; or "No billboard photo yet" plus, for admins, " · click Edit to upload one"), then a two-column list of Brand, Location, City / district, Size / format, Vendor, Start date, End date, Cost (BDT), Latitude, Longitude ("–" if empty). Buttons: "Edit" (admin) and "Close".

Add / Edit billboard pop-up (admin only). Title "Add billboard" or "Edit billboard". Two-column fields: Brand, Location (required), City / district, Size / format, Vendor, Start date (date picker), End date (date picker), Cost (BDT) (number), Latitude (number, placeholder "e.g. 23.7808"), Longitude (number, placeholder "e.g. 90.4152"). Then "Billboard photos (up to 4)": thumbnails 96x68 with an "×" to remove, "No photos yet", and "Upload photo" (JPG, PNG, WebP, several at once; each is shrunk in the browser to at most 1600 px, JPEG quality 85; limit 20 MB; messages "Uploading…", "Up to 4 photos per site.", "That photo is too large (max 20 MB).", "Use a JPG, PNG or WebP photo.", "Photo storage is full.", "Upload failed; try again."). If photo storage is unavailable: "Photo upload is available to the super admin and editors on the hosted dashboard." Tip line: "Tip: in Google Maps, right-click the billboard's spot and click the numbers at the top to copy latitude, longitude." Buttons: red "Delete site" (edit mode only, deletes at once, no confirmation), "Cancel", "Save". Validation: latitude 20 to 27 and longitude 88 to 93, else "Latitude must be 20–27 and longitude 88–93 for Bangladesh." Save errors: "You don't have permission to change billboard sites." (also hides edit buttons), "Storage is full; the site wasn't saved.", "Couldn't save right now. Try again." A saved or deleted site updates the page for everyone.

Set / move pin on the map (admin): button sets "pick mode". Division selection is cleared; if the site already has a pin the map jumps to it at 6x. White banner with orange border over the map: "📍 Click on the map to place “<location>”", hint "Zoom in with + / − or scroll for an exact spot.", and "Cancel" (Escape also cancels). Cursor is a crosshair and division clicking is off. A click (not a drag) saves the clicked longitude and latitude (6 decimals) on the site. Clicks outside the box lng 88 to 92.8, lat 20.5 to 26.7 show "That point is outside Bangladesh. Click inside the map." Then the pin is highlighted.

Master sheet upload (admin): pop-up "Upload billboard master sheet": "Choose the ACI CB Media Billboard Master Sheet (.xlsx) in its usual format: Sl. No · OOH Location · Present display/Brand · Size · Bill Board Period (start, end) · Present Amount · Vendor · Latitude · Longitude." and "Each row updates the site with the same Sl. No (or the same location) and keeps its photos; new rows are added. Sites not in the sheet are left as they are." Steps: pick file, "Reading…", result "N billboard rows read. X update existing sites, Y are new. K sites already in the dashboard are not in this sheet and will be kept." plus up to 8 warnings (no latitude/longitude so no pin; coordinates outside Bangladesh; end date before start date; no amount; "…and n more"), button "Update N sites", progress "Saving i of N…", finish message "N billboard sites updated from the master sheet." and the original file is stored for download. First visible sheet is read; the header row is the first of rows 1-12 holding a cell containing "location" and a cell starting "lat" (otherwise error: Couldn't find the header row (it needs “OOH Location” and “Latitude”).). Columns are found by header words: sl, location, brand or display, size, period (start column, with end in the next column), start, end, amount or cost, vendor, lat, lon or lng, city or district. Rows without a location are skipped. Costs rounded to 2 decimals; location trailing full stop and double spaces removed.
- "Paste from Excel" (admin): pop-up with a text box; tab-separated rows, no header needed, columns in this order: Brand · Location · City / district · Size / format · Vendor · Start date · End date · Cost (BDT) · Latitude · Longitude (example row shown). dd/mm/yyyy dates are converted. Rows without a location or with latitude or longitude out of range are skipped. Messages: "No rows added. n rows had no location or a latitude/longitude outside Bangladesh." or "N sites added. n rows skipped (missing location, or latitude/longitude outside Bangladesh)." Button "Add sites".

Dataset and fields: sites come from the shared "ooh" collection (one document per site: sl, location, city, brand, size, start, end as YYYY-MM-DD, cost in BDT, vendor, lat, lng, photos list, optional biz, updatedAt); 40 sample sites are built into the page and are replaced as soon as the saved sites load; live-updating for all viewers (about every 8 seconds in self-host). The two bottom charts and KPIs 4 and 5 use dataset key "fy" (fields biz, b brand, med = "OOH", m = 12 monthly Mn values, py = last-FY total). Last uploaded master sheet is remembered (budget/sitesrc) for the Download menu.

Calculation rules:
- Daily spread: days = end minus start plus 1 (both days count). Per-day cost = cost divided by days. Each calendar month gets per-day cost times the number of its days inside start to end. FY share = sum of its months (July to June). Sites with no cost, no dates or end before start contribute nothing and are listed in the "no start or end date" note.
- Business of a site: the saved "biz" if present (no screen sets it); otherwise guessed from the brand text: Freedom, Twinkle, diaper, napkin, super dry, respect give Hygiene; salt gives Salt; an exact or partial match to a brand in the FY report takes that brand's business; savlon, septex, neem, leona, shinex, skin zen, wonder, baby soft, sandal give Toiletries; anything else, Food & Beverage. The site's whole cost goes to that business.
- Division: (1) the pin's position tested against the eight division outlines; (2) if no pin or the pin is outside all outlines, a word match on location plus city against a list of district and area names (Dhaka list includes Gulshan, Banani, Uttara, Savar, Gazipur, Narayanganj and so on); a match is ignored if it names three or more different divisions; (3) if there is a pin but no word match, the nearest division capital; (4) otherwise "Unassigned".
- Live = start on or before today and end on or after today. Today is the browser's UTC date.
- Contract-ending-in-60-days: not on this page. It exists only in the Home page "OOH snapshot" card: sites whose end date is from today up to today plus 60 days, oldest end first, shown as "Ending in 60 days" count (orange when above zero) and a "Contracts ending soon" table (Site, Brand, Ends with "n days") of the first six, then "+n more on the OOH page". The OOH page has no list of these.
- Last-FY comparison appears only as the "FY 2025-26" figures from the FY report in KPI 5 and the brand-bar tooltips.
- No projection: there are none on this page.

States: "Loading saved sites…" while loading. Preview mode (no server): read-only, "Billboard sites are saved on the hosted dashboard." Map outline fallback text if used: "Loading Bangladesh outline…" / "Outline couldn't load; pins are placed by latitude and longitude." Viewer: sees every card, the map and pop-ups, but none of the buttons: Upload master sheet, Paste from Excel, Add billboard, Boundaries, + Photo, Set on map, Move pin, Edit.

Questions (2.3)
- Editing a site with the Edit form rewrites the document with only the ten form fields plus photos, so the SL number (and any saved "biz") appears to be lost; the site then sorts to the end. Master-sheet upload and Set on map do keep SL. Intended?
- "Active this month" really means "live today". Which does the client want?
- Which latitude and longitude limits are right? The form allows 20 to 27 and 88 to 93, the pin click 20.5 to 26.7 and 88 to 92.8, the master-sheet warning 20.5 to 26.7 and 88 to 92.8.
- The PRD talk of "contract ending in 60 days" lives only on Home; should the OOH page also flag or filter these?
- Legend and table call the fourth business "Others" in the cost chart but "Food & Beverage" in the table next to it.
- The cost-by-month chart shows contract spread into future months (and the FY KPI includes them), unlike the "no projected values" rule used for the spend report. Keep?
- Two OOH numbers can disagree (site contracts versus the FY spend report). Both are shown with different labels; confirm this is intended.
- A division-less pin that sits just outside the outlines is silently given a division by name or nearest capital; the footnote wording "no map pin yet" is then not always accurate.
- Delete has no confirmation. Deleted photos are not removed from storage.
- Master sheet: dates typed as text are read by the browser's own date parser (day/month order ambiguous); any row with a location is imported, so a total row with text in the location column would become a site.

## 3.1 Monthly Activity Calendar (route #calendar)

Title "Monthly Activity Calendar". Sub: "Brand × media activity and spend (BDT Mn), month on month · " plus the data source line (for example "Uploaded <file> · 12 Nov 2026, 10:30 · <name>", "Manual edit · …" or "Built-in data (12 Nov 2026 file (Jul–Oct'26))"). Header control: segmented "Gantt chart" | "Sheet view" (default Gantt). Business bar applies.

Dataset: key "calendar": list of months {m "2026-07", label, rows[], notes}. Each row: biz (Toiletries, Hygiene, Foods, Salt in the sample), b brand, v = four numbers in the order TV, Digital, Print, OOH in BDT Mn, t = row total. Brand names converted to official names. Brands are listed in sheet order of first appearance, grouped by business; a brand missing from a month counts as zero for it. Sample: Jul to Oct 2026, 26 rows a month.

Empty: card "No activity calendar yet / Upload the “All Activity Calendar” file in 6.1 Upload Data."

KPI cards (four), computed on the brands visible under the business bar, "last month" = latest uploaded month:
- "FY 2026-27 to date": total of all uploaded months, "x.xx Mn". Sub: "4 months: Jul'26 – Oct'26" (singular "1 month").
- "<Mon'YY> spend" (for example "Oct'26 spend"): last month's total, Mn. Sub: "▲ 12.3% vs Sep'26" or "▼ …" (change versus the month before), or "Latest month" if there is no earlier month or it was zero.
- "Active brands": number of brands with a total above zero in the last month. Sub: "in Oct'26 · N so far this FY" (N = brands with any spend in any uploaded month).
- "Media mix Oct'26": four whole-number percentages of last month's total, each in its medium colour, joined by " · " (TV · Digital · Print · OOH), small text. Sub: "TV · Digital · Print · OOH". Percentages are rounded separately so may not add to 100.

Gantt view (card "Activity Gantt · FY 2026-27"): sub "Each coloured lane is a medium; a continuous bar means the brand stayed on air month after month. Number = month spend (Mn) for the media shown."
- Controls: four toggle buttons TV, Digital, Print, OOH, each with a colour square, all on by default; at least one must stay on. Checkbox "Show inactive brands" (off by default: hides brands with no spend in any uploaded month for the media switched on).
- Table columns: "Brand" (min width 170), twelve months "Jul'26" to "Jun'27" (fixed list, not from data), "FYTD". The current calendar month (browser clock) has a blue outline on its header and cells.
- Rows: a shaded business header row (business name with Food & Beverage naming; monthly total for the media shown in bold, "–" if zero; FYTD total), then one row per brand (indented bold name). Business header repeats if a business appears in two separate runs.
- Brand month cell: small grey spend number on top (blank if zero), and under it one thin coloured lane per switched-on medium in fixed order (TV, Digital, Print, OOH). A lane is filled when that medium is above zero that month; consecutive months join into one continuous bar, with rounded ends at the first and last month. Empty lanes are blank. Months not yet uploaded: empty cell with grey diagonal hatching, no tooltip. Tooltip on uploaded months: "<Brand> · Oct'26", one line per active medium "TV: 0.25 Mn", then "Total: x.xx Mn"; "No activity" if nothing.
- Last row "Total": monthly totals of the rows currently shown, and grand total. FYTD column is the row's total across uploaded months.
- Legend: colours of the switched-on media plus a hatched swatch "Not yet uploaded".

Sheet view (card "CB Media Activity & Spending Amount (MN) · October 2026"; or "… · FY 2026-27 to date (Jul'26 – Oct'26)"): sub "Same layout as the Excel sheet · blank = no activity".
- Control: segmented month buttons for each uploaded month ("Jul'26" … "Oct'26") plus "FY to date"; default is the latest month; falls back to the latest if the choice no longer exists.
- Table styled like Excel (green header row): "Business", "Brand", "TV", "Digital", "Print", "OOH" (each with its colour square), "Total". Business name appears once, merged down its brands. Numbers show 2 to 3 decimals, blank for zero. After each business's brands a row "Total" (amber tint, per medium and overall). Last row "Grand Total" (green tint) across all visible brands. All visible brands are listed, including those with no spend.
- Under it, for a single month only, card "<Mon'YY> media notes" (sub "From the bottom of the month's sheet") with up to three groups: "TV channels used by brand" (chips such as "Leona · 9 channels"; read from text like "Leona: 09 ; Twinkle Baby Diaper: 12"), "TV channels on air (21)" (chips; first line of the notes cell, comma separated), "Digital platforms" (orange-tinted chips, comma separated). No notes card for "FY to date".

Below the Gantt or sheet, card (max width 820 px) "Month-on-month spend by media": sub "BDT Mn · hover a bar for the split"; stacked columns, one per uploaded month, four media series, 2-decimal labels, height 200.

Rules: FY months are Jul 2026 to Jun 2027, fixed in code. Future months are hatched in the Gantt and simply absent from the sheet view and the chart. No projections. Totals are only of brands that pass the business bar and brand access. Nothing is editable.

States: while data loads or none is uploaded, see the empty card above. Viewer and admin see the same page.

Questions (3.1)
- The spec/PRD says the Gantt is "month on month"; confirm that lane = medium and a bar joins consecutive months (that is what his code does), not one bar per campaign with dates.
- FY and year (2026/2027) are written into the code, not computed, so the page cannot roll to FY 2027-28 without a change.
- A CSV export function for the sheet view exists in his code but no button uses it; the generic Download menu is used.
- The "current month" outline uses the browser's local clock, while OOH "today" uses UTC.
- Business headers use the calendar file's own business names (Foods shown as Food & Beverage), not the FY file's grouping.

## 3.2 FY Media Spend Data (route #fy-spend)

Title "FY Media Spend Data". Sub: "ACI CB media spent report · BDT Mn by brand and month · FY 2026-27 vs FY 2025-26". Header control: segmented "All media" | "TV" | "Digital" | "Print" | "OOH" (default All media). Business bar applies.

Dataset: key "fy": one record per brand and medium: biz (Toiletries, Hygiene, Salt, Foods, Electrolyte, Commodity), b brand (official-name converted), med (TV, Digital, Print, OOH), m = 12 values Jul to Jun in BDT Mn, py = last FY (FY 2025-26) full-year total in BDT Mn. Sample: 108 records, data in Jul to Oct. Business for display: Foods, Electrolyte and Commodity become "Food & Beverage".

KPI cards (four, one per medium, always shown whatever the medium filter; they follow the business bar): label "TV", "Digital", "Print", "OOH"; value = FY-to-date total for that medium in Mn ("12.34 Mn"); sub "FY 2025-26: x.xx Mn" (the whole last year for that medium).

Table card "Brand × month spend" (adds " · TV" etc. when a medium is chosen). Sub: "Darker cells = higher spend · months after Oct not yet reported" (month name = last reported month). Columns: "Brand", "Jul'26" … "Jun'27", "FY to date", "FY 2025-26", "% of LY".
- Rows: grouped by business in fixed order Toiletries, Hygiene, Salt, Food & Beverage (only the chosen business if the bar is not All). Inside a group brands are sorted by FY-to-date, largest first; a brand with all media is the sum of its media rows. Brands with no spend and no last-year figure are hidden. After each group a shaded subtotal row named "<Business> total" (for example "Food & Beverage total"); last row "Grand total" (dark blue bar).
- Cells: brand row months show 2-decimal Mn with a blue heat tint whose strength rises from about 8 to 63 percent with the value relative to the biggest month cell on screen; "–" for zero in reported months; a small "·" for months after the last reported month. Subtotal and grand rows have no tint.
- "FY to date": bold sum. "FY 2025-26": last-year total or "–". "% of LY": FY to date divided by the whole last-year total, rounded to whole percent, or "–" if no last year.
- Table scrolls sideways on narrow screens. No sorting control, no row click.

Rules: reported months = months up to the last one where any brand has spend. No projection is drawn here (the Home page has a projection control; this page does not). Brand conversion as in the shared rules.

States: if nothing matches (for example a business with no data) only the "Grand total" row shows with dashes/zeros; there is no empty-state message. Viewer and admin see the same.

Questions (3.2)
- "% of LY" compares this year to date with the full last year, not the same months of last year, so it will look low early in the year. Wanted?
- KPI cards ignore the medium switch, while the table obeys it. Intended?
- No empty-state message when a business has no rows.

## 4.1 Electronic Media, 4.2 Digital Media, 4.3 Press & Radio (routes #ch-electronic, #ch-digital, #ch-press)

One shared layout, three datasets. Business bar is hidden; no business filter applies.
- 4.1: title "Electronic Media", sub "TV spend by channel · FY 2026-27 · BDT · Channel Cost sheet (updated 11 Nov 2026)", row noun "Channel" (data key elec, 35 rows, includes e.g. "Ananda TV").
- 4.2: title "Digital Media", sub "Digital spend by platform · FY 2026-27 · BDT · Channel Cost sheet (updated 11 Nov 2026)", row noun "Platform" (key dig, 16 rows, e.g. Facebook).
- 4.3: title "Press & Radio", sub "Newspaper and radio spend by name · FY 2026-27 · BDT · Channel Cost sheet (updated 11 Nov 2026)", row noun "Newspaper / station" (key press, 18 rows, e.g. Prothom Alo).
- Dataset key "channel" = {elec, dig, press}, each {rows: [{sl, n name, m = 12 monthly values in whole BDT}], notes: [[name, amount, …]]}. Names are shown as in the sheet (no brand-name conversion). The "(updated 11 Nov 2026)" text is typed into the code.

Header control: segmented "All (35)" | "With spend (n)" (default All). It only changes which rows the table lists.

KPI cards (four), label noun L = the row noun above:
- "FY spend to date": total of all months in Mn. Sub "Jul'26–Oct'26 · FY 2026-27" (last month with any spend) or "no spend yet".
- "<Oct'26> spend": last month with spend, Mn. Sub "+12% vs Sep" or "-8% vs Sep" (whole percent against the month before); blank if there is no earlier month or it was zero.
- "<L>s with spend": number of rows with any spend. Sub "of 35 listed". (Shows as "Channels", "Platforms", "Newspaper / stations".)
- "Top <l>": name of the biggest row (lower-cased noun in the label). Sub "x.xx Mn · NN% of total". "–" if no spend.

Two cards side by side (3:2):
- "Monthly spend" (sub "BDT Mn · months with data"): single-series blue stacked column chart, Jul'26 to the last month with spend, values in Mn with 2 decimals, number above each bar, 5 grid lines, tooltip "<month>: <series> / Total".
- "Share by <l>" (sub "FY to date, BDT Mn"): blue horizontal bars for rows with spend, largest first, value in Mn; tooltip name, value and "NN.N% of total"; the list scrolls after 300 px.

Table card "<L> × month" (sub "BDT · darker cells = higher spend · same layout as the sheet"). Columns: "SL", "<L>" (Channel, Platform or Newspaper / station), "Jul'26" … "Jun'27", "Total", "%", "In Million". Rows keep the sheet order (not sorted). Month cells are whole BDT with thousands separators and a blue tint (about 6 to 61 percent, scaled to the largest cell in the whole table), "–" for zero (including future months; there is no hatching). "Total" bold whole BDT or "–"; "%" the row's share of the FY total to one decimal; "In Million" 2 decimals. Totals row "Total": monthly column totals, grand total, "100%", Mn. Shaded row "Contribution": each month's share of the FY-to-date total as a whole percent. Footnote only when notes exist: "Totals here add up every month. In the sheet, the Total column is blank for <name> (<amount>), …, so the sheet's row totals come to X instead of Y." (4.2 names Instagram 2,255,297 and Online App 890,000; 4.3 names Naya Diganta 48,000 and Ittefaq 128,000; 4.1 has none.)

Rules: FY-to-date is the sum of all twelve months (future ones are zero). All money is in BDT in the table and Mn in cards and bars. No last-year comparison and no projection on these pages. Nothing is editable (manual entry is in 6.2, "Channel cost").

States: no empty-state text. With no spend, KPI 1 sub says "no spend yet", the chart is empty, bars say "No data." and the table shows dashes. Viewer and admin see the same.

Questions (4.1-4.3)
- Noun-based labels read oddly for 4.3 ("Newspaper / stations with spend", "Top newspaper / station"). Keep or reword?
- Dates and the "updated 11 Nov 2026" text are hard-coded, not taken from the upload.
- Footnote shows that the sheet's Total column is blank for a few rows while this page counts their months. Which total does the client treat as correct?
- Months after the last reported one show "–" here but are hatched on the calendar and "·" on 3.2: three different "not yet reported" styles.
- Channel names are not run through the brand-name list. Confirm that is intended.

## Summary of what was written
1. Shared rules (FY, currency, roles, brand names, business bar, tooltips, future-month styles) then one section per page: 2.3 OOH (largest), 3.1 Calendar (Gantt and sheet view), 3.2 FY Spend, 4.1-4.3 Channel pages as one shared layout.
2. Every KPI, table heading, filter label and message is quoted as in his code; dataset keys (fy, calendar, channel, ooh sites) and fields listed.
3. All rules are written out: daily OOH spread, business guess, division from pin with fallbacks, live and 60-day logic (60-day only on Home), FY July-June, last-FY comparison, future-month styles, brand-name conversion.
4. Viewer versus admin is spelled out; only 2.3 has edit controls (add, edit, delete site, photos, move pin, master sheet, paste, boundaries).
5. Open questions per page, mainly: SL lost when a site is edited by the form, "Active this month" means today, three different lat/long limits, "% of LY" uses the full last year, hard-coded FY 2026-27 and 11 Nov text, unused CSV button.
