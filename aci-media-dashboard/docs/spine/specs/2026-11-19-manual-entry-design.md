# Manual Entry (Phase 2 Part E): design

Asked for by Sadril on 19 Nov 2026 ("implement manual entry then we will proceed next"): Phase 2 is not closed until Manual Entry is built. Built right after Part D (`2026-11-19-data-entry-cards-design.md`), on its own branch from `main`.

## 1. Why

PRD v2.1, section 6: "Manual entry (6.2) for channel cost, FY spend and OOH bills." His own app has it as the middle Data Entry tab (`docs/page-specs/03-billing-data-entry-settings-global.md`, section 6.2). It lets the admin type in or correct numbers without a new Excel file. It was missing from our build plan.

## 2. Decisions

1. Data Entry gets a third tab between the other two: **Upload Data**, **Manual Entry**, **Upload History**. Admin only. A viewer sees the tab read-only, with inputs turned off and the note "Only the admin can change data. Sign in to edit."
2. Manual Entry edits the **same datasets** the uploads fill: `channel`, `fy` and `billboard`. A save publishes a new version of that dataset with source "manual". That version shows in Upload History as "Manual edit", and it can be restored like any upload.
3. It works with nothing uploaded yet. The tables start empty and the admin can add rows.
4. Billing (Dashboard Media Final), ATL, Digital and the Activity Calendar have no manual entry, the same as his app.
5. **We fix three gaps in his app:**
   - Deleting a bill asks for confirmation first.
   - The business choices come from the Businesses & Brands list, not a fixed list. His app's list includes "AI" and "Foods".
   - A save checks that nobody published that dataset after the admin opened it. If someone did, nothing is saved and the screen says "This data changed after you opened it. Reload to see the latest, then make your change again."

## 3. What the admin sees

A three-way switch at the top: **Channel cost**, **FY media spend**, **OOH / billboard bills**.

### 3.1 Channel cost

- A second switch: Electronic, Digital, Press & Radio.
- Heading "Channel cost · <name>". Caption: "BDT · type amounts, add or remove rows, then Save & publish".
- The table:
  - SL;
  - the name column, called "Channel" (Electronic), "Platform" (Digital) or "Newspaper / station" (Press & Radio);
  - 12 month columns, Jul to Jun, labelled with the year of the data, for example Jul'26 to Jun'27. With no data, the current FY is used;
  - a Remove button on each row.
- A blank amount counts as 0.
- Below the table: "+ Add channel", "+ Add platform" or "+ Add newspaper / station".
- A bottom bar shows the status ("Unsaved changes" or "All saved"), with **Discard changes** and **Save & publish**.
- **Saving:** all three sheets are saved together as the `channel` dataset. Rows with no name are dropped, names are trimmed and SL is renumbered from 1. Unsaved edits are kept while switching between the three sheets.
- **Summary:** the same line as an upload: "Electronic x Mn · Digital y Mn · Press & Radio z Mn".

### 3.2 FY media spend

- **Brand select:** brands are grouped by business, from the brands that are in the current FY data.
- **"+ Add brand" opens a dialog with two fields:**
  - **Brand:** a pick from that business's brands on the Businesses & Brands list, or a new name. A new name is also added to the list.
  - **Business:** a pick from the list.
- Heading "FY media spend · <brand>". Caption: "BDT Mn · <business> · FY <year> months Jul to Jun, plus the last FY total".
- **The table:**
  - rows TV, Digital, Print and OOH;
  - columns: the 12 months and "Last FY";
  - number boxes in BDT Mn, the same unit as the uploaded file.
- **Unsaved edits:** changes to several brands are kept until Save & publish or Discard changes.
- **Saving:**
  - rows with every value 0 are dropped;
  - values are rounded to 4 decimals;
  - the summary is "N brands · FY spend x Mn", the same as an upload.

### 3.3 OOH / billboard bills

- Heading "OOH / billboard bills". Caption: "N bills · add a bill or change a status. Each save publishes."
- A search box: vendor, PO, bill no, brand or location. A **+ Add bill** button.
- **The table:**
  - columns: SL, Vendor, PO, Bill No, PO Amount, Bill Amount, Brand, Location, Status, and an Edit button;
  - newest first;
  - the first 40 rows, then "Show all N".
- **The Add bill or Edit bill dialog:**
  - **Text fields:**
    - Name of the Media / Vendor (required);
    - Purchase Order;
    - Bill No;
    - Brand;
    - Bill;
    - Cheque;
    - Location;
    - Comments.
  - **Number fields:**
    - PO Amount;
    - Bill Amount;
    - Bill Difference ("blank = PO − Bill").
  - **Date fields:** Start Date, End Date, Submit Date and Payment Request Date.
  - **Business:** a pick from the list.
  - **Status:** a pick from the statuses in the uploaded file's legend, or his five standard ones when none are uploaded.
  - **A new bill starts with:** Status "Finance/Audit" and today's date as the Submit Date.
- **Buttons:**
  - Delete bill, on edit only, with a confirm step;
  - Cancel;
  - Save & publish.
- **Saving one bill:**
  - publishes the whole `billboard` dataset, with the bills renumbered from 1;
  - a blank Bill Difference becomes PO minus Bill;
  - a blank PO Amount or Bill Amount becomes 0.
- **Summary:** "Added bill <no> · <vendor> · <status>", "Edited …" or "Deleted …".
- **Errors** show in red inside the dialog.

## 4. What changes in the code (outline)

- A Manual Entry tab on the Data Entry page, with three client editors.
- Server actions, admin only (`requireAdmin` first), one per dataset. Each one:
  - checks every field with zod;
  - checks the version the admin started from;
  - publishes with source "manual", in one transaction with any new brand added to the list.
- The dataset shapes stay the same as the readers produce (`ChannelData`, `FyRow[]`, `BillboardData`), so the Phase 3 pages read manual and uploaded data the same way.

## 5. Tests

- **Unit tests:**
  - the save rules for each dataset (dropped rows, renumbering, rounding, the Bill Difference default);
  - the zod limits;
  - the "data changed" check;
  - "only the admin can save".
- **Browser tests (Playwright):**
  - Edit a channel amount, then Save & publish. Upload History shows "Manual edit", and Restore brings the old version back.
  - Add an FY brand with a new name. The brand appears in Businesses & Brands.
  - Add, edit and delete a bill. Delete asks first.
  - A viewer can't edit.
  - On a phone, the tables scroll inside their card and the page doesn't scroll sideways.

## 6. Not in this design

- Manual entry for Billing, ATL, Digital and the Calendar (not in his app).
- The OOH sites, map and photos: Phase 4.
