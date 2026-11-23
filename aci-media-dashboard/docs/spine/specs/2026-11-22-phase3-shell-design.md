# Phase 3 shell: PRD sidebar, Business filter, empty state, units

Approved by Sadril on 22 Nov 2026 (FRAME, branch `phase3-shell`).

## Goal

Give the app the PRD's structure before any Phase 3 page is built. After this step, every PRD page has a working link. Each page then gets built one at a time and tested from an empty store.

## Decisions (from the FRAME questions)

1. **The sidebar follows the PRD.** The old sample pages leave the sidebar, but their links keep working until Phase 6 deletes them. Those pages are Performance, Digital Data, Competitor Tracking, Plan, Spend and the old Billing page.
2. **Every PRD page shows in the sidebar from day one.** An unbuilt page opens a "being built" note that names the file it will read.
3. **Businesses & Brands is 6.4, under Data Entry.**
4. **Business filter: buttons when there are 4 or fewer businesses, a dropdown with search when there are more** (Hick's law). Month, FY and brand pickers live on the pages that need them and are added as each page is built.

## Sidebar

Number and name come from the PRD. Each link opens one route.

- 1 Home: `/`
- 2 Campaign Performance (group)
  - 2.1 ATL Media Performance: `/atl`
  - 2.2 Digital Media Performance: `/digital-performance`
  - 2.3 OOH Media Performance: `/ooh`
  - 2.4 Influencer Campaign Performance: `/influencer`
- 3 Media Spend (group)
  - 3.1 Monthly Activity Calendar: `/calendar`
  - 3.2 FY Media Spend: `/fy-spend`
- 4 Channel Wise Spend (group)
  - 4.1 Electronic Media: `/channel/electronic`
  - 4.2 Digital Media: `/channel/digital`
  - 4.3 Press & Radio: `/channel/press-radio`
- 5 Billing & Statement (group)
  - 5.1 Billing Overview: `/billing/overview`
  - 5.2 Vendor Statement: `/billing/vendors`
  - 5.3 Media Billing Data Sheet: `/billing/sheet`
  - 5.4 OOH Media Bill Details: `/billing/ooh`
- 6 Data Entry (group)
  - 6.1 Upload Data: `/data-entry`
  - 6.2 Manual Entry: `/data-entry?tab=manual`
  - 6.3 Upload History: `/data-entry?tab=history`
  - 6.4 Businesses & Brands: `/businesses`
- 7 Settings (group)
  - 7.2 Data Sources and USD rate: `/settings`. This is today's Settings page until p3-16 rebuilds it.
  - 7.3 My Access: `/settings/access`

7.1 User Settings is left out of the sidebar, because per-person access is switched off for the first release.

How the sidebar behaves:
- **Groups open and close.** The group holding the current page starts open, and the others start closed.
- **The current link is highlighted.** For the Data Entry tabs this uses the `tab` value, so 6.2 is highlighted on `/data-entry?tab=manual`.
- **Phone:** a Menu button in the top bar opens the full sidebar in a drawer. This replaces the current sideways-scrolling row, which cannot hold 20 links. Choosing a link closes the drawer.
- **The admin's quick actions stay where they are.**

## Pages not built yet

Each unbuilt PRD route renders one shared "being built" view with:
- the page title, with its PRD number and name;
- the line "This page is being built.";
- the line "It will read:", followed by the file name(s) from the file-to-page map;
- for the admin, a link to the matching Data Entry card. Viewers get no link.

Home (`/`) shows this view until Home is built, which is last in the Phase 3 order. Its file note reads FY spend, ATL and Digital. 2.3 OOH also uses it, since that page is built in Phase 4.

Files named on each page:
- Home: CB Media Spent Report, ATL files and Digital files
- 2.1 ATL: the 13 ATL files ("2026 Dash Board")
- 2.2 Digital and 2.4 Influencer: the Digital files
- 2.3 OOH: the Billboard master sheet
- 3.1 Calendar: the All Activity Calendar file
- 3.2 FY Media Spend: CB Media Spent Report, or Manual Entry
- 4.x Channel Wise: the Channel Cost file, or Manual Entry
- 5.1 to 5.3 Billing: Dashboard Media Final
- 5.4 OOH Bills: Billboard Billing Status, or Manual Entry
- 7.3 My Access: no file. Its note says "Shows who can see what. Per-person access is switched off for now."

## Business filter

- **Where it shows:** at the top of every page except Channel Wise (4.x), Data Entry (6.x, including Businesses & Brands) and Settings (7.x). This matches the client's own design.
- **Choices:** "All businesses", then each business from Businesses & Brands that is not hidden, in list order.
- **Look:** with 4 or fewer businesses, it is a row of buttons. With more than 4, it is one dropdown pill showing the current choice, with a search box in the list.
- **Remembered:** a choice is kept across pages and refreshes, like the month filter is today. A remembered business that has since been hidden falls back to "All businesses". A renamed business stays chosen and shows its new name (the choice is kept by the business, not by its name).
- **Effect:** on unbuilt pages it only shows the choice. Each real page reads it when that page is built.
- **Viewers and the admin both use it.** It is a view control that never changes saved data.

## Empty state (shared, used by every page from the next step on)

This is one component. Given the file kind it needs, it shows:
- the title "No data yet";
- the line "This page needs the <file name> file.";
- for the admin, an "Upload it" button that opens Data Entry at that file's card;
- for a viewer, the line "Not uploaded yet. The admin uploads it in Data Entry."

The existing `EmptyState` component is reused for the look.

## Units

There is one shared money formatter for pages: amounts in BDT Mn with 2 decimals, and the unit always shown, as in "12.34 BDT Mn" or as a column header unit. USD appears only on Digital Performance, as uploaded. This step only adds the formatter and its tests. Pages use it as they are built.

## Data updated line

At the bottom of the sidebar, a short line shows the latest publish date for each file kind that has data, for example "Data updated: channel cost 11 Nov 2026 · FY spend 27 Oct 2026". It reads from the active versions, and shows nothing when the store is empty.

## Out of scope

- Building any real page. FY Media Spend and the Calendar come next.
- Month, FY and brand pickers (added with the pages that need them).
- Downloads (Phase 5).
- Deleting old pages or their code (Phase 6).
- Rebuilding Settings 7.2 (p3-16).

## Assumptions (90% or more, not asked)

- The route names listed above. Old `/billing` and `/digital` keep their old pages, so the new ones use new paths.
- `/` shows the "being built" view for 1 Home. The old Home moves to `/old-home` (not in the sidebar), so its features and tests keep working until Phase 6 deletes it, like the other old pages.
- The proxy's month and brand rewrite stays on the old pages only. The business choice is remembered by its own cookie.

## Tests

- **Unit tests:**
  - the sidebar data (every PRD page present, in order, with numbers and files);
  - the business filter choice (buttons vs dropdown at 4/5, hidden businesses left out, a stale remembered value falls back);
  - the money formatter;
  - the Data updated line on an empty store and on a filled one.
- **Playwright tests:**
  - from an empty store, click every sidebar link and see its page title and file note;
  - the Business filter keeps its choice across two pages and a refresh;
  - the phone Menu drawer opens, navigates and closes;
  - the admin sees "Upload it" and a viewer does not.
