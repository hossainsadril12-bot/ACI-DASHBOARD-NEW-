# Media Mind build plan (draft for approval)

Date: 15 Nov 2026. Status: plan approved by Sadril on 15 Nov 2026. Phase 0 started. No app code written yet.

Sources: `Media_Mind_PRD_v2.1.pdf`, the client's self-host package (`Asset/MediaMind_SelfHost_v2.1`), `docs/client-prd-v2-comparison-2026-11-12.md`.

Feature scope: `docs/features-list-2026-11-15.md`. Every feature there maps to a task on the build tracker (https://claude.ai/artifact/42JgJXzgW7g97xrQ2n6Med).

## 1. Goal

Upload the department's usual Excel files once. The whole media team sees spend, performance, bills and billboards in one place. They download ready reports.

## 2. Ground rules (decided)

- The PRD v2.1 is the source of truth.
- **Our UI design stays** (our Next.js app, our components and styles).
- **Every new or changed screen follows the reference styles the client chose: Wix dashboard and Mixpanel** (see `../docs/spine/plans/2026-11-02-plan-9-mixpanel-wix-ui.md`). Use the existing shared components (cards, stat cards, segmented controls, tables, toasts) before making new ones. Each page is checked against the references with desktop and phone screenshots before its phase gate.
- **His HTML template is the content spec:** which charts, tables, filters, columns and numbers each page shows.
- **His rules are the calculation spec:** `TECHNICAL_SPEC.md` (FY July to June, SOV, SOE, OOH cost per day, FX rate, full brand names, no projections).
- First release: everyone with the link reads. Only the admin signs in and edits. Per-person access is designed in but switched off.
- No paid database. Runs on the company server.
- Real numbers only. Never estimated.
- No Excel templates. The client keeps using his usual files. The system detects the file type automatically (see Phase 2).
- **PRD wins over his HTML template.** Where his template has a bug or differs from the PRD (hard-coded FY 2026-27, CPV worked out two ways, Edit form losing the SL number, "% of LY" not like for like, date fix swapping day and month, and similar), we follow the PRD and `TECHNICAL_SPEC.md`. We do not copy the template's mistakes and we do not ask the client about them. We ask only where the PRD is silent.

## 3. Risks and how the plan avoids them

**R1. Node version.**
- Our app needs Node 22.12 or newer (Next.js 16 needs 20.9 or newer). The PRD says Node 18 or newer.
- Plan: ask the client his Node version. Ship as a self-contained package (Next.js "standalone" build, plus a Dockerfile) so his server does not need to match.
- Side plan (decided 15 Nov 2026): not a gate for now. The question stays on the tracker's side plan.

**R2. Where data is stored (no paid database).**
- **Decided 15 Nov 2026: one SQLite file** (Drizzle SQLite dialect, `better-sqlite3` driver). Photos and original uploads go in a folder next to it.
- Why: tested with his real data (`docs/phase0-storage-and-test-data-2026-11-15.md`). 5.5 MB, fast, almost no extra memory, and backup is one file. PGlite needed about 273 MB more memory on a 1 GB server. JSON files have no queries or transactions.
- All reads and writes still go through one small storage layer.

**R2b. Who runs the server (decided 15 Nov 2026).**
- The client has no programming knowledge, so he must never run anything technical.
- One package (app + SQLite file + photo folder, shipped as Docker) runs on either server below:
  - Default: **we host it** on a small server (about 5 USD a month) and handle updates, HTTPS and daily backups.
  - Alternative: his company server, only if ACI has IT staff who want it in-house.
- Question for the client (side plan, not blocking): does his company have IT staff who can run a server?
- Not used: free serverless hosting (Vercel or Netlify). Uploads above about 5 MB fail, there is no disk for the SQLite file or photos, and the free plans have limits.
- Safety: viewers have no sign-in in the first release, so keep the address private or on the intranet. A simple viewer password can be added later.

**R3. Wrong numbers.**
- Plan: port his calculation rules into tested functions. Use his real Excel files as test data.
- Acceptance numbers from the PRD: Activity Calendar Oct'26 grand total is 39.327 Mn. SOV and SOE add to 100%. OOH cost per month and FY matches his page.
- Test by comparing our output with his app's output for the same files.

**R4. Excel reading breaks on real files.**
- His files have hidden columns, odd months and typos. His parser reads columns by header name.
- Plan: all of his real files become test data (they are inside `public/src/*.json` as base64 `.xlsx`). A bad file shows a clear warning and does not publish.
- Checks to reject impossible values (for example Lux 7,087 GRP in Aug'26, or reach above 100%).

**R5. Open access leaks data.**
- Viewers need no login, so the link is the only protection.
- Plan: viewers are read-only, enforced on the server, never only in the browser. Admin session cookie, lock after wrong tries. HTTPS. Prefer intranet. No secrets in git (a Neon API key was found in `.env.example`, which is tracked).
- Login is a sensitive area. It needs your explicit OK before building.

**R6. Scope creep.**
- Plan: build only PRD v2.1. Everything else goes to "Later" (per-person access, live Meta/Google/TikTok, influencer fees).

**R7. Breaking what works.**
- Plan: remove the old Plan, Budget and Alerts pages in their own step at the end, after the new pages pass their tests.
- The old Neon project stays until the new store works. Back up, then delete.

**R8. Reports look different from his.**
- PowerPoint must be in the "Media Department slide format". We do not have that template.
- Plan: ask for it before Phase 5. Use his export code as the reference.

**R9. Photos, map and big files.**
- Plan: photos stored on disk. Division boundaries built in (geoBoundaries). Upload limit 60 MB.

## 4. Phases

Each phase ends with something you can see and test. We approve one phase before the next.

**Phase 0. Foundations (no screens).**
- Page-by-page spec from his template (what is on each page, which file feeds it).
- Pull every original `.xlsx` out of his package as test data.
- Storage test and decision. Node and packaging decision.
- Gate: you approve the design.

**Phase 1. Data layer and admin access.**
- Storage layer. Tables or records for datasets, uploads, history, sites, FX rate.
- Admin sign-in, read-only guard on the server, backup and restore.
- Gate: your OK for the login design.

**Phase 2. Upload pipeline.**
- **No template.** The client's usual files are read as they are. The system detects the file type itself from its content (sheet names, header names, the "Brand Name:" line for ATL). The admin does not pick the dataset.
- The preview always shows what was detected ("ATL, Savlon Soap, Jul'26 to Oct'26"). If detection is not sure, the admin must confirm the type. Nothing is guessed silently.
- Tests: every real file is detected as the right type. A wrong file (for example a billing file dropped on the ATL page) is refused or flagged.
- Readers for: ATL (13 files), Digital (3 business files), Channel Cost, FY spend, Activity Calendar, Billing master, Billboard billing, OOH master sheet.
- Summary and warnings, confirm, Upload History with restore, original file kept.

**Phase 3. Pages, in this order.**
1. Shell: menu, business filter, FY and month, units on every number.
2. FY Media Spend and Monthly Activity Calendar.
3. Channel Wise Spend.
4. ATL Media Performance.
5. Digital and Influencer.
6. Billing (overview, vendor statement, 22-column sheet, OOH bills).
7. Home.

**Phase 4. OOH.**
- Sites, photos, Bangladesh divisional map, pins, hover and click, cost per day, Home snapshot.

**Phase 5. Downloads.**
- Source Excel, Excel, CSV, PDF, PowerPoint. All follow the filters on screen.

**Phase 6. Clean-up and handover.**
- Remove the old Plan, Budget and Alerts pages. Remove the Neon dependency after backup.
- Package for his server (Docker, systemd, nginx example). Handover document. Final acceptance check.

**Later (not now):** per-person access, live ad-platform data, influencer fees.

## 5. How each task is built

**The user flows are the yardstick (agreed 15 Nov 2026).** The user flow page (https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h) has one flow per phase.
- Every phase ends by walking its flow in the real browser, every box and every arrow, including the "no" and "stopped" paths.
- Each flow becomes an automated browser test (Playwright), so it keeps passing in later phases.
- If the app does something the flow does not show, or the flow cannot be followed, the phase is not done. Either the app is fixed, or the flow is changed with Sadril's OK.

- Write the test first, using his real file.
- Build the smallest piece. Run it in the real browser.
- Small commits. A review at the end of each phase.
- A phase is done only when its tests pass and you have seen it working.

## 6. Done means (from the PRD)

- Uploading each standard Excel file updates its pages without errors, and it appears in Upload History.
- Totals match the source files (Calendar Oct'26 grand total 39.327 Mn).
- All amounts follow the currency rule. Digital Performance equals the uploaded sheet.
- Anyone with the link sees every section. Only the signed-in admin changes data.
- Every download option opens in Excel, a PDF reader or PowerPoint.

## 7. Open items

Side plan (not blocking for now, decided 15 Nov 2026):
- Client: which Node version is on the server?
- Client: is one database file OK (no database server)?
- Client: the PowerPoint slide template (needed before the PowerPoint download in Phase 5).
- Client: does "detect automatically" mean no template?

Still open:
1. You: OK to build the admin sign-in (Phase 1 gate).
2. Client data checks: OOH SL 29 amount, SL 27 and 28 dates, Savlon Soap Jul to Sep'26 blanks, Lux 7,087 GRP.
