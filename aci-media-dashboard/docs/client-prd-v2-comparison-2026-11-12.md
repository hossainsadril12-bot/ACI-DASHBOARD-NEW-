# Client PRD v2 (12 Nov 2026) compared with our plan

Source: `Media_Mind_PRD_v2.pdf` (4 pages) plus the Media Mind artifact menu.
Status: analysis only. Nothing built. Nothing approved.

The client says the artifact is a "working version in use" and the PRD describes it for the UX designer.
Where the PRD and our earlier "locked" list disagree, **the PRD wins** until the client says otherwise.

---

## 0. PRD v2.1 update (file `Asset/Media_Mind_PRD_v2.1.pdf`)

v2.1 changes three things. Everything else in v2 stays. Where v2.1 and the sections below disagree, **v2.1 wins**.

**Hosting (new)**
- Self-hosted on the company server: Node.js 18+, 1 CPU, 1 GB RAM, 2 GB disk, behind nginx or IIS with HTTPS. Uploads up to 60 MB.
- No database. Data is stored as files under `data/` (records and photos). Back up the folder daily or use "Download backup".
- Install: copy the package, set the admin password in `.env`, import the seed, run `node server.js` (or Docker or systemd).
- Next phase: a server job reads Meta, Google Ads (YouTube) and TikTok APIs with tokens kept on the server.
- **Conflict:** our app is Next.js with Postgres (Neon). Decide what we build for his server before the design.

**Access (simpler)**
- First release has no sign-in for viewers. Anyone with the link sees every section, business and brand, read-only.
- Only the super admin signs in. Admin password comes from `.env`. Brute-force lock after repeated wrong tries.
- The Editor role is removed for now. Only the admin changes data. Every change is checked on the server.
- Per-person access (staff ID sign-in, sections, businesses, brands chosen by the owner) is "built and can be switched back on later". Keep it designed in, switched off.
- Risk: on an internet address, anyone with the link sees all data. Prefer intranet.
- Brand-access short-form matching (Savlon HW) no longer appears in the access section. The brand-name rule in section 5 stays.

**Acceptance (changed)**
- Old: a staff user sees only assigned sections.
- New: anyone with the link sees every section, and only the signed-in admin can change data.

**Effect on sections below**
- "Logins" in section 3: staff-ID default-password problem no longer applies to the first release.
- Question 3 (password change at first login): drop for now.
- Flow diagrams: roles, sign-in, admin set-up and view-and-download were redrawn for v2.1.

---

## 1. Menu in the PRD

1. Home
2. Campaign Performance: ATL, Digital, OOH, Influencer
3. Media Spend: Monthly Activity Calendar, FY Media Spend Data
4. Channel Wise Spend: Electronic, Digital, Press & Radio
5. Billing & Statement: Overview, Vendor Statement, Media Billing Data Sheet (22 columns), OOH Bill Details
6. Data Entry: Upload Data, Manual Entry, Upload History (with restore)
7. Settings: User Settings, Data Sources and USD rate, My Access

---

## 2. What matches our plan

