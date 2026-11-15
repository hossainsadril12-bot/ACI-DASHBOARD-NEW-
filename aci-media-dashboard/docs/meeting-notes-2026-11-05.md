# Dashboard meeting 5 Nov 2026: analysis notes

Source: `clear_and_vague_points.pdf` (24 min 20 s meeting, 10 clear points, 9 vague points).
Status: analysis only. No code has been changed. Nothing here is approved for build yet.

## 1. What exists today

- **Home:** greeting, "Budget month" picker, four stat cards (live campaigns, starting soon, unpaid bills, overdue), Alerts card, Budget used, Bills waiting, Best channel for reach.
- **Menu:** Home, Plan, Spend, Billing, Performance, Digital Data, Competitor Tracking, Uploads & History, Settings.
- **Performance:** tabs "Both / TV / Digital". No OOH.
- **Digital:** spend stored and shown in BDT. Columns: spend, reach, impressions, CPM, ThruPlays, cost per view, engagement.
- **Billing:** one bills table with Excel export, status workflow and reminders.
- **Missing entirely:**
  - Login, users, roles, permissions. Everything is open (`src/proxy.ts` only remembers month and brand). `netlify.toml` exists, so a deployed copy would be public.
  - OOH (billboard) data, photos, maps.
  - A fiscal-year concept.
  - Channel-wise spend.
- Not inspected: the Spend page code and `digital-entries.tsx`. Some "missing" items below are inferred.

## 2. The 10 clear points

