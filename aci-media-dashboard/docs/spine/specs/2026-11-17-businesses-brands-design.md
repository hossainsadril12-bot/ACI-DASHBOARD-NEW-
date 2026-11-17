# Businesses & Brands (Phase 2 Part C): design

Approved in conversation with Sadril on 17 Nov 2026. Branch: `feat/businesses-brands`. Builds on Phase 2 Parts A and B (merged as f36dc41).

## 1. Why

Today the business and brand names are fixed in code, copied from the client's app:
- 4 businesses and their official brands (`src/lib/ingest/brands.ts`, `BRANDLIST`, `BALIAS`);
- 3 Digital businesses (`DIGITAL_BUSINESSES`);
- 13 ATL categories (`src/lib/ingest/readers/atl.ts`, `ATL_CATEGORIES`);
- Billing and Billboard turn any other business into "Others" without a warning.

His real files hold far more. Billing alone has 13 business names (Toiletries, Hygiene, Salt, Foods, SCJ, IB, Electrical, Beverage, Commodity, Rice, CB, CB Core, "ACI Salt") and 47 brands not on the official list. FY spend adds Foods and Electrolyte; Billboard adds "AI". So today a new business is either blocked (ATL), stuck (Digital) or quietly lost in "Others" (Billing, Billboard).

The client wants the admin to create businesses and brands (meeting notes, 5 Nov 2026; PRD v2.1 is silent). Sadril confirmed this on 17 Nov 2026.

## 2. Decisions (made with Sadril, 17 Nov 2026)

1. The admin creates, renames and hides businesses, brands and ATL categories.
2. The lists start **empty**. The 4 PRD businesses, his brand list and his short-name list are demo data; they are kept only as **suggestions**.
3. The client keeps his **usual Excel layouts**. No new file type, no column mapping.
4. A **new business** in an upload needs the admin's decision before the file can publish. For each new name: **Add as new** or **Same as [an existing business]**. An **Add all as new** button decides every new business at once.
5. A **new brand** never blocks. The preview shows one warning, "N brands not on your list", with **Review and add**.
6. A **new ATL category** shows "New category found: X". Add it asks for **Business** and **Our brands**, both pre-filled. "Our brands" is a list, because one category can hold several ACI products (his Spices file has 4); the admin ticks them among the file's brand rows. All other brand rows in an ATL file are competitors and are never added to the brand list. (Changed from one "Our brand" on 17 Nov 2026 during the build, to keep his Spices data identical.)
7. Files with no business column (Digital, ATL) get the business from the admin's pick in the preview. New brands in such a file go under that business.
7b. Brands are never pre-ticked (Sadril, 17 Nov 2026, "gives the user freedom"). Picking a Digital file's business or adding an ATL category does not add that file's brands. Until the admin ticks them once in Review and add, a Digital file asks for its business again on each upload.
8. Short names in his files (e.g. "Savlon HW") get a one-click full-name suggestion from his old short-name list (e.g. "Savlon Handwash"). Nothing is added without the admin.

## 3. Approach

Name lists live in the SQLite store as their own tables. The readers stay as they are, so they still match his data exactly. One new step in the upload service compares the names a file contains with the lists and puts new names into the preview. The admin's decisions travel with Publish and are saved in the same transaction as the upload.

Rejected: one saved JSON document for the whole list (no unique names, edits can overwrite each other); readers turning names into list ids (rewrites all 8 readers and breaks every answer-key test).

## 4. What the admin sees

### 4.1 Businesses & Brands page

- New route `/businesses`, sidebar label "Businesses & Brands", in the Data group, after Uploads & History.
- **Business list:** name, number of brands, a "Hidden" tag when hidden. Admin buttons: Add business, Rename, Hide / Show.
- **Business page** (`/businesses/<id>`): its brands, each with full name and its other names ("Also matches: Savlon HW, Savlon Hand Wash"). Admin buttons: Add brand, Rename, Hide / Show. Its ATL categories, each with "Our brands" and a Change button.
- **Empty state:** "No businesses yet. Add one here, or upload a file and add the businesses it contains."
- **Viewers:** see the same lists with no buttons.
- Follows the Wix / Mixpanel reference styles and the existing shared components, desktop and phone.

### 4.2 Upload preview (Data Entry)

- **New business** (any file with a business column, or the business picker):
  - amber chip "New business";
  - one line per new name: the name, then a choice **Add as new** / **Same as [select]**;
  - a button **Add all as new** when there are two or more;
  - the row is Ready once every new business is decided.
- **New ATL category:**
  - amber chip "New category";
  - "New category found: Savlon Soap", with **Business** (select of businesses, plus any business being added in this preview, plus "New business…") and **Our brands** (tick boxes over the brand rows in this file, pre-ticked by his old own-brand rule);
  - the row is Ready once both are set.