- Financial year July to June. Month labels show the year (Jul'26).
- Channel-Wise Spend: BDT, month-wise, Press & Radio kept.
- OOH is a real section with photos and a map.
- Influencer page exists.
- Billing has a Summary view and a full Details sheet.
- Logins with roles and per-person access (we planned this for later).
- Business filter at the top of each page.
- Year and month are enough. No daily numbers. No date-range filter is asked for.

---

## 3. Where the PRD changes our "locked" list

**Plan form and Budget vs Planned vs Actual**
- Our plan: keep Plan as is, merge it with Media Spend.
- PRD: "Media budget planning (removed from scope)". Campaigns come from the Activity Calendar Excel, not a plan form.
- Conflict with the 5 Nov meeting, where he said Plan stays.
- Needs his answer.

**Excel templates**
- Our plan: we create templates from the prototype tables.
- PRD: upload "the usual Excel file, same format". The app must read his existing files.
- So we need his real files. We do not design templates.

**Brands and businesses created by hand**
- Our plan: a Businesses & Brands section to create them.
- PRD: brand names come from one official "Brand & Business list". Short names in files are converted to the full name automatically.
- Creating by hand is not mentioned. Needs his answer.

**Business groups**
- Our plan: Foods, Electrolyte and Commodity grouped as "Others".
- PRD: the fourth business is **Food & Beverage** (Basic Spices, Mustard Oil, ACI Electrolyte).
- "Others" (SCJ, IB, Electrical) exists only inside Billing.
- Our "Others" item was wrong.

**OOH map pin**
- Our plan: a map link column and an "Open map" button.
- PRD: a real map of Bangladesh with 8 divisions, pins from latitude/longitude, photo on hover, click the map to place or move a pin.
- Much bigger than a link.

**Currency**
- Our plan: no automatic conversion.
- PRD: everything in BDT Mn. USD is shown only on Digital Performance, exactly as uploaded. Everywhere else digital spend is converted at an admin-set rate (now 123 BDT per USD).

**Combined tab, live-campaign boxes, column picker, per-business uploads**
- None of these are in the PRD. Treat as not requested until he says so.

**Logins**
- Our plan: later.
- PRD: in scope now. Staff ID is the username, and the first password is the same staff ID.
- Sensitive area (passwords, database). Needs your explicit sign-off before building.
- Risk to raise: a default password equal to the staff ID is easy to guess. Suggest forcing a change at first login.

---

## 4. New things in the PRD we had not planned

- **No projections.** Only reported months show. Future months are blank or hatched, never estimated. (The artifact had projections.)
- **Downloads** on every report: source Excel, Excel, CSV, PDF, and PowerPoint in the Media Department slide format.
- **Upload flow:** read the file, show a summary and warnings, publish after confirmation. Every upload is kept in Upload History and can be restored. The original file can be downloaded.
- **ATL upload:** 13 files, one per TV category. The category is read from the "Brand Name:" line and only that category is replaced.
- **ATL numbers:** SOV and SOE are recalculated so they always add to 100%.
- **OOH cost:** a contract's cost is spread evenly by day from start to end. Each month carries only its share, credited to the site's business.
- **Brand access:** matches full names and short forms (Savlon HW = Savlon Handwash).
- **Roles:** super admin, editor, viewer. Viewers see only the sections, businesses and brands given to them.
- **Design:** left panel with numbered sections, navy and soft grey, media colours (TV blue, Digital orange, Print green, OOH amber), works on laptop and mobile, light and dark mode.
- **Acceptance test:** Activity Calendar Oct'26 grand total must equal 39.327 Mn.
- **Next phase:** live Meta, Google and TikTok connection; influencer fees; photos for all 40 OOH sites.

---

## 5. Our 13 questions: which ones the PRD answered

Answered:
- 2 Channel-Wise version: electronic by TV channel, digital by platform, press and radio by name.
- 3 Facebook/Instagram in BDT: convert at the admin USD rate.
- 4 OOH map: latitude/longitude with a click-to-place map.
- 5 OOH photos: added per site with "+ Photo".
- 6 Currency: BDT Mn, USD only on Digital Performance. VAT is not mentioned.
- 9 Influencer yes. Media Budget page removed.
- 10 Logins: now, not later.
- 11 Billing Details: the 22-column sheet, plus vendor statement and OOH bill status.
- 12 TV competitor table: the 13 "2026 Dash Board" category files.
- 13 Grouping: Food & Beverage, not "Others".

Not answered:
- 1 Merge Plan and Spend: the PRD has no Plan page at all.
- 7 Home date range: not mentioned.
- 8 Best channel for reach: not mentioned. Home has no such card in the PRD.

---

## 6. Questions to send the client

1. Plan page: should the Plan form and "Budget vs Planned vs Actual" be removed completely? On 5 Nov you said Plan stays.
2. Creating brands and businesses by hand: do you want it, or only the official list uploaded by you?
3. Passwords: OK to make users change the first password (staff ID) at first login?
4. Home page: the Alerts box and the live-campaign TV/Digital/OOH boxes from the meeting. Still wanted, or replaced by the PRD's Home?
5. Billing: the current page has status steps and reminders. Keep them, or only the sheets in the PRD?
6. VAT: any VAT calculation, or none?
7. PowerPoint download: please send the Media Department slide template.

---

## 7. Files we need from the client

- The 13 ATL "2026 Dash Board" files (and the corrected May 2026 data).
- 3 business digital files (Toiletries, Hygiene, Salt).
- Channel Cost file.
- CB Media Spent Report (FY spend, with last FY).
- All Activity Calendar file.
- Dashboard Media Final (22-column billing).
- Billboard master sheet, Billboard Billing Status, and the site photos.
- Brand & Business list (official full names and short forms).
- Staff list (ID, name, which sections, businesses and brands).
- PowerPoint slide template.

## 8. Data problems he listed himself

- OOH SL 29 has no amount.
- OOH SL 27 and 28 run two years.
- ATL Savlon Soap is blank for Jul to Sep'26.
- Lux shows 7,087 GRP in Aug'26 (looks wrong).
