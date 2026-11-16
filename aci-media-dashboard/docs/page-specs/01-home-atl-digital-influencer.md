# Content spec: 1 Home, 2.1 ATL, 2.2 Digital, 2.4 Influencer

> **Decisions of 16 Nov 2026 override this spec where they differ.** See `docs/design-summary-2026-11-15.md` section 11:
> - real upload dates, never typed-in dates;
> - "% of last year" like for like when possible;
> - one CPV rule (spend ÷ views);
> - built-in OOH borders only;
> - no built-in data (pages show an empty state until their first upload).

Source read: Asset/MediaMind_SelfHost_v2.1/media-mind-selfhost/source/template.html (v2.1, state of 12 Nov 2026), plus docs/TECHNICAL_SPEC.md and the built-in files in source/data. Page code lives in the page table near line 209 (home, atl, digital, influencer), with helpers in `digTables` (line 476) and `oohSnapshot` (line 1166). Where the code and TECHNICAL_SPEC disagree, this spec follows the code and flags it under Questions.

## Shared rules (all four pages)

- Page header: title, one-line subtitle, then a "Download" button at the right (Excel, CSV, PDF, PowerPoint; Excel/CSV/PDF are built from whatever tables are on screen). The menu also lists the original uploaded Excel source files when they exist (Home: the FY file; ATL: the selected category's TV file; Digital and Influencer: the three business digital files, only for businesses in view). Some pages add page controls to the left of the Download button.
- Business bar above every page, labelled "Business": segmented buttons "All businesses", "Toiletries", "Hygiene", "Salt", "Food & Beverage". Food & Beverage is internally called "Others" and covers Foods, Electrolyte and Commodity. Choice is remembered in the browser (key mm-biz). A small note at the right says "n brands" (distinct brand count from the FY file), or the four business names when All is selected.
- Colours (light theme): series 1 blue #2a78d6, series 2 orange #eb6834, series 3 green #1baf7a, series 4 amber #eda100, primary navy #0041a0, text #0b1a3a, muted #64708a, grid #eceff5. A dark theme exists with slightly shifted values (#3987e5, #d95926, #199e70, #c98500). By medium: TV = series 1, Digital = series 2, Print = series 3, OOH = series 4. By platform: Meta = series 1, YouTube = series 2, TikTok = series 3. By business: Toiletries = series 1, Hygiene = series 2, Salt = series 3, Food & Beverage = series 4.
- Number formats: two decimals for BDT Mn (f2), one decimal for chart axes (f1), whole numbers with thousands commas (int), percent one decimal unless stated, short counts "1.2K / 3.4M / 1.05B". Months are labelled like "Oct'26".
- Financial year: July to June. Home labels are hard-coded "FY 2026-27" and "FY 2025-26". FY month columns are Jul'26 to Jun'27.
- Currency: BDT Mn on Home and ATL (ATL source is raw BDT, divided by 1,000,000 for display). Digital page shows USD exactly as uploaded. Home's digital snapshot and the Influencer page convert USD to BDT with one global rate (default 123 BDT per USD; admin can change it between 50 and 500 on page 7.2 Data Sources; stored as budget/fx).
- Hover: every chart bar, line column and horizontal bar shows a dark tooltip following the mouse (title in bold, then one line per series, then a Total for stacked bars).
- Access: the code runs with open access (OPEN_ALL true), so viewers and admin see the same four pages and filters. The role chip in the sidebar reads "Viewer · read only", "Editor · data entry" or "Super admin". None of these four pages has an edit control. Admin differences live elsewhere (uploads, FX rate, OOH site edits). The per-person access code (hidden sections, businesses, brands) is dormant but still filters by brand if switched on.
- Data loading: built-in data renders at once. If the server has newer uploads, a small black banner bottom right says "Loading the latest uploaded data…"; on failure it says "Couldn't reach the latest uploaded data; showing the last version available." The page re-renders when new data arrives. With no server the role chip says "Preview mode".

## 1 Home

Shows, top to bottom (all figures follow the Business bar; subtitle: "ACI Consumer Brands · all businesses (or the business name) · FY 2026-27, Jul–<last reported month> reported. Figures in BDT Mn unless noted."):
- Four KPI cards. (1) "Spend to date", total BDT Mn, sub "Jul–Oct'26 · 4 of 12 months of FY 2026-27". (2) "<Month'26> spend" (the last reported month), BDT Mn, sub "+x% vs <previous month>" (sign shown, no decimals) or "latest month" if there is no prior month with spend. (3) "FY 2025-26 actual", BDT Mn, sub "x% of last year spent so far" (blank if no last-year figure). (4) "TV share of spend", TV divided by total as whole percent, sub "Digital x% · Print x% · OOH x%". The dash is shown when total is zero.
- Card "Monthly spend by media" (sub "BDT Mn, reported months"): stacked column chart, one column per reported month (Jul'26 onward, not the empty future months), segments TV, Digital, Print, OOH in medium colours, total printed above each column, y axis in steps with one decimal, legend below. Tooltip lists each medium with a value plus Total.
- Card "Spend by business" (when All) or "Top brands" (any other business), sub "FY to date, BDT Mn": horizontal bars with value at right. All: four bars (Toiletries, Hygiene, Salt, Food & Beverage) in business colours. Single business: top 8 brands by FY-to-date spend, all in series-1 blue.
- Card "ATL snapshot · Savlon Soap, <latest month>" (sub "Soap category, TG Female 25+"): four mini figures GRP (whole number), SOV (one decimal %, with "rank n of N" underneath), "1+ reach" (whole %), CPRP (whole number). Link "Open ATL Media Performance →" goes to #atl. If Savlon Soap has no row that month: "No Savlon Soap activity this month." This card ignores the Business bar.
- Card "Digital snapshot · all businesses (or business), <latest month>" (sub "Meta, YouTube, TikTok · spend in BDT Mn (at BDT 123/USD)"): "Spend" (USD x rate, shown "x.xx Mn"), "Impressions" (short count), "Views" (short count), "Ads live" (count of ad rows in that month). Link "Open Digital Media Performance →".
- Card "OOH snapshot · <business>" (sub "Billboard sites from the master sheet · cost spread over each contract's months"), link "Open OOH Media Performance →". Three columns. Left: small Bangladesh map of the 8 divisions, each filled in its fixed colour (Rangpur #7a4fa0, Rajshahi #1f74bb, Mymensingh #118a83, Dhaka #e08a1e, Sylhet #cf3f3a, Khulna #c13b7b, Barishal #2c3f8c, Chattogram #3c9447), site pins dark navy if the contract is live today and grey if not; hover on a division says "<Division> / n billboard sites"; hover on a pin shows location and brand; the whole map links to #ooh. Middle: four figures "Billboard sites" (sub "n live today"), "Cost FY 2026-27" (BDT Mn, sub "share of contracts in this FY"), "Running cost / month" (BDT Mn, live sites only, sub "live sites"), "Ending in 60 days" (count, orange if above zero, sub "contracts to renew or close"); under them "Sites by division" horizontal bars (count, sorted high to low, division colours). Right: "<FY> cost by business · BDT Mn" bars (only businesses above zero) and "Contracts ending soon" mini table with columns "Site", "Brand", "Ends" (date plus "n days"), first 6 by end date, then "+n more on the OOH page".
- Card "Brand spend, FY to date" (sub: BDT Mn, and that "% of last FY" compares spend so far against the full FY 2025-26 total). Table columns in order: "Brand", "Business", "TV", "Digital", "Print", "OOH", "FY to date", "FY 2025-26", "% of last FY". Sorted by FY-to-date total, high to low. Brands with no spend this year and no last-year figure are dropped. Zero cells show a dash. "% of last FY" is whole percent, or a small blue tag "new" when there is no last-year figure. Business column shows Food & Beverage for the Others group. No totals row.

Data and fields:
- FY file (`fy`, rows: biz, b brand, med, m = 12 monthly BDT Mn values Jul to Jun, py = FY 2025-26 total): everything except the two snapshot cards and the OOH card. In the file the medium "Press" is renamed "Print". Brands are first mapped to official full names.
- ATL (`atl`, the Savlon Soap category only, `cats.soap`): fields b, grp, sov, reach, cprp.
- Digital (`dig-Toiletries`, `dig-Hygiene`, `dig-Salt` merged): fields m, spend (USD), imp, views, bz.
- OOH sites (collection ooh): start, end, cost (BDT), lat, lng, location, brand, biz.

Calculations and rules:
- Months reported (NREP) = highest month position in the whole FY file with any spend, whatever the Business bar says. Spend to date = sum of all medium rows over those months. Last-month change = last month divided by previous month, minus 1.
- Business group for a brand comes from the FY file group; Foods, Electrolyte and Commodity all become Food & Beverage (Others).
- ATL rank = position by SOV (high to low) among every brand on air in the latest month (not only ACI brands). "Latest month" = the highest month key in the Savlon Soap data.
- Digital snapshot month = latest month in the digital data (after Business and brand filtering; falls back to all data if empty).
- OOH cost: contract cost divided by contract days (start to end inclusive), then each calendar month gets days-in-month times that daily rate; FY cost sums the months that fall in the current FY. Running cost per month = daily rate times 365 divided by 12, live sites only. "Live today" uses the viewer's computer date. A site's business comes from its stored business, else guessed from the brand name.
- Unreported future months are simply not drawn on Home (no hatching on these four pages; hatching exists only on the calendar page).

States: no explicit empty state for KPIs and the table (zeros and dashes). OOH card has two: "Loading billboard sites…" and "No billboard sites for this selection" with the link; map says "Map loading…" until boundaries load; contracts list says "No contracts end in the next 60 days." ATL card has the "No Savlon Soap activity" message. Viewer and admin see the same page.

Questions:
- The "projection" helper (FY forecast and run rate, and a hidden mode choice) exists but is not displayed; confirm Home should show no forecast (TECHNICAL_SPEC says no projected values).
- Home ATL card is hard-wired to Savlon Soap and ignores the Business bar; intended?
- "1+ reach" shows 0% on Home, but the built-in ATL data has reach 0 for every brand (the ATL page shows a dash for zero). Is reach really not supplied?
- OOH card uses the computer's current date for its FY label while the rest of the page says FY 2026-27 in fixed text; they will drift apart from July 2027. Same for fixed "FY 2025-26", Jul'26..Jun'27 labels and the digital month parser (months hard-coded to 2026-07 to 2027-06).
- Month count ignores the Business bar, so a business with no spend in the latest month shows a 0.00 latest month and an empty last column.
- OOH cost here comes from the billboard master sheet, while the FY file also has an OOH medium; the two can disagree.
- Card title "TV share of spend" also carries Digital, Print and OOH shares in its sub line; fine to keep?

## 2.1 ATL Media Performance

Subtitle: "TV competitive monitoring across <n> categories · GRP, spend, share of voice (SOV) and share of spend (SOE) · <source line>". Source line reads "Built-in data (Oct'26 files, 13 categories)" or "Uploaded <file> · <date> · <person>". If no category matches the Business bar: "No ATL data for this selection / Pick another business, or upload a category's TV dashboard file in 6.1 Upload Data."

Section A, "All ATL categories at a glance" (sub "Our brand's TV weight against its category · click a row to open it"). Control: "Month" select (newest first, default latest month across all categories). Table columns: "Category (our brand)", "Business", "GRP", "Spend (Mn)", "SOV", "SOE", "SOV rank", "Category leader (SOV)", "Category spend (Mn)". One row per category, in fixed order: Savlon Soap, Septex, Savlon Handwash, Savlon Liquid Antiseptic, Baby Soft, Savlon Baby Wipes, Twinkle Baby Wipes, Freedom Sanitary Napkin, Twinkle Baby Diaper, ACI Pure Salt, Mustard Oil, ACI Pure Fortified Rice, Basic Spices (display names after the rename rule below). Cells: our GRP whole number; spend in BDT Mn; SOV bold percent; SOE percent; rank as "#2 of 13"; leader as brand name plus its SOV whole percent, with a green tag "ACI leads" when the leader is our own brand; last column total category spend. If our brand is not on air that month: SOV cell shows grey tag "Not on air" and the rest dashes. If the category has no data that month: one merged cell "No TV monitoring for <month> · latest <month>". No totals row. Rows are clickable (hover highlight): clicking selects the category, redraws the detail section and scrolls to it. The selected row is outlined in navy.

Section B, detail card (navy top border), title "<Category> · TV competitive monitoring", sub "Category: … · TG <target group> · population <n> Mn · <first month> – <last month>" (parts shown only when present). Three selects: "Category" (grouped by business: Toiletries, Hygiene, Salt, Food & Beverage), "Month" (newest first), "Focus brand" (first option "<category name> (ours)", then every brand seen in that category). Changing category resets month to its latest and focus to ours.
- Six KPI cards for the focus brand and month: "GRP" (sub "NGRP n · ACD x.xs"), "Spend" (BDT Mn; sub "category x Mn"), "Share of voice" (percent; sub "rank n of N brands on air"), "Share of spend (SOE)" (sub "of category TV spend"), "1+ reach" (whole percent, dash if zero; sub "n spots"), "CPRP" (whole number, dash if zero; sub "BDT per rating point"). If the focus brand is not on air: one card "<name> / Not on air" with sub "no TV activity in <month> · n competitor brands on air, x Mn spend".
- Chart "<focus> · GRP by month" (sub "Gross rating points delivered", plus "· last 16 months" when more exist): single-series column chart in series-1 blue, x axis months (last 16 only), y axis GRP whole numbers, values printed above bars only when 12 or fewer months. If all zero: "No TV activity / <name> was not on air in <first> – <last>."
- Chart "Share of voice vs top spenders" (sub "SOV = share of category NGRP · competitors ranked by total spend"): line chart, x months, y percent (0 to nice maximum, whole percent), focus brand in blue plus the three competitors with highest total spend over the whole history (orange, green, amber), dots on each point, legend, hover column shows each series (a dash if no value).
- Card "Competitive set · <month>" (sub "Sorted by GRP · ACI brands highlighted"). Columns: "Brand", "GRP", "ACD", "Spend (Mn)", "SOV", "SOE", "1+ reach", "Spots", "CPRP". Sorted by GRP, high to low. Our own rows get a green tag "Ours"; other ACI-family brands (names starting aci, savlon, septex, leona, freedom, twinkle, baby soft, super dry) get a blue tag "ACI" and bold name. Totals row "Total": GRP sum, Spend sum, SOV 100%, SOE 100%, Spots sum; ACD, reach, CPRP blank. Zero ACD, reach, CPRP show dashes. Empty: "No brand was on air this month."
- Card "SOV ranking · <month>" (sub "Share of voice, all brands on air"): horizontal bars sorted by SOV; focus brand blue, other ACI green, competitors grey; tooltip "GRP n · Spend x Mn"; legend "<focus>", "Other ACI", "Competitor".

Data and fields: `atl` = dictionary of categories; each has name, biz, tg, pop, category, own (our brand name list), brands, and months keyed "YYYY-MM" each a list of brands with b, grp, acd, ngrp, sp (BDT, whole), sov, soe, reach, spots, cprp. Soap runs Jul'25 to Oct'26, 13 brands in Oct'26. Salt goes back to Jul'23.

Calculations and rules:
- SOV = brand NGRP divided by category NGRP for that month (falls back to GRP shares if NGRP is zero). SOE = brand spend divided by category spend. Both are recomputed on upload (the file's own percent columns are ignored) and stored to 4 decimals.
- Rank = position by SOV in that month; rank denominator = brands on air that month. Category leader = highest SOV.
- If our brand has several rows in a category (e.g. Spices: four ACI Pure variants), they are combined: GRP, NGRP, spend, SOV, SOE, spots summed; reach = largest; ACD = GRP-weighted average; CPRP = spend divided by GRP; shown as "<category> (all variants)". Single own-row categories show the clean category name instead of the file's brand name.
- Calendar months, not FY. Only months present in the file appear on axes (a month with no TV rows is skipped, not shown blank). In the SOV line a competitor that is absent in a month is plotted as 0%.
- Brand-name exceptions: category display names are overwritten (handwash = "Savlon Handwash", antiseptic = "Savlon Liquid Antiseptic", septex = "Septex", mustard = "Mustard Oil", spice = "Basic Spices", diaper = "Twinkle Baby Diaper", freedom = "Freedom Sanitary Napkin", salt = "ACI Pure Salt", plus others). Competitor names are shown as uploaded.
- Currency BDT Mn throughout, never USD.

States: no-data message above; per-row and per-card empties described. Viewer and admin identical; admins can upload each category file in 6.1 and the page re-renders.

Questions:
- Category names are renamed at load (the file says "Savlon Hand Wash", the page shows "Savlon Handwash"; likewise Savlon Liquid Antiseptic, Septex, Mustard Oil, Basic Spices, Twinkle Baby Diaper); confirm the final display names.
- "1+ reach" is zero everywhere in built-in data; is the reach column in his Excel files ever filled?
- SOV is recomputed from NGRP on upload and the file's own SOV% column is discarded; confirm NGRP (not GRP) is the intended base.
- Three-competitor line uses whole-history spend, but only 16 months are drawn.
- Category tag "Food & Beverage" for mustard, rice and spices shows under Others; confirm.
- A category with a stale last month (Salt: Sep'26, Antiseptic: Sep'26, Baby Wipes: Apr'25) still appears; is that wanted?

## 2.2 Digital Media Performance

Subtitle: "<Toiletries, Hygiene and Salt | business> business · Meta (Facebook, Instagram), YouTube and TikTok · spend in USD". When the Business bar is Food & Beverage a blue note shows above: "No digital file for Food & Beverage yet. Digital data is uploaded for Toiletries, Hygiene and Salt."

Controls (left of Download): three selects "Platform" (All, Meta, YouTube, TikTok), "Brand" (All plus every brand in view, A to Z), "Month" (All plus months in the data, oldest first, labelled "Jul'26"). Platform is shared with the Influencer page. Any change resets the ads table to its first 50 rows.

Five KPI cards (current filters): "Spend" (USD whole dollars with $, sub "n ads / placements"); "Impressions" (short count, sub "CPM $x.xx"); "Reach" (short count, sub "summed across ads (not de-duplicated)"); "Video views" (short count, sub "CPV $x.xxxx · ThruPlay / TrueView / TikTok views"); "Clicks" (short count, sub "CTR x.xx% · CPC $x.xxx").

Charts: "Spend by month and platform" (sub "USD"): stacked columns, one per month in the data (all months, even when the Month filter is on, so unselected months show empty), segments Meta, YouTube, TikTok, total above each column as "$12K" style, legend. Second card: when Business is All its title is "Spend by business" (bars Toiletries, Hygiene, Salt in business colours, USD whole dollars; Food & Beverage omitted) followed by a sub-heading "Spend by brand"; otherwise the title is "Spend by brand" with sub "USD, current filters". Brand bars sorted high to low, series-1 blue.

Ads table, one card per platform, title "Meta (Facebook & Instagram) · ads data" / "YouTube · ads data" / "TikTok · ads data", sub "Same headings as the sheet · 50 of N rows · scroll sideways for all N columns". When Platform = All, three tab buttons "Meta (n)", "YouTube (n)", "TikTok (n)" switch the table (counts follow Brand and Month filters). Table scrolls (max height 640px) with a sticky header. Columns exactly:
- Meta (23): Brand, Month, Content Type, Content Link, Bid Type, Reach, Impressions, CPM, ThruPlays, CPV, Video Play at % (grouped heading over 25%, 50%, 75%, 95%, 100%), Post Engagements, CPE, Clicks, CTR, CPC, Frequency, VTR (6/10/15 Sec), Spent (USD).
- YouTube (19): Brand, Month, Content Type, Content Link, Bid Type, Impressions, CPM, TrueView, CPV, Video Play at % (25%, 50%, 75%, 100%), Clicks, CTR, CPC, Unique User, Avg. Imp. Freq. /User, Spent (USD).
- TikTok (19): Brand, Month, Content Type, Content Link, Objectives, Reach, Impressions, CPM, Video views, CPV, Video Plays at % (25%, 50%, 75%, 100%), Clicks, CTR, CPC, Frequency, Cost.
- Cell formats: counts whole numbers; CPM, CPC and spend "$" two decimals; CPV and CPE "$" three decimals (Meta) or four (YouTube, TikTok); CTR and VTR percent two decimals; Meta and TikTok video-play columns are counts, YouTube video-play columns are percent two decimals; frequency two decimals (YouTube one). Month shown as "Jul'26". Brand is bold with the business name underneath when Business = All. Content Link shows a shortened clickable address (first 28 characters, "…") opening in a new tab. Rows keep file order (not sorted); first 50 shown, button "Show all N rows" / "Show first 50".
- Footer row "Total": sums counts, video-play counts (Meta and TikTok) and the last column (spend); leaves rates blank. Footnote: "Total row adds spend and count columns only; rates (CPM, CPV, CTR, frequency) aren't added up."
- Empty: "No <platform> rows / for these filters" (plus " · the Salt TikTok sheet has no data yet" for Salt).

Data and fields: `dig-Toiletries`, `dig-Hygiene`, `dig-Salt`, each with a summary list (bz, p platform, m "YYYY-MM", b brand, content, link, bid, reach, imp, views, eng, clicks, freq, spend in USD, v25, v100, p2) used for KPIs and charts, and the raw sheet rows (cols and rows with bz, m and the 23/19/19 cell values) used for the tables. Built-in: 424 ad rows, Jul to Oct 2026.

Calculations and rules:
- CPM = spend divided by impressions times 1000. CTR = clicks divided by impressions. CPC = spend divided by clicks. CPV = spend of only the rows that have views, divided by total views. Reach is a plain sum, deliberately not de-duplicated. Each shows a dash when the denominator is zero.
- Spend is USD here; no FX. Month names in the upload are matched by their first three letters and mapped only to Jul'26 to Jun'27.
- Brand names are normalised when the Excel is read: any name containing "savlon" (but not "savlon men") becomes "Savlon Soap"; skinzen becomes "SkinZen"; shinex "Shinex"; neem "Neem"; septex or spetex "Septex"; names starting "wonder" become "Wonder"; otherwise the text before " - " is kept. So campaign names such as "Savlon Relaunch" display as "Savlon Soap" in the Brand select and the tables. The "Spend by brand" bar chart, however, converts these a second time to the official full names (SkinZen Shower Gel, ACI Neem Original, Wonder Kitchen Care, Savlon Men Shower Gel, Septex, Leona and so on).
- Business filter applies to every figure; Month and Brand filters apply to KPIs, brand bars, platform bars and tables, but not to the monthly chart's axis.

States: Food & Beverage note; per-table empty message; no page-level loading state beyond the global banner. Viewer and admin identical.

Questions:
- TECHNICAL_SPEC says this page keeps uploaded brand names, but the code renames them on upload and again in one chart; which labels should the new build show?
- A function that would relabel columns "Spent (BDT Mn)", "CPM (BDT)" and so on exists but is unused; confirm the table should stay USD with "Spent (USD)" headings.
- Month select breaks for any brand name containing a hyphen (it treats it as a month); not hit with current data.
- Meta reach, YouTube "Unique User" and TikTok reach are all summed into the single "Reach" KPI.
- Months are hard-wired to FY 2026-27; how will FY 2027-28 ads be dated?

## 2.4 Influencer Campaign Performance

Subtitle: "Paid boosting of influencer content · <Toiletries, Hygiene and Salt | business> · Meta, YouTube, TikTok · spend in BDT Mn (at BDT 123 per USD)". Page control: a segmented button group "All platforms", "Meta", "YouTube", "TikTok" (shared with page 2.2). There is no Month or Brand control here.

Scope: only digital ad rows whose "Content Type" text contains the word "influenc" (any case). Built-in data has 17 such rows (Meta 8, YouTube 5, TikTok 4) across Jul'26, Aug'26 and Oct'26. Business bar still applies.

Five KPI cards: "Spend" (BDT Mn shown "x.xx Mn", sub "n influencer posts boosted"); "Video views" (short count, sub "CPV ৳x.xx"); "Impressions" (short count, sub "CPM ৳x.xx"); "Engagements" (short count or dash, sub "Meta post engagements"); "Clicks" (short count, sub "CTR x.xx%").

Charts: "Spend by month and platform" (sub "BDT Mn"): stacked columns for each month that has any influencer row (Jul'26, Aug'26, Oct'26; September is skipped because it has none), segments Meta, YouTube, TikTok in platform colours, two-decimal labels and totals, legend. "Spend by brand" (sub "BDT Mn"): horizontal bars sorted high to low, value shown as "x.xx Mn".

Table "Influencer posts" (sub "Sorted by spend"). Columns exactly: "Brand", "Platform", "Month", "Content", "Spend (BDT Mn)", "Reach", "Views", "CPV", "CTR". Sorted by spend, high to low; no paging and no totals row. Brand in bold (official full name). Platform shows Facebook, Instagram, YouTube or TikTok (Meta rows are split by whether the link contains facebook or instagram). Month as "Jul'26". Content is the text of the Content Type cell, turned into a link when the Content Link is a web address. Spend two decimals. Reach and Views short counts, dash if zero. CPV = spend divided by views, in BDT with ৳ and up to two decimals (dash if no views). CTR = clicks divided by impressions, two decimals (dash if either is missing). Footnote under the table: "Influencer fees (content creation, talent payments) aren't in the digital file yet; add them to show full cost per influencer."

Data: the same digital datasets as page 2.2 (`dig-Toiletries`, `dig-Hygiene`, `dig-Salt`), fields p, p2, m, b, content, link, spend (USD), imp, reach, views, eng, clicks.

Calculations and rules:
- BDT amount = USD times FX rate (default 123), divided by 1,000,000 for Mn. Same global rate as Home.
- Here CPV uses total spend divided by total views, unlike page 2.2 where only spend on rows that have views is used, so the same rows give different CPVs on the two pages. CPM = spend divided by impressions times 1000 (BDT).
- The brand bar uses the upload-normalised names (e.g. "SkinZen", "Neem", "Savlon Soap"), while the table uses full official names (e.g. "SkinZen Shower Gel", "ACI Neem Original").

States: no empty message. With no matching rows the KPIs show zeros and dashes and the table shows only its heading row. Food & Beverage shows nothing and no explanatory note. Viewer and admin identical.

Questions:
- Is the "influenc" text match in Content Type the intended definition of an influencer post? One built-in row is "Influencer Content 11 Sec".
- Should this page honour the Month and Brand filters like page 2.2? Currently it ignores them.
- Which CPV definition is correct, and which brand naming (short or full) should the brand bar use?
- The Spend KPI and brand bars show "x.xx Mn" without a currency sign, while CPV and CPM carry the taka sign; confirm labels.
- The PRD (not read here) may list influencer fee fields; the footnote says fees are not in the file yet.

## Summary

- Wrote content specs for Home, 2.1 ATL, 2.2 Digital and 2.4 Influencer, with exact column headings, KPI formulas, units, chart series and colours.
- Home also covers its ATL, Digital and OOH snapshot cards and the Brand spend table; ATL has the category overview plus category detail with six KPIs and four widgets.
- Digital has the 23, 19 and 19 column ads tables per platform; Influencer is the digital data filtered to content text containing "influenc".
- Open points: digital brand-name renaming differs from TECHNICAL_SPEC, CPV is defined differently on 2.2 and 2.4, and FY labels and month parsing are hard-coded to FY 2026-27.
- Also open: ATL reach is always zero in sample data, Home's ATL card ignores the Business bar, and Influencer ignores the Month and Brand filters.
