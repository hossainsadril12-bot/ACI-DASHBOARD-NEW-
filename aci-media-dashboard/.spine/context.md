# .spine/context.md — domain glossary (terms only, no implementation detail)
<!-- One term per entry. Update the moment a term resolves. -->

- **Dataset:** one kind of data that pages read, replaced as a whole by an upload, e.g. Billing, or one ATL category ("ATL, Savlon Soap").
- **Version:** one published state of a dataset. Every upload or restore makes or points at a version; versions are never changed or deleted.
- **Upload History:** the list of all versions, with their original files.
- **File type:** which of the client's 8 usual files an upload is (ATL, Digital, Channel Cost, FY spend, Activity Calendar, Billing master, Billboard billing, OOH master sheet). Detected from content, not chosen in advance.
- **Sure / not sure (detection):** sure = exactly one file type fully matches; not sure = the admin must pick.
- **Read error:** the numbers cannot be trusted; blocks that file's publish.
- **Warning:** the numbers are usable but something looks odd; never blocks.
- **Category (ATL):** the product group an ATL file covers, read from its "Brand Name:" line, e.g. Savlon Soap.

<!-- Review receipt (Gate D): on a clean whole-branch review the controller records
     .spine/review-receipt (branch tip + verdict); the merge-gate hook blocks
     git merge / git push until it matches the integrated branch's tip. -->
