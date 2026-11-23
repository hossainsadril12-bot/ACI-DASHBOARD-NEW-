# .spine/context.md — domain glossary (terms only, no implementation detail)
<!-- One term per entry. Update the moment a term resolves. -->

- **Dataset:** one kind of data that pages read, replaced as a whole by an upload, e.g. Billing, or one ATL category ("ATL, Savlon Soap").
- **Version:** one published state of a dataset. Every upload or restore makes or points at a version; versions are never changed or deleted.
- **Upload History:** the list of all versions, with their original files.
- **File type:** which of the client's 8 usual files an upload is (ATL, Digital, Channel Cost, FY spend, Activity Calendar, Billing master, Billboard billing, OOH master sheet). Detected from content, not chosen in advance.
- **Sure / not sure (detection):** sure = exactly one file type fully matches; not sure = the admin must pick.
- **Read error:** the numbers cannot be trusted; blocks that file's publish.
- **Warning:** the numbers are usable but something looks odd; never blocks.
- **Category (ATL):** the product group an ATL file covers, read from its "Brand Name:" line, e.g. Savlon Soap. The admin sets its business and its "Our brand"; every other brand in the file is a competitor.
- **Business:** a group of ACI brands (e.g. Toiletries), created by the admin. Hidden, never deleted.
- **Brand:** one ACI product name under one business (e.g. Savlon Handwash), created by the admin. Competitor brands in ATL files are not brands in this sense.
- **Same-as name:** another spelling that means an existing business or brand (e.g. "ACI Salt" means Salt, "Savlon HW" means Savlon Handwash). Renames leave the old name as a same-as name.
- **Not on your list:** a business, brand or ATL category name found in an upload that matches nothing on the admin's lists.
- **Suggestion:** a pre-filled value from the client's old built-in lists. It never decides on its own.
- **Quarter (FY):** three months of the July-to-June financial year: Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun.
- **View control:** a picker that only changes what a table shows (months, columns, date range). It never changes saved data.

<!-- Review receipt (Gate D): on a clean whole-branch review the controller records
     .spine/review-receipt (branch tip + verdict); the merge-gate hook blocks
     git merge / git push until it matches the integrated branch's tip. -->
- **Business filter:** the shared choice of one business (or All businesses) at the top of most pages, remembered across pages. A view control.
- **Being-built page:** a PRD page whose link works but whose content is not built yet; it names the file it will read.
- **Empty state (page):** what a built page shows when its file has no data: names the file; the admin gets an Upload it button.
