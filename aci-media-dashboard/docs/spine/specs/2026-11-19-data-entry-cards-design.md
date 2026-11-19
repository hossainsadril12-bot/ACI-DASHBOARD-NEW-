# Data Entry as one card per file (Phase 2 Part D): design

Agreed with Sadril on 18 Nov 2026 during the Phase 2 manual test. Branch: `feat/data-entry-cards`, from `main` at bc2afac. Builds on Phase 2 Parts A to C (uploads, readers, Businesses & Brands).

## 1. Why

During the manual test Sadril found the upload screen confusing, and said Phase 2 is not complete until it is fixed.

Today Data Entry has one drop box. It guesses the type of every file. Each file row can then show a type select, a business select, coloured chips and question boxes at the same time. Upload history is in two places: a tab in Data Entry, and the old "Uploads & History" page, which still shows Phase 1 sample data.

The client asked for something simpler:
- **PRD v2.1, section 6:** "Each dataset is updated by uploading its usual Excel file in 6.1 Upload Data. The dashboard reads it, shows a summary and warnings, and publishes after confirmation."
- **His own app** (`docs/page-specs/03-billing-data-entry-settings-global.md`, Part C): Upload Data shows one card per dataset. Each card has its own "Upload Excel" button. After the file is read, a "Check before publishing" box shows what was read and any warnings, then "Publish to dashboard". Upload History is one list with restore.

## 2. Decisions (Sadril, 18 Nov 2026)

1. Upload Data shows **one card per file**, like his app. The card the admin uses decides the file type, so the type is never a question.
2. **Digital:** one card per business, like his app (Digital · Toiletries, Digital · Hygiene, Digital · Salt).
3. The **OOH master sheet** is not a Data Entry card. PRD section 6 puts its upload on the OOH page ("Upload master sheet"), which is built in Phase 4. The reader stays.
4. The auto-detection we built becomes a **safety check**. A file on the wrong card is blocked, with the card to use. His app has no such check; this is our addition.
5. **Upload History** is one list, inside Data Entry. The old "Uploads & History" menu item goes.
6. Manual Entry (PRD 6.2) is also built in Phase 2, as Part E, right after this part (Sadril, 19 Nov 2026). Its design is `2026-11-19-manual-entry-design.md`. It adds a middle tab, so Data Entry ends with Upload Data, Manual Entry and Upload History, like his app.

## 3. What the admin sees

### 3.1 Data Entry page

- Title "Data Entry". Subtitle: "Upload the Excel files in the same format you use today. Every upload is kept in Upload History."
- Two tabs: **Upload Data** (default) and **Upload History**.

### 3.2 Upload Data: the cards

A grid of cards: two columns on a laptop, one on a phone. In this order:

| Card | File it expects | Updates |
|---|---|---|
| ATL (TV) performance | A "2026 Dash Board" file, one per TV category. The category is read from its "Brand Name:" line. You can choose several files at once. | ATL Media Performance, Home |
| Digital · <business> (one per business, see 3.3) | The business's digital data file, with sheets Meta, YouTube and TikTok. | Digital Media Performance, Influencer, Activity Calendar, Home |
| FY media spend | The CB Media Spent Report (its "Final Report" sheet). | Home, FY Media Spend, Activity Calendar, OOH |
| Channel cost | The Channel Cost file, with sheets Electronic, Digital and Press & Radio. | Channel Wise Spend |
| Media billing | Dashboard Media Final, sheet "Master". | Billing Overview, Vendor Statement, Billing Data Sheet |
| Monthly activity calendar | The All Activity Calendar file, one sheet per month. | Monthly Activity Calendar |
| OOH / billboard bill status | The Billboard Billing Status file. | OOH Media Bill Details |

Each card shows:
- the title in bold;
- the file it expects, in grey;
- "Updates: <pages>";
- "Now showing: <file name> · <date and time>", or "Now showing: nothing uploaded yet". The ATL card says "Now showing: N categories · last upload <file name> · <date and time>";
- the **Upload Excel** button (admin only). A file can also be dropped onto the card.

