# Media Mind design summary

Date: 15 Nov 2026. Status: **approved by Sadril on 15 Nov 2026** (Phase 0 gate passed). Phase 1 is unlocked.

User flows for each phase: https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h Details live in: `features-list-2026-11-15.md`, `page-specs/` (01, 02, 03), `build-plan-2026-11-15.md`, `phase0-storage-and-test-data-2026-11-15.md`.

## 1. What it does

The media team uploads their usual Excel files. Everyone sees spend, performance, bills and billboards in one place, and downloads ready reports.

## 2. Pages

1. **Home:** spend to date, latest month, vs last FY, media mix, spend by media and business, TV/Digital/OOH snapshots, brand table.
2. **Campaign Performance:** TV (13 categories at a glance, one in detail), Digital (Meta, YouTube, TikTok in USD as uploaded), OOH (map and sites), Influencer.
3. **Media Spend:** Activity Calendar (Gantt chart and sheet), FY Media Spend.
4. **Channel Wise Spend:** Electronic, Digital, Press & Radio, month by month.
5. **Billing:** Overview, Vendor Statement, 22-column sheet with a column picker, OOH bill status.
6. **Billboards:** Bangladesh map with 8 divisions and pins, photos, division zoom, four ways to add sites.
7. **Data Entry:** Upload, Manual Entry (channel cost, FY spend, OOH bills), Upload History.
8. **Settings:** USD rate, data sources, backup.

Our current UI design stays. His HTML template only tells us what each page shows.

## 3. Uploads

1. The admin drops any of his usual files. There are no templates.
2. The system detects the type from the content: the visible sheet names, the header names, and the "Brand Name:" or "Category:" lines in ATL files. Hidden sheets are ignored.
3. A preview says what was found, for example "ATL, Savlon Soap, Jul'26 to Oct'26", and lists warnings.
4. If detection is not sure, the admin picks the type. Nothing is guessed silently.
5. The admin confirms. Only that dataset is replaced; for ATL, only that category.
6. Every upload goes into Upload History with its original file and can be restored.

## 4. Calculation rules

- FY runs July to June. Month labels show the year (Jul'26). Months come from the data, never hard-coded.
- Amounts are in BDT Mn. USD appears only on Digital Performance. Other digital figures use the admin's rate (now 123 BDT per USD).
- Full official brand names. Short names are converted.
- Real numbers only. Future months stay blank, never estimated.
- SOV and SOE always add to 100%.
- OOH contract cost is spread evenly by day and credited to the site's business.
- Four businesses: Toiletries, Hygiene, Salt, Food & Beverage. "Others" exists only inside Billing.
- Acceptance check: Activity Calendar Oct'26 grand total is 39.327 Mn.

## 5. Access

- Anyone with the link reads every page. No sign-in. Viewers can never change data; the server enforces this.
- One admin signs in with a password from the server settings. Five wrong tries lock sign-in for 10 minutes.
- Per-person access is designed in but switched off until later.
- Keep the address private or on the intranet.

## 6. Storage and hosting

- One SQLite file, plus a folder for photos and original uploads.
- One package (Docker). By default we host it on a small server and handle updates, HTTPS and daily backups. His company server is used only if ACI has IT staff.
- "Download backup" gives one file.

## 7. Look

- Our design, with navy and soft grey and the media colours: TV blue, Digital orange, Print green, OOH amber.
- **Every screen follows the client's chosen reference styles: Wix dashboard and Mixpanel** (Mobbin references in `../docs/spine/plans/2026-11-02-plan-9-mixpanel-wix-ui.md`).
  - From Wix: dark navy sidebar with Quick actions, white top bar, grey-blue canvas, 8 px rounded white cards with a bold title and a "View …" link, key-stat boxes with a sparkline, pill buttons, table toolbar, "⋯" row menu.
  - From Mixpanel: one violet accent, segmented controls in one bordered group, greeting on Home, square legend dots, quiet tables with tabular numbers, dark toasts.
- Works on laptop and mobile, with a light and dark mode toggle.

## 8. Removed

- The old Plan form, Budget vs Planned vs Actual, and Alerts. They are removed in Phase 6, after the new pages pass their tests.
- Neon, after a backup. Only the ACI Dashboard project is deleted.

## 9. Not copied from his template

We follow the PRD where his template differs:
- the hard-coded FY 2026-27
- CPV worked out two ways
- the Edit form losing the SL number
- "% of LY" not like for like
- the day and month swap in dates

## 10. Not in the first release

Per-person access, live Meta/Google/TikTok data, influencer fees, photos for all 40 sites.

## 11. Decisions from the template check (16 Nov 2026, Sadril)

All 135 data and analytics items in his template were checked against the page specs: 113 covered, 12 dropped on purpose, 0 missing. The 10 items that were only partly defined are settled as follows. Details are in `.spine/template-coverage-2026-11-16.md`.

1. **"Data updated" dates.** The sidebar footer, the Channel page subtitles and the OOH bill subtitle show the real date of the dataset's last upload or restore, read from Upload History. They are never typed in.
2. **"% of last year".** This applies to the Home KPI, the Home brand table and FY Media Spend.
   - It compares like for like (this year's months against the same months last year) whenever last year's months are available, for example from an earlier FY upload.
   - Until then, it compares with last year's full-year total and says so in the label: "of last FY total (full year)".
3. **Cost per view.** On Digital and Influencer it is always total spend ÷ total video views (ThruPlays on Meta, TrueView on YouTube, video views on TikTok), worked out from the totals, so it is the same on every screen and with every filter.
4. **OOH map borders.** Only the 8 built-in divisions are used. There is no "Boundaries" upload.
5. **No built-in data.** Pages start empty and fill only from uploads. Before a dataset's first upload, its page shows a clear empty state, for example "No Billing data yet. Upload the Dashboard Media Final file in Data Entry." There is no "back to built-in data" button; Restore in Upload History covers going back.