| # | Requirement | Current state | Work | Blocker |
|---|---|---|---|---|
| 1 | Performance on top of Home, Plan & Money below | No performance section on Home; only the "Best channel" card is close | Reorder and restructure Home | Minor: what counts as the "Performance section" |
| 2 | Remove the Alerts box | Exists | Small. e2e tests reference `alerts` and need updating | None |
| 3 | Live campaigns total + TV / Digital / OOH boxes | Only a total live-campaign count | New boxes | NEW: source of the counts. Plan lines have a channel but no TV station. Billboard locations need OOH data that doesn't exist |
| 4 | Digital: USD, scroll, Download, multi-select filters | BDT only. Table, download, filters not checked | USD display, horizontal scroll, download (reuse the bills/spend export pattern), multi-select filters | USD needs a source column or exchange rate (vague #8). Views, Clicks, CTR columns don't exist |
| 5 | Rename Both to Combined, add OOH tab with Open pop-up (photo + map) | No OOH anywhere | New OOH table (Location, Size, Vendor, Cost), image handling, map pop-up | Vague #5 |
| 6 | Keep Plan and Budget vs Planned vs Actual as is | Exists | Nothing, except hiding it from non-admins (#9) | None |
| 7 | Channel-Wise Spend tab between Spend and Billing | None | New page, menu item, fiscal-year grouping in BDT | NEW: fiscal-year start month not stated (July-June likely). "FB and Instagram separated" needs a split, but the app only has "Meta". Where do YouTube and TikTok go? Is "Press & Radio" one group? |
| 8 | Billing split: Summary and Details | One bills table | Switchable views. Details must copy the "Dashboard Media Final" Excel exactly | NEW: that Excel not seen; need its columns. Unclear what happens to current status workflow and reminders |
| 9 | Super-admin-only Plan, Spend, FY Report, Billing, plus Super Admin Panel | No auth | Auth, users, sessions, permissions model, admin UI | CONTRADICTION: tabs are "strictly" admin-only, yet the admin assigns tab permissions. Is "FY Report" the same as Channel-Wise Spend? |
| 10 | Postponed: AI/Ad Manager, Digital Media Report, Channel-Wise graphs | n/a | Nothing now | None |

## 3. The 9 vague points and what to ask the client

1. **Date range vs monthly data.** Excel only has months. Proposal: keep the month picker; Plan campaigns have real dates and could support a range for live-campaign counts. Ask client to confirm.
2. **"Best channel for reach".** Current rule: lowest cost per 1,000 people reached, using people-reached for both TV and digital. Ask: keep that, or highest raw reach?
3. **Digital top graphs and unified columns.** Wait for the client's PRD and Excel files.
4. **TV competitor table.** Ask which of the two tables was meant, and whether they will clean the horizontal months and hidden columns before upload. The parser depends on both.
5. **OOH photos and map pins.** Ask: photos as separate uploads or image links in Excel? Pins as Google Maps links or latitude/longitude? Suggestion: link or file name per row plus lat/long columns.
6. **Digital competitor data.** Wait for the sheet. The Competitor page already has an ad log for Meta/TikTok.
7. **Monthly agency spend table.** Wait for the client's structure.
8. **Currency and VAT.** Ask: does each tab only display numbers from its own file, or must the system convert USD to BDT and calculate VAT? Suggestion: no auto-conversion; add a USD column to the Digital Excel.
9. **Permission hierarchy.** Described by business unit at the start of the meeting and by tab and brand at the end. Proposal: each user gets a list of allowed tabs and brands, with business unit as a shortcut. Needs client confirmation and a user list.

## 4. Extra questions the PDF did not list

- Who is the Super Admin, and is there also a developer/agency admin account?
- Can the Super Admin grant Plan, Spend, FY Report or Billing to staff, or never?
- Fiscal-year start month.
- The "Dashboard Media Final" Excel file.
- Digital multi-select "Primary Metrics" most likely means choosing which metric columns to show. Confirm.

## 5. Suggested order of work

1. **No blockers:** rename to Combined, remove Alerts, reorder Home, Digital scroll/Download/filters (except USD).
2. **Small decisions needed:** Live campaign boxes, Channel-Wise Spend.
3. **Needs client files:** Billing split, OOH tab and map.
4. **Sensitive, needs explicit sign-off:** auth and Super Admin Panel (users, passwords, schema, permissions).

## 6. Decisions log (after the client shared the "Media Mind" prototype)

> **Superseded on 12 Nov 2026:** the client sent `Media_Mind_PRD_v2.pdf` and the decision is **we follow the PRD**.
> Where this log disagrees with the PRD, the PRD wins. See `client-prd-v2-comparison-2026-11-12.md`.
> Items below that the PRD overrides: Plan form and Budget vs Planned vs Actual (PRD removes budget planning),
> our own Excel templates (PRD reads his existing files), "Others" grouping (PRD: Food & Beverage),
> OOH map link button (PRD: real map with lat/long pins), Businesses & Brands create-by-hand (not in PRD),
> logins later (PRD: now), Combined tab and column picker (not in PRD).

The prototype is treated as the wireframe: its tables define the Excel template columns.

**Locked**
- Every page gets a **Year (FY, July-June) and Month** filter.
- A **date-range filter** only where real dates exist: campaigns, OOH sites, bills.
- TV, Digital and Spend data are monthly. A date filter for them would need daily rows (date column) in the Excel; not planned.
- Plan stays as it is (admin picks a brand, marks start/end dates, Budget vs Planned vs Actual).
- Plan and Performance stay separate (they only share brand and month).
- OOH: a **Map link** column in the template and plan form; shown as an "Open map" button in the OOH table.
- Every data table shows a default set of common columns, with a **column picker** (select / unselect) to show or hide the rest.
- Excel **templates** are generated from the prototype's tables; the user downloads, fills in and uploads.
- Brands are **not** created in Settings. A dedicated **Businesses & Brands** section makes businesses easy to find and lets the admin create brands and upload information there.
- The admin can also **create a new business** in Businesses & Brands (not only brands). Rules: a business can be **renamed** any time; it is **hidden, never deleted**, so spend history stays intact; **no duplicate names**; only the **admin** can create or hide businesses (enforced once logins exist).
- Data uploads are also available on each business page: the business comes from where the user uploads, the platform/media comes from the file's Platform/Media column. "Running this month" per brand is derived automatically from uploaded data and Plan campaigns, with no manual assignment. The existing upload areas stay as shortcuts (to confirm).
- Later: agency spend table, digital competitor data, login and permissions.

**Also locked (moved from "waiting for the client"; change later if the client says otherwise)**
- **Plan and Media Spend are merged** into one "Media Spend" section with four views: Calendar, Budget vs Planned vs Actual, FY Spend, Channel Wise. Planned months show lighter and turn solid once real spend arrives.
- **Scope = the meeting list plus the prototype's pages.** Billing (Summary and Details), the "Combined" Result tab, Plan, and the prototype's pages (Influencer, Media Budget per business) are all kept. Staff logins and permissions stay in scope but are built later.
- **Year and month are enough.** No daily numbers for TV, Digital and Spend.
- **Foods, Electrolyte and Commodity are grouped as "Others"**, like the prototype. The admin can create or hide businesses, so this is easy to change.
- **Press and Radio are kept** as media options for now (the prototype only has "Print"); remove later if the client asks.
- **May 2026 TV data:** the corrected file is a data task for the client, not code. The upload checks must reject impossible values (reach above 100%, spots far too large), so a broken file can't be imported.

**Still open**
- Show Business next to Brand on the plan form (suggested: dropdown grouped by business).