A viewer sees the same cards without buttons, and one note above them: "Only the admin can upload. Sign in to upload." with a Sign in link.

### 3.3 Digital cards

- One card per visible business that already has a Digital upload: "Digital · Hygiene". Its business is fixed, so the business is never asked.
- One more card for a business with no Digital data yet. Its title is "Digital performance" while no Digital card exists, and "Digital · another business" after that. In the check box (3.4) it asks for the business: a pick from the list, or New business with a name box.
- After the first Digital upload for a business is published, that business gets its own card.

This keeps his three-card look once his data is in. It also avoids a card for every business on the list, because Billing alone adds 13 businesses and most have no Digital file.

### 3.4 After choosing a file: Check before publishing

A dialog opens, titled "Check before publishing · <card title>".
1. While the file is read: "Reading <file name>…".
2. Then, for each file:
   - **What was read:** the label and summary line (for example "ATL, ACI Savlon Soap, Jul'26 to Oct'26 · 74 brands").
   - **Please check:** the warnings, in amber. Warnings never block.
   - **Errors**, in red. An error blocks.
   - The questions, only when there is one: the business for the "another business" Digital card; New businesses in this file; New category found; "N brands not on your list" with Review and add. These are the Part C controls, unchanged.
3. Buttons: **Cancel** and **Publish**. Publish is on only when every file in the dialog can publish.
4. On success the dialog closes, a toast says "Published 1 file: <label>", and the card's "Now showing" line updates.

The ATL card can hold several files. Each one gets its own block in the dialog, and a Remove link. Every other card takes one file.

### 3.5 Safety check: the wrong file on a card

The server reads the file as the card's type and compares it with detection.
- **Detection is sure and says another type:** blocked. "This looks like a <type> file, not <card type>. Close this and use the <card> card." For an OOH master sheet: "This is the OOH master sheet. It is uploaded on the OOH page."
- **Detection says it is none of his files:** blocked. "This is not a <card type> file. Expected: <the card's file text>."
- **Detection is unsure:** the file is read as the card's type. The reader's own errors decide.

The old warning "Detected as X, but you picked Y" goes, because a mismatch now blocks.

### 3.6 Upload History tab

The table from Part A stays: When, Type, What, File, Rows, Status ("In use"), and Restore and Download for the admin.

### 3.7 Menu

The "Uploads & History" item leaves the sidebar. The Data group becomes Data Entry, Businesses & Brands, Settings. The old `/uploads` page stays reachable only from the old pages' upload panels until Phase 3 and Phase 6 replace those pages.

## 4. What changes in the code (outline; the plan gives the tasks)

- A card list in one module (`src/lib/ingest/cards.ts` or similar): key, title, file type, file text, "Updates" text. It is the one source for the cards, the safety messages and the tests.
- Server (`src/server/ingest.ts`): the chosen type now always comes from the card. A sure detection that disagrees blocks with the message in 3.5. The "none" message names the card. The upload API and the form fields stay the same.
- A store query for "Now showing": the active version per dataset key (file name, time), and the count of active `atl:*` datasets.
- Data Entry page: cards plus dialog. The type select and the single drop box go. The business, category and brand controls move into the dialog unchanged.
- Sidebar: remove the Uploads & History item.

## 5. Tests

- Unit: the card list (every Data Entry type except `ooh-sites` has a card; titles are unique); the safety check for each case in 3.5; "Now showing" per card, including the ATL count.
- Browser (Playwright): the Phase 2 flows walked through the cards. A wrong file on a card is blocked with the right card named. ATL with a new category publishes. Digital for a new business, then its own card appears. Billing with "Add all as new". A viewer sees the cards without buttons. On a phone the cards fit with no side scroll.
- The real-file tests from Parts A to C keep passing: all 22 of his files are still read the same.

## 6. Not in this design

- Manual Entry (PRD 6.2): Part E, its own design.
- The OOH page and its master sheet upload: Phase 4.
- The dashboard pages that show the data: Phase 3.