- **New brands:**
  - a normal warning "12 brands not on your list", which never blocks;
  - **Review and add** opens a list: each brand, its business (from its own row, or the business picked for the file; for the OOH master sheet, which has neither, a business select per brand), a suggested full name when his short-name list knows it, and a tick box;
  - ticked brands are added on Publish; unticked brands stay "not on your list" and are asked again next upload.
- **Business picker** (Digital): lists his businesses (not hidden), not fixed names. It is pre-picked when the file's brands all belong to one business, as today. An ATL file takes its business from its category (set when the category is added, changed with the category's Change button), so ATL rows have no business picker of their own.
- **Suggestions** come from the old demo lists: a business name for an ATL category or a brand, a full name for a short name. A suggestion pre-fills a field; it never decides on its own.

### 4.3 Rules

- **Nothing changes until Publish.** Decisions are sent with Publish and saved in the same transaction as the new versions. Cancel or closing the page changes nothing (matches the Phase 2 flow box "Admin confirms? no, Nothing changes").
- **Server checks every decision.** A decided name must be one the server itself found when it re-read the file; a "Same as" target must exist and not be hidden; names are trimmed, 1 to 120 characters. Anything else is ignored, the same way an unknown `type-<i>` is ignored.
- **Unique names**, compared trimmed, with runs of spaces made single, ignoring case:
  - no two businesses share a name or "same as" name;
  - no two brands share a name or "same as" name;
  - no two ATL categories share a name.
- **Rename** keeps the old name as a "same as" name, so older uploads still match.
- **Hide, never delete.** A hidden business, brand or category keeps matching old data but is left out of pickers. Showing it again restores it.
- **Admin only.** Every list change is an admin action checked on the server (`requireAdmin()`), like uploads.

## 5. Data

- New tables in `src/store/schema.ts`, one migration:
  - `business`: id, name, hidden, created_at;
  - `brand`: id, business_id, name, hidden, created_at;
  - `atl_category`: slug, name, business, own_brands (a list of names), hidden, created_at;
  - `name_match`: kind (`business` | `brand`), normalised name, target id. Every business and brand has a match row for its own name; "Same as" and renames add more rows. Unique on (kind, normalised name).
- Uploaded data keeps every name exactly as in the file (fidelity with his readers; answer-key tests unchanged).
- A small read API in `src/store/` (for example `getCatalog()`, `resolveBusiness(name)`, `resolveBrand(name)`) so the Phase 3 pages read names through the lists.
- **Digital and ATL dataset keys** use a fixed slug made from the business or category name when it is created (`digital:<business slug>`, `atl:<category slug>`). A rename never changes the slug, so a rename doesn't split the data. The label keeps the name at publish time. Existing dev data under the old keys is dev-only and can be re-uploaded.
- **ATL:** the category is matched by the file's "Brand Name:" title against `atl_category` names, normalised. Own vs competitor brands come from the category's "Our brands". His 13 category rules become suggestions only.
- Catalog changes are not versions in Upload History. A short "who changed what, when" log is out of scope.

## 6. Changes to today's behaviour

- An ATL file for an unknown category is no longer a read error; it asks "New category found". The e2e test "1. a read error blocks publishing" (Lux Soap) changes with it.
- Billing and Billboard no longer decide "Others" for the admin. His `bz` / `Others` fields stay in the stored data for fidelity, but nothing reads them for grouping.
- The Digital business picker and `isDigitalBusiness` checks use the store's businesses instead of the fixed three.
- File-name hints for Digital ("Hygiene" in the name) match against his business names.

## 7. Out of scope

- Any Excel layout of his own (column mapping).
- Merging two businesses that already exist, or moving a brand to another business.
- Deleting anything.
- Per-person access.
- The Phase 3 pages themselves (they will read through the lists).
- A change log of list edits.

## 8. Testing

- Unit: name rules (normalise, unique, rename, hide), the name check per file type with his real files (Billing should report the 13 business names; FY Foods and Electrolyte; Billboard "AI"), decisions validated on the server (a name not in the file and a hidden target are ignored), publish saves decisions and versions together or not at all.
- Routes and actions: viewers refused on every list change; mutation proof that removing the admin check fails a test.
- Playwright: the user flow below, plus the Businesses & Brands page on desktop and phone.
- Answer-key tests stay green: readers are unchanged.

## 9. User flow change (Phase 2 flow, approved by Sadril on 17 Nov 2026)

After "Preview, plus warnings", add: **"New businesses or ATL category?"** yes: **"Admin adds them or matches them to existing ones"**, then back to Preview. New brands appear as a warning inside Preview. Add a small flow for the Businesses & Brands page: admin adds, renames, hides a business or brand. The flow artifact (https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h) is updated during the build.
