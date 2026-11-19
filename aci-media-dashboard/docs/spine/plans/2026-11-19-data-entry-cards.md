# Data Entry Cards (Phase 2 Part D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload Data shows one card per file, like his app. The card decides the file type, so the type is never a question. A file on the wrong card is blocked and names the card to use. Upload History is one list inside Data Entry, and "Uploads & History" leaves the sidebar.

**Architecture:** One pure card list (`src/lib/ingest/cards.ts`) is the only source for card titles, file texts, "Updates" texts and the safety messages. The upload service (`src/server/ingest.ts`) uses it to block a file whose detection disagrees with the card. A new store query (`listActiveVersions`) and a pure function (`cardStates`) give each card its title and its "Now showing" line. The Data Entry page renders the cards on the server; each admin card is a client component that opens a "Check before publishing" dialog built from the existing Part C controls, moved out of `upload-box.tsx` unchanged. The upload API and its form fields do not change.

**Tech Stack:** Next.js 16.4.6 App Router (cacheComponents), React 19, TypeScript, Tailwind 4, shadcn (base-ui), Drizzle + SQLite (`@libsql/client`), zod 4, Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-19-data-entry-cards-design.md` (approved by Sadril, 18 Nov 2026). Only Part D. Manual Entry (`2026-11-19-manual-entry-design.md`) is not in this plan. **Branch:** `feat/data-entry-cards`, from `main` at bc2afac.

## Global Constraints

Project rules, verbatim from the spec:
- "Upload Data shows **one card per file**, like his app. The card the admin uses decides the file type, so the type is never a question."
- "**Digital:** one card per business, like his app (Digital · Toiletries, Digital · Hygiene, Digital · Salt)."
- "The **OOH master sheet** is not a Data Entry card. PRD section 6 puts its upload on the OOH page ("Upload master sheet"), which is built in Phase 4. The reader stays."
- "The auto-detection we built becomes a **safety check**. A file on the wrong card is blocked, with the card to use."
- "**Upload History** is one list, inside Data Entry. The old "Uploads & History" menu item goes."
- "Warnings never block." "An error blocks." "Publish is on only when every file in the dialog can publish."
- "The old warning "Detected as X, but you picked Y" goes, because a mismatch now blocks."
- "The upload API and the form fields stay the same."
- "The real-file tests from Parts A to C keep passing: all 22 of his files are still read the same."
- "The old `/uploads` page stays reachable only from the old pages' upload panels until Phase 3 and Phase 6 replace those pages."

Project rules from earlier plans, still in force:
- App folder: `aci-media-dashboard/`. Run every command from there. Next.js 16 has breaking changes: read `AGENTS.md` and the guide in `node_modules/next/dist/docs/` before touching a page or route (this plan keeps the page's existing `connection()` inside `<Suspense>` pattern; see `01-app/02-guides/preserving-ui-state.md` for why a hidden page keeps its state).
- **Readers stay faithful.** No reader changes in this plan.
- Copy is plain, short English. Exact UI strings in this plan are verbatim.
- UI follows the Wix / Mixpanel reference style already on Data Entry and Businesses & Brands, built from the existing shared components (`Card`, `Button`, `Dialog`, `Badge`). Check desktop and 375 px phone.
- Commits are small Conventional Commits. The message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with a heredoc through the Bash tool (`git commit -F - <<'EOF' … EOF`), never with backticks or `$()` in `-m`. Stage exact paths only. Quote paths that contain `(modules)`. Never stage `netlify.toml`, `.env*`, `Asset/`, `.spine/`, `test-results/`, `e2e/.auth/`.

Security constraints (security-standard; a violation is Critical):
- **Authorisation first:** every server action and route calls the admin check before anything else. The upload routes keep `readUploadRequest` (admin check, Origin, Content-Length, streaming cap) before any body is read. Server actions call `requireAdmin()` first. This plan adds no new action or route.
- **Every input is checked with zod on the server.** `decisions-<i>` stays parsed by `DecisionsSchema`; `type-<i>` stays checked by `isFileType`. A card's type is a hint the server re-checks against the file itself.
- **No secrets** in code, logs, tests or commits. User-facing errors never contain stack traces, file paths or SQL.
- **Tests use the temp store only:** `createTestStore()` in Vitest, the Playwright temp data folder from `playwright.config.ts`. Never the real data folder or Neon.
- **Parameterised SQL only**, through the Drizzle query builder. No string-built SQL.
- Viewers never get upload controls: the server page renders the client card only for the admin, and the routes refuse a viewer anyway.

---

## File Structure

- `src/lib/ingest/cards.ts` (new). **Seam:** `UPLOAD_CARDS`, `cardForType`, `wrongCardMessage`, `notThisFileMessage`, `OOH_MASTER_MESSAGE`. Pure, no store, relative imports only (Playwright specs import it too).
- `src/server/ingest.ts`. **Seam:** `previewUploads` / `publishUploads`, unchanged signatures. A private `wrongFile(chosen, detection)` holds the safety check.
- `src/store/datasets.ts`. **Seam:** adds `listActiveVersions(store)` and `ActiveVersion`.
- `src/app/(modules)/data-entry/cards-state.ts` (new). **Seam:** `cardStates(active, businesses)` and `startDraft(state)`. Pure.
- `src/app/(modules)/data-entry/card-face.tsx` (new). **Seam:** `CardFace`: one card's look, no hooks, used by the server page (viewer) and `DataCard` (admin).
- `src/app/(modules)/data-entry/data-card.tsx` (new, client). **Seam:** `DataCard({ state, businesses })`: Upload Excel, drop, the Check before publishing dialog, Publish.
- `src/app/(modules)/data-entry/file-block.tsx` (new, client). **Seam:** `FileBlock`, `SkeletonBlock`: one file inside the dialog (the old `PreviewRow` minus the type select).
- `src/app/(modules)/data-entry/file-controls.tsx` (new, client). **Seam:** `Panel`, `BusinessSelect`, `NewBusinesses`, `NewCategory`, `NewBrands`, moved from `upload-box.tsx` unchanged.
- `src/app/(modules)/data-entry/upload-box.tsx`: deleted.
- `src/app/(modules)/data-entry/page.tsx`: tabs "Upload Data" / "Upload History", new subtitle, the card grid.
- `src/components/shell/nav-items.ts`, `sidebar.tsx`: no `/uploads` item. The `/uploads` route and page stay.
- `e2e/helpers.ts`, `e2e/phase2a-upload.spec.ts`, `e2e/phase2b-upload.spec.ts`, `e2e/phase2c-names.spec.ts`: the flows through the cards. `playwright.config.ts` is unchanged (fresh-store still runs phase2c first).

---

### Task 1: The card list

**Files:**
- Create: `src/lib/ingest/cards.ts`
- Test: `src/lib/ingest/cards.test.ts`

**Interfaces:**
- Consumes: `FILE_TYPE_LABEL`, `FileType` from `./file-types`.
- Produces:
```ts
export type CardKey = "atl" | "digital" | "fy" | "channel" | "billing" | "calendar" | "billboard";
export type UploadCard = { key: CardKey; type: FileType; title: string; fileText: string; updates: string; multiple: boolean };
export const UPLOAD_CARDS: readonly UploadCard[];        // spec 3.2 order; key === type; only atl has multiple: true
export const OOH_MASTER_MESSAGE: string;                 // "This is the OOH master sheet. It is uploaded on the OOH page."
export function cardForType(t: FileType): UploadCard | null;              // null for "ooh-sites"
export function wrongCardMessage(card: UploadCard, detected: FileType): string;
export function notThisFileMessage(card: UploadCard): string;
```

- [ ] **Step 1: Write the failing test** `src/lib/ingest/cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FILE_TYPES } from "./file-types";
import { OOH_MASTER_MESSAGE, UPLOAD_CARDS, cardForType, notThisFileMessage, wrongCardMessage, type CardKey } from "./cards";

const card = (key: CardKey) => UPLOAD_CARDS.find((c) => c.key === key)!;

describe("UPLOAD_CARDS", () => {
  it("has one card per Data Entry file, in the order of his app", () => {
    expect(UPLOAD_CARDS.map((c) => c.key)).toEqual(["atl", "digital", "fy", "channel", "billing", "calendar", "billboard"]);
    expect(UPLOAD_CARDS.map((c) => c.title)).toEqual([
      "ATL (TV) performance", "Digital performance", "FY media spend", "Channel cost", "Media billing", "Monthly activity calendar", "OOH / billboard bill status",
    ]);
  });
  it("gives every file type except the OOH master sheet exactly one card, keyed by its type", () => {
    for (const t of FILE_TYPES) expect(UPLOAD_CARDS.filter((c) => c.type === t), t).toHaveLength(t === "ooh-sites" ? 0 : 1);
    expect(UPLOAD_CARDS.every((c) => c.key === c.type)).toBe(true);
  });
  it("has unique titles, and only the ATL card takes several files", () => {
    expect(new Set(UPLOAD_CARDS.map((c) => c.title)).size).toBe(UPLOAD_CARDS.length);
    expect(UPLOAD_CARDS.filter((c) => c.multiple).map((c) => c.key)).toEqual(["atl"]);
  });
  it("says which file each card expects and which pages it updates", () => {
    expect(card("atl").fileText).toBe('A "2026 Dash Board" file, one per TV category. The category is read from its "Brand Name:" line. You can choose several files at once.');
    expect(card("digital").fileText).toBe("The business's digital data file, with sheets Meta, YouTube and TikTok.");
    expect(card("fy").fileText).toBe('The CB Media Spent Report (its "Final Report" sheet).');
    expect(card("channel").fileText).toBe("The Channel Cost file, with sheets Electronic, Digital and Press & Radio.");
    expect(card("billing").fileText).toBe('Dashboard Media Final, sheet "Master".');
    expect(card("calendar").fileText).toBe("The All Activity Calendar file, one sheet per month.");
    expect(card("billboard").fileText).toBe("The Billboard Billing Status file.");
    expect(UPLOAD_CARDS.map((c) => c.updates)).toEqual([
      "ATL Media Performance, Home",
      "Digital Media Performance, Influencer, Activity Calendar, Home",
      "Home, FY Media Spend, Activity Calendar, OOH",
      "Channel Wise Spend",
      "Billing Overview, Vendor Statement, Billing Data Sheet",
      "Monthly Activity Calendar",
      "OOH Media Bill Details",
    ]);
  });
});

describe("cardForType", () => {
  it("finds the card for each type, and none for the OOH master sheet", () => {
    expect(cardForType("billing")?.title).toBe("Media billing");
    expect(cardForType("digital")?.title).toBe("Digital performance");
    expect(cardForType("ooh-sites")).toBeNull();
  });
});

describe("safety messages", () => {
  it("names the card to use for a file of another type", () => {
    expect(wrongCardMessage(card("channel"), "calendar")).toBe(
      "This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.",
    );
    expect(wrongCardMessage(card("atl"), "billing")).toBe("This looks like a Billing master file, not ATL (TV). Close this and use the Media billing card.");
  });
  it("points a Digital file at a Digital card, since there is one per business", () => {
    expect(wrongCardMessage(card("billing"), "digital")).toBe("This looks like a Digital file, not Billing master. Close this and use a Digital card.");
  });
  it("sends the OOH master sheet to the OOH page", () => {
    expect(OOH_MASTER_MESSAGE).toBe("This is the OOH master sheet. It is uploaded on the OOH page.");
    expect(wrongCardMessage(card("billboard"), "ooh-sites")).toBe(OOH_MASTER_MESSAGE);
  });
  it("says what the card expects for a file that is none of his", () => {
    expect(notThisFileMessage(card("calendar"))).toBe("This is not an Activity Calendar file. Expected: The All Activity Calendar file, one sheet per month.");
    expect(notThisFileMessage(card("fy"))).toBe('This is not an FY spend file. Expected: The CB Media Spent Report (its "Final Report" sheet).');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/ingest/cards.test.ts`
Expected: FAIL (`Failed to resolve import "./cards"`).

- [ ] **Step 3: Implement** `src/lib/ingest/cards.ts`:

```ts
import { FILE_TYPE_LABEL, type FileType } from "./file-types";

// The Upload Data cards (spec 3.2): the one source for the cards, the safety messages and the tests.
// Relative imports only: the Playwright specs import this file too.

export type CardKey = "atl" | "digital" | "fy" | "channel" | "billing" | "calendar" | "billboard";
export type UploadCard = { key: CardKey; type: FileType; title: string; fileText: string; updates: string; multiple: boolean };

/** In the order of his app. The OOH master sheet has no card: it is uploaded on the OOH page (Phase 4). */
export const UPLOAD_CARDS: readonly UploadCard[] = [
  {
    key: "atl", type: "atl", title: "ATL (TV) performance", multiple: true,
    fileText: 'A "2026 Dash Board" file, one per TV category. The category is read from its "Brand Name:" line. You can choose several files at once.',
    updates: "ATL Media Performance, Home",
  },
  {
    key: "digital", type: "digital", title: "Digital performance", multiple: false,
    fileText: "The business's digital data file, with sheets Meta, YouTube and TikTok.",
    updates: "Digital Media Performance, Influencer, Activity Calendar, Home",
  },
  {
    key: "fy", type: "fy", title: "FY media spend", multiple: false,
    fileText: 'The CB Media Spent Report (its "Final Report" sheet).',
    updates: "Home, FY Media Spend, Activity Calendar, OOH",
  },
  {
    key: "channel", type: "channel", title: "Channel cost", multiple: false,
    fileText: "The Channel Cost file, with sheets Electronic, Digital and Press & Radio.",
    updates: "Channel Wise Spend",
  },
  {
    key: "billing", type: "billing", title: "Media billing", multiple: false,
    fileText: 'Dashboard Media Final, sheet "Master".',
    updates: "Billing Overview, Vendor Statement, Billing Data Sheet",
  },
  {
    key: "calendar", type: "calendar", title: "Monthly activity calendar", multiple: false,
    fileText: "The All Activity Calendar file, one sheet per month.",
    updates: "Monthly Activity Calendar",
  },
  {
    key: "billboard", type: "billboard", title: "OOH / billboard bill status", multiple: false,
    fileText: "The Billboard Billing Status file.",
    updates: "OOH Media Bill Details",
  },
];

export const OOH_MASTER_MESSAGE = "This is the OOH master sheet. It is uploaded on the OOH page.";

/** Each type's label with "a" or "an", for the safety messages. */
const A_TYPE: Record<FileType, string> = {
  atl: "an ATL (TV)",
  calendar: "an Activity Calendar",
  fy: "an FY spend",
  channel: "a Channel Cost",
  billing: "a Billing master",
  billboard: "a Billboard billing",
  digital: "a Digital",
  "ooh-sites": "an OOH master sheet",
};

export function cardForType(t: FileType): UploadCard | null {
  return UPLOAD_CARDS.find((c) => c.type === t) ?? null;
}

/** Spec 3.5: detection is sure the file is another type. Names the card to use (any Digital card for a Digital file). */
export function wrongCardMessage(card: UploadCard, detected: FileType): string {
  if (detected === "ooh-sites") return OOH_MASTER_MESSAGE;
  const right = cardForType(detected);
  const use = detected === "digital" || !right ? "a Digital card" : `the ${right.title} card`;
  return `This looks like ${A_TYPE[detected]} file, not ${FILE_TYPE_LABEL[card.type]}. Close this and use ${use}.`;
}

/** Spec 3.5: detection says the file is none of his files. */
export function notThisFileMessage(card: UploadCard): string {
  return `This is not ${A_TYPE[card.type]} file. Expected: ${card.fileText}`;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/ingest/cards.test.ts` then `npx tsc --noEmit` then `npx eslint src/lib/ingest/cards.ts src/lib/ingest/cards.test.ts`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/cards.ts src/lib/ingest/cards.test.ts
git commit -F - <<'EOF'
feat(ingest): one card list for the Data Entry uploads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The server safety check

**Files:**
- Modify: `src/server/ingest.ts`
- Test: `src/server/ingest.test.ts`

**Interfaces:**
- Consumes: `cardForType`, `wrongCardMessage`, `notThisFileMessage` (Task 1); `Detection` from `@/lib/ingest/detect`.
- Produces: no new export. `previewUploads(store, inputs)` and `publishUploads(store, inputs)` keep their signatures. Behaviour for an input with a valid `chosenType`:
  - detection `sure` with another type: `canPublish: false`, `type: null`, `blockReason === errors[0] === wrongCardMessage(card, detected)`; Publish throws `ValidationError("<file>: <message>")`.
  - detection `none`: same, with `notThisFileMessage(card)`.
  - detection `unsure`: read as the chosen type; the reader's own errors decide.
  - `chosenType: "ooh-sites"` (API only, no card): a sure mismatch blocks with `This looks like <detected label>, not OOH master sheet.`; `none` keeps the old message.
  - No `chosenType` (or an unknown one): exactly as today.
  - The warning "Detected as X, but you picked Y." is gone.

- [ ] **Step 1: Write the failing tests** in `src/server/ingest.test.ts`.

Add to the imports, after `import { NOT_USUAL_FILE } from "@/lib/ingest/detect";`:

```ts
import { OOH_MASTER_MESSAGE, cardForType, notThisFileMessage, wrongCardMessage } from "@/lib/ingest/cards";
import type { FileType } from "@/lib/ingest/file-types";
```

Replace the test `it("warns when the admin picks a type different from a sure detection", …)` (lines 99 to 103) with:

```ts
  it("blocks a file sent for another card when detection is sure, naming the card to use", async () => {
    const store = await calStore();
    const msg = wrongCardMessage(cardForType("channel")!, "calendar");
    expect(msg).toBe("This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.");
    const [p] = await previewUploads(store, [file("cal.xlsx", calendarBook(), "channel")]);
    expect(p).toMatchObject({ canPublish: false, type: null, label: null, datasetKey: null, blockReason: msg, errors: [msg] });
    expect(p.warnings.join(" ")).not.toMatch(/Detected as/);
    await expect(publishUploads(store, [file("cal.xlsx", calendarBook(), "channel")])).rejects.toThrow(new ValidationError(`cal.xlsx: ${msg}`));
    expect(await listHistory(store)).toEqual([]);
  });
  it("reads a file sent for its own card as usual, with no detection warning", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook(), "calendar")]);
    expect(p).toMatchObject({ type: "calendar", canPublish: true, errors: [] });
    expect(p.warnings.join(" ")).not.toMatch(/Detected as/);
  });
  it("reads an unsure file as the card's type, and the reader's own errors decide", async () => {
    const [p] = await previewUploads(await calStore(), [file("c.xlsx", calendarBook("Nov'26", false), "channel")]);
    expect(p.detection).toEqual({ status: "unsure", candidates: ["calendar"] });
    expect(p).toMatchObject({ type: "channel", canPublish: false });
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).not.toMatch(/looks like|This is not/);
  });
  it("blocks the OOH master sheet on any card, saying where it is uploaded", async () => {
    const ooh = makeXlsx([{ name: "Sites", rows: [["SL", "OOH Location", "Latitude", "Longitude"], [1, "Gulshan 1", 23.78, 90.41]] }]);
    for (const t of ["billboard", "calendar"] as const) {
      const [p] = await previewUploads(await createTestStore(), [file("ooh.xlsx", ooh, t)]);
      expect(p, t).toMatchObject({ canPublish: false, type: null, blockReason: OOH_MASTER_MESSAGE, errors: [OOH_MASTER_MESSAGE] });
    }
    const [noCard] = await previewUploads(await createTestStore(), [file("ooh.xlsx", ooh)]);
    expect(noCard.type).toBe("ooh-sites"); // with no card, the API reads it as before
  });
  it("still blocks a sure mismatch for a type with no card (the OOH master sheet, API only)", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook(), "ooh-sites")]);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: "This looks like Activity Calendar, not OOH master sheet." });
  });
```

Replace the test `it("keeps a workbook that is none of his files blocked even when the admin picks a type", …)` (lines 117 to 125) with:

```ts
  it("blocks a workbook that is none of his files on any card, saying what the card expects", async () => {
    // Calendar layout, but no month in the sheet name or A1 alone, so detection says none; the calendar reader could still read it.
    const book = makeXlsx([{ name: "26", rows: [["CB Media Activity Nov"], ["Business", "Brand", "Media"], [null, null, "TV", "Total"], ["T", "Savlon Soap", 1, 1], ["Grand Total", null, 1, 1]] }]);
    const store = await createTestStore();
    const msg = notThisFileMessage(cardForType("calendar")!);
    const [p] = await previewUploads(store, [file("x.xlsx", book, "calendar")]);
    expect(p.detection?.status).toBe("none");
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: msg, errors: [msg] });
    await expect(publishUploads(store, [file("x.xlsx", book, "calendar")])).rejects.toThrow(new ValidationError(`x.xlsx: ${msg}`));
    // With no card (the API without type-<i>), the old message stays.
    const [noCard] = await previewUploads(store, [file("x.xlsx", book)]);
    expect(noCard).toMatchObject({ canPublish: false, blockReason: "This is not one of the usual Media Mind files.", errors: [NOT_USUAL_FILE] });
  });
```

Add at the end of the file:

```ts
describe.skipIf(!hasClientFiles)("his real files on the wrong card", () => {
  // [file, the type detection is sure of, a card of another type]
  const CASES: [string, FileType, FileType][] = [
    ["atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx", "atl", "digital"],
    ["Hygiene_Business.xlsx", "digital", "atl"],
    ["CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx", "fy", "channel"],
    ["Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx", "channel", "billing"],
    ["Dashboard_Media_Final_Fixed_26th_October_2026.xlsx", "billing", "calendar"],
    ["All_Activity_Calender_FY_26-27.xlsx", "calendar", "billboard"],
    ["Billboard_Billing_Status_Updated_10th_Nov26.xlsx", "billboard", "fy"],
    ["ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx", "ooh-sites", "billboard"],
  ];
  it.each(CASES)("%s (%s) on the %s card is blocked, naming the card to use", async (rel, detected, cardType) => {
    const [p] = await previewUploads(await createTestStore(), [file("f.xlsx", clientFile(rel), cardType)]);
    expect(p.detection).toEqual({ status: "sure", type: detected });
    const msg = wrongCardMessage(cardForType(cardType)!, detected);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: msg, errors: [msg] });
  });
  it.each(CASES.filter(([, detected]) => detected !== "ooh-sites"))("%s is read on its own (%s) card", async (rel, detected) => {
    const [p] = await previewUploads(await createTestStore(), [file("f.xlsx", clientFile(rel), detected)]);
    expect(p.type).toBe(detected);
    expect(p.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/server/ingest.test.ts`
Expected: FAIL. The new wrong-card tests get `blockReason: "Fix the read error first."` (the file is read as the chosen type), the "none" test still gets "This is not one of the usual Media Mind files.", and the mismatch preview still carries "Detected as Activity Calendar, but you picked Channel Cost.".

- [ ] **Step 3: Implement** in `src/server/ingest.ts`.

Add to the imports, after `import { FILE_TYPE_LABEL, isFileType, type FileType } from "@/lib/ingest/file-types";`:

```ts
import { cardForType, notThisFileMessage, wrongCardMessage } from "@/lib/ingest/cards";
```

Add this function just above `/** Reads one file and checks its names against the catalog snapshot. … */ function prepareFile(`:

```ts
/**
 * The safety check (spec 3.5) for a file sent with a type, the card it was chosen on; null reads it as that type.
 * Sure of another type: blocked, naming the card to use. None of his files: blocked, naming what the card expects.
 * Unsure: read as the card's type, and the reader's own errors decide.
 */
function wrongFile(chosen: FileType, detection: Detection): string | null {
  const card = cardForType(chosen);
  if (detection.status === "sure" && detection.type !== chosen) {
    return card ? wrongCardMessage(card, detection.type) : `This looks like ${FILE_TYPE_LABEL[detection.type]}, not ${FILE_TYPE_LABEL[chosen]}.`;
  }
  if (detection.status === "none" && card) return notThisFileMessage(card);
  return null;
}
```

In `prepareFile`, replace:

```ts
  // Spec p2-04: a file that matches none of his usual files is refused, whatever type the admin picks.
  if (detection.status === "none") return block("This is not one of the usual Media Mind files.", detection.lookedFor);
  const chosen = isFileType(input.chosenType) ? input.chosenType : null; // an unknown override is ignored
  const type: FileType | null = chosen ?? (detection.status === "sure" ? detection.type : null);
  if (!type) return block("Pick the file type.", null);
  preview.type = type;
  if (detection.status === "sure" && detection.type !== type) {
    preview.warnings.push(`Detected as ${FILE_TYPE_LABEL[detection.type]}, but you picked ${FILE_TYPE_LABEL[type]}.`);
  }
```

with:

```ts
  const chosen = isFileType(input.chosenType) ? input.chosenType : null; // an unknown override is ignored
  const wrong = chosen ? wrongFile(chosen, detection) : null;
  if (wrong) return block(wrong);
  // Spec p2-04: a file that matches none of his usual files is refused.
  if (detection.status === "none") return block("This is not one of the usual Media Mind files.", detection.lookedFor);
  const type: FileType | null = chosen ?? (detection.status === "sure" ? detection.type : null);
  if (!type) return block("Pick the file type.", null);
  preview.type = type;
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/server src/lib/ingest src/app/api` then `npx tsc --noEmit` then `npx eslint src/server/ingest.ts src/server/ingest.test.ts`
Expected: PASS (every existing ingest, reader, detect, route and real-file test stays green; the real-file block runs only when `Asset/xlsx` is present), no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/ingest.ts src/server/ingest.test.ts
git commit -F - <<'EOF'
feat(ingest): block a file on the wrong card, naming the card to use

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: "Now showing" for each card

**Files:**
- Modify: `src/store/datasets.ts`
- Test: `src/store/datasets.test.ts`
- Create: `src/app/(modules)/data-entry/cards-state.ts`
- Test: `src/app/(modules)/data-entry/cards-state.test.ts`

**Interfaces:**
- Consumes: `UPLOAD_CARDS`, `UploadCard` (Task 1); `whenDhaka` from `./logic`; `dataset`, `datasetVersion`, `uploadFile` from `./schema`.
- Produces:
```ts
// src/store/datasets.ts
export type ActiveVersion = { datasetKey: string; kind: string; label: string; fileName: string | null; createdAt: Date; source: DatasetSource };
export async function listActiveVersions(store: Store): Promise<ActiveVersion[]>;   // one per dataset, ordered by key

// src/app/(modules)/data-entry/cards-state.ts
export type CardState = { id: string; card: UploadCard; title: string; business: { slug: string; name: string } | null; nowShowing: string };
export const NOTHING_YET: string;       // "nothing uploaded yet"
export const ANOTHER_BUSINESS: string;  // "Digital · another business"
export function cardStates(active: ActiveVersion[], businesses: { slug: string; name: string; hidden?: boolean }[]): CardState[];
```
Card ids: `atl`, `digital:<business slug>` (one per visible business with an active `digital:<slug>` version, sorted by name), `digital` (the card for another business), `fy`, `channel`, `billing`, `calendar`, `billboard`. `nowShowing` has no "Now showing: " prefix; the card adds it.

- [ ] **Step 1: Write the failing tests.**

In `src/store/datasets.test.ts`, change the import line to:

```ts
import { getActiveData, getActiveFileHashes, listActiveVersions, listHistory, publishVersion, publishVersions, restoreVersion, type DatasetSource, type PublishInput } from "./datasets";
```

and add inside `describe("datasets", …)`, after the test "refuses to restore a version that does not exist":

```ts
  it("lists nothing in use before anything is published", async () => {
    expect(await listActiveVersions(await createTestStore())).toEqual([]);
  });

  it("lists the version each dataset shows now, with its file name and source", async () => {
    const store = await createTestStore();
    const old = await publishVersion(store, input({ label: "Billing A", file: { name: "billing-a.xlsx", bytes: Buffer.from("PK bytes a") } }));
    await publishVersion(store, input({ label: "Billing B", file: { name: "billing-b.xlsx", bytes: Buffer.from("PK bytes b") } }));
    await publishVersion(store, input({ datasetKey: "calendar", kind: "calendar", label: "Calendar, typed", source: "manual" }));
    expect(await listActiveVersions(store)).toEqual([
      { datasetKey: "billing", kind: "billing", label: "Billing B", fileName: "billing-b.xlsx", createdAt: expect.any(Date), source: "upload" },
      { datasetKey: "calendar", kind: "calendar", label: "Calendar, typed", fileName: null, createdAt: expect.any(Date), source: "manual" },
    ]);
    await restoreVersion(store, old.versionId);
    expect((await listActiveVersions(store)).map((v) => [v.datasetKey, v.label, v.fileName])).toEqual([
      ["billing", "Billing A", "billing-a.xlsx"],
      ["calendar", "Calendar, typed", null],
    ]);
  });
```

Create `src/app/(modules)/data-entry/cards-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActiveVersion } from "@/store/datasets";
import { cardStates } from "./cards-state";

const v = (datasetKey: string, fileName: string | null, iso: string, source: ActiveVersion["source"] = "upload"): ActiveVersion => ({
  datasetKey, kind: datasetKey.split(":")[0], label: datasetKey, fileName, createdAt: new Date(iso), source,
});
const BIZ = [{ slug: "salt", name: "Salt" }, { slug: "hygiene", name: "Hygiene" }, { slug: "toiletries", name: "Toiletries", hidden: true }];
const nowOf = (states: ReturnType<typeof cardStates>) => Object.fromEntries(states.map((c) => [c.id, c.nowShowing]));

describe("cardStates", () => {
  it("shows the seven cards in order, with nothing uploaded yet, on an empty store", () => {
    expect(cardStates([], BIZ).map((c) => [c.id, c.title, c.business, c.nowShowing])).toEqual([
      ["atl", "ATL (TV) performance", null, "nothing uploaded yet"],
      ["digital", "Digital performance", null, "nothing uploaded yet"],
      ["fy", "FY media spend", null, "nothing uploaded yet"],
      ["channel", "Channel cost", null, "nothing uploaded yet"],
      ["billing", "Media billing", null, "nothing uploaded yet"],
      ["calendar", "Monthly activity calendar", null, "nothing uploaded yet"],
      ["billboard", "OOH / billboard bill status", null, "nothing uploaded yet"],
    ]);
  });

  it("gives each visible business with Digital data its own card in the Digital slot, then the card for another business", () => {
    const states = cardStates([
      v("digital:salt", "Salt.xlsx", "2026-11-16T08:05:00Z"),
      v("digital:hygiene", "Hygiene.xlsx", "2026-11-17T04:30:00Z"),
      v("digital:toiletries", "Toiletries.xlsx", "2026-11-17T04:30:00Z"), // hidden business: no card
      v("digital:gone", "Gone.xlsx", "2026-11-17T04:30:00Z"), // not on the list: no card
    ], BIZ);
    expect(states.filter((c) => c.card.key === "digital").map((c) => [c.id, c.title, c.business, c.nowShowing])).toEqual([
      ["digital:hygiene", "Digital · Hygiene", { slug: "hygiene", name: "Hygiene" }, "Hygiene.xlsx · 17 Nov 2026, 10:30"],
      ["digital:salt", "Digital · Salt", { slug: "salt", name: "Salt" }, "Salt.xlsx · 16 Nov 2026, 14:05"],
      ["digital", "Digital · another business", null, "nothing uploaded yet"],
    ]);
    expect(states.map((c) => c.id)).toEqual(["atl", "digital:hygiene", "digital:salt", "digital", "fy", "channel", "billing", "calendar", "billboard"]);
  });

  it("counts the ATL categories and names the last upload", () => {
    const two = cardStates([
      v("atl:lux-soap", "lux.xlsx", "2026-11-16T08:05:00Z"),
      v("atl:septex", "septex.xlsx", "2026-11-17T04:30:00Z"),
      v("calendar", "cal.xlsx", "2026-11-18T00:00:00Z"),
    ], []);
    expect(two[0].nowShowing).toBe("2 categories · last upload septex.xlsx · 17 Nov 2026, 10:30");
    expect(cardStates([v("atl:lux-soap", "lux.xlsx", "2026-11-16T08:05:00Z")], [])[0].nowShowing).toBe("1 category · last upload lux.xlsx · 16 Nov 2026, 14:05");
  });

  it("shows the file and time on the other cards, and Manual edit for a typed version", () => {
    const states = cardStates([
      v("billing", "billing.xlsx", "2026-11-16T08:05:00Z"),
      v("calendar", null, "2026-11-17T04:30:00Z", "manual"),
      v("atl:septex", null, "2026-11-17T04:30:00Z", "manual"),
    ], []);
    expect(nowOf(states)).toEqual({
      atl: "1 category · Manual edit · 17 Nov 2026, 10:30",
      digital: "nothing uploaded yet",
      fy: "nothing uploaded yet",
      channel: "nothing uploaded yet",
      billing: "billing.xlsx · 16 Nov 2026, 14:05",
      calendar: "Manual edit · 17 Nov 2026, 10:30",
      billboard: "nothing uploaded yet",
    });
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/store/datasets.test.ts "src/app/(modules)/data-entry/cards-state.test.ts"`
Expected: FAIL (`listActiveVersions` is not exported; `./cards-state` does not resolve).

- [ ] **Step 3: Implement.**

In `src/store/datasets.ts`, add after the `HistoryRow` type:

```ts
/** The version a dataset shows now, for the Upload Data cards' "Now showing" line. */
export type ActiveVersion = { datasetKey: string; kind: string; label: string; fileName: string | null; createdAt: Date; source: DatasetSource };
```

and add after `getActiveData`:

```ts
/** Every dataset's active version, by dataset key. Leaves out the data itself. */
export async function listActiveVersions(store: Store): Promise<ActiveVersion[]> {
  return store
    .select({
      datasetKey: dataset.key,
      kind: datasetVersion.kind,
      label: datasetVersion.label,
      fileName: uploadFile.name,
      createdAt: datasetVersion.createdAt,
      source: datasetVersion.source,
    })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .leftJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .orderBy(dataset.key);
}
```

Create `src/app/(modules)/data-entry/cards-state.ts`:

```ts
import { UPLOAD_CARDS, type UploadCard } from "@/lib/ingest/cards";
import type { ActiveVersion } from "@/store/datasets";
import { whenDhaka } from "./logic";

// Pure: which cards Upload Data shows (spec 3.2, 3.3) and what each one shows now.

export type CardState = { id: string; card: UploadCard; title: string; business: { slug: string; name: string } | null; nowShowing: string };

export const NOTHING_YET = "nothing uploaded yet";
/** The title of the Digital card for a business with no Digital data, once another business has its own card. */
export const ANOTHER_BUSINESS = "Digital · another business";

/** "<file> · <date and time>", or "Manual edit · <date and time>" for a typed version. */
function shown(v: ActiveVersion): string {
  const when = whenDhaka(v.createdAt);
  return v.source === "manual" ? `Manual edit · ${when}` : `${v.fileName ?? v.label} · ${when}`;
}

/** "N categories · last upload <file> · <date and time>" from the active ATL versions. */
function atlLine(list: ActiveVersion[]): string {
  if (list.length === 0) return NOTHING_YET;
  const last = list.reduce((a, v) => (v.createdAt > a.createdAt ? v : a));
  const n = `${list.length} ${list.length === 1 ? "category" : "categories"}`;
  return last.source === "manual" ? `${n} · ${shown(last)}` : `${n} · last upload ${shown(last)}`;
}

/**
 * The cards in his app's order. Digital: one card per visible business that has an active digital:<slug> version
 * (sorted by name, business fixed), then one card for another business. Every other card reads the dataset keyed
 * by its type.
 */
export function cardStates(active: ActiveVersion[], businesses: { slug: string; name: string; hidden?: boolean }[]): CardState[] {
  const byKey = new Map(active.map((v) => [v.datasetKey, v] as const));
  const out: CardState[] = [];
  for (const card of UPLOAD_CARDS) {
    if (card.type === "atl") {
      out.push({ id: card.key, card, title: card.title, business: null, nowShowing: atlLine(active.filter((v) => v.datasetKey.startsWith("atl:"))) });
      continue;
    }
    if (card.type === "digital") {
      const visible = businesses.filter((b) => !b.hidden).sort((a, b) => a.name.localeCompare(b.name));
      let own = 0;
      for (const b of visible) {
        const v = byKey.get(`digital:${b.slug}`);
        if (!v) continue;
        own++;
        out.push({ id: `digital:${b.slug}`, card, title: `Digital · ${b.name}`, business: { slug: b.slug, name: b.name }, nowShowing: shown(v) });
      }
      out.push({ id: card.key, card, title: own ? ANOTHER_BUSINESS : card.title, business: null, nowShowing: NOTHING_YET });
      continue;
    }
    const v = byKey.get(card.type);
    out.push({ id: card.key, card, title: card.title, business: null, nowShowing: v ? shown(v) : NOTHING_YET });
  }
  return out;
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/store "src/app/(modules)/data-entry"` then `npx tsc --noEmit` then `npx eslint src/store/datasets.ts src/store/datasets.test.ts "src/app/(modules)/data-entry/cards-state.ts" "src/app/(modules)/data-entry/cards-state.test.ts"`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/store/datasets.ts src/store/datasets.test.ts "src/app/(modules)/data-entry/cards-state.ts" "src/app/(modules)/data-entry/cards-state.test.ts"
git commit -F - <<'EOF'
feat(data-entry): Now showing for each upload card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The cards and the Check before publishing dialog

**Files:**
- Create: `src/app/(modules)/data-entry/file-controls.tsx`, `file-block.tsx`, `card-face.tsx`, `data-card.tsx`
- Test: `src/app/(modules)/data-entry/file-block.test.ts`, `card-face.test.ts`
- Modify: `src/app/(modules)/data-entry/page.tsx`, `cards-state.ts`, `cards-state.test.ts`, `logic.ts`, `logic.test.ts`
- Delete: `src/app/(modules)/data-entry/upload-box.tsx`

**Interfaces:**
- Consumes: `CardState`, `cardStates` (Task 3); `listActiveVersions` (Task 3); `getCatalog`; the logic helpers in `./logic` (`emptyDraft`, `toDecisions`, `afterPreview`, `uploadForm`, `postUploads`, `canPublishAll`, `publishedMessage`, …); `POST /api/uploads/preview` and `POST /api/uploads/publish` (unchanged: `files`, `type-<i>`, `decisions-<i>`).
- Produces:
```ts
// cards-state.ts
export function startDraft(state: CardState): RowDraft;   // a business's own Digital card: business = { value: slug, newName: "" }

// file-controls.tsx ("use client"), moved from upload-box.tsx unchanged
export function Panel(props: { children: ReactNode }): JSX.Element;
export function BusinessSelect(props: { label: string; newLabel: string; pick: BusinessPick; businesses: BusinessOption[]; disabled: boolean;
  onPick: (p: BusinessPick) => void; onTyping: (p: BusinessPick) => void; onCommit: () => void }): JSX.Element;
export function NewBusinesses(props: { preview: FilePreview; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; onDraft: (d: RowDraft) => void }): JSX.Element;
export function NewCategory(props: { category: NonNullable<FilePreview["newCategory"]>; businesses: BusinessOption[]; start: RowDraft["atl"]; disabled: boolean;
  onAdd: (atl: NonNullable<RowDraft["atl"]>) => void }): JSX.Element;
export function NewBrands(props: { draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; fileBusiness: string | null; onDone: (brands: BrandDraft[]) => void }): JSX.Element;

// file-block.tsx ("use client")
export type FileBlockProps = {
  name: string; cardType: FileType; fixedBusiness: boolean; preview: FilePreview | null; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean;
  onDraft: (d: RowDraft) => void; onTyping: (d: RowDraft) => void; onCommit: () => void; onRemove: (() => void) | null;
};
export function FileBlock(props: FileBlockProps): JSX.Element;   // <li data-testid="preview-row">
export function SkeletonBlock(props: { name: string }): JSX.Element;   // "Reading <file name>…"

// card-face.tsx (no directive, no hooks)
export function CardFace(props: { state: CardState; dragging?: boolean; onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>; onDrop?: DragEventHandler<HTMLDivElement>; children?: ReactNode }): JSX.Element;
  // root: data-testid="upload-card" data-card-id={state.id}

// data-card.tsx ("use client")
export function DataCard(props: { state: CardState; businesses: BusinessOption[] }): JSX.Element;
```
- Removes: `publishButtonLabel` from `logic.ts` (the button now says "Publish", spec 3.4).

- [ ] **Step 1: Write the failing tests.**

Create `src/app/(modules)/data-entry/file-block.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FilePreview } from "@/server/ingest";
import { FileBlock, SkeletonBlock, type FileBlockProps } from "./file-block";
import { emptyDraft } from "./logic";

const preview = (over: Partial<FilePreview> = {}): FilePreview => ({
  index: 0, fileName: "digital.xlsx", sizeBytes: 10, sha256: "x",
  detection: { status: "sure", type: "digital" }, type: "digital",
  label: "Digital, Salt", summary: "3 platforms", datasetKey: "digital:salt",
  rowCount: 12, warnings: [], errors: [], canPublish: true, blockReason: null,
  business: { slug: "salt", name: "Salt" }, businessSource: "admin", needsBusiness: false,
  newBusinesses: [], newCategory: null, newBrands: [], pendingChanges: [], ...over,
});
const render = (over: Partial<FileBlockProps> = {}) => renderToStaticMarkup(createElement(FileBlock, {
  name: "digital.xlsx", cardType: "digital", fixedBusiness: false, preview: preview(), draft: emptyDraft(),
  businesses: [{ slug: "salt", name: "Salt" }], disabled: false,
  onDraft: () => {}, onTyping: () => {}, onCommit: () => {}, onRemove: null, ...over,
}));

describe("FileBlock", () => {
  it("asks for the business on the Digital card for another business", () => {
    expect(render()).toContain('aria-label="Business for digital.xlsx"');
  });
  it("never asks for the business on a business's own Digital card", () => {
    expect(render({ fixedBusiness: true })).not.toContain("Business for digital.xlsx");
  });
  it("has no file type select: the card decides the type", () => {
    expect(render()).not.toContain("File type for");
    expect(render({ cardType: "atl", name: "atl.xlsx" })).not.toContain("Pick the file type");
  });
  it("shows what was read and the warnings to check", () => {
    const html = render({ cardType: "atl", name: "atl.xlsx", preview: preview({ type: "atl", label: "ATL, Lux Soap", summary: "4 months", warnings: ["Sheet GRP has no total."] }) });
    expect(html).toContain("What was read");
    expect(html).toContain("ATL, Lux Soap");
    expect(html).toContain("4 months");
    expect(html).toContain("Please check");
    expect(html).toContain("Sheet GRP has no total.");
  });
  it("shows a wrong-card error in red, with nothing read", () => {
    const msg = "This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.";
    const html = render({ cardType: "channel", name: "cal.xlsx", preview: preview({ type: null, label: null, summary: null, canPublish: false, blockReason: msg, errors: [msg] }) });
    expect(html).toContain(msg);
    expect(html).toContain("text-red-700");
    expect(html).not.toContain("What was read");
  });
  it("offers Remove only when the card takes several files", () => {
    expect(render({ onRemove: () => {} })).toContain('aria-label="Remove digital.xlsx"');
    expect(render()).not.toContain("Remove digital.xlsx");
  });
  it("keeps the preview-row test id", () => {
    expect(render()).toContain('data-testid="preview-row"');
  });
});

describe("SkeletonBlock", () => {
  it("says which file is being read", () => {
    expect(renderToStaticMarkup(createElement(SkeletonBlock, { name: "lux.xlsx" }))).toContain("Reading lux.xlsx…");
  });
});
```

Create `src/app/(modules)/data-entry/card-face.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardFace } from "./card-face";
import { cardStates } from "./cards-state";

const [atl] = cardStates([], []);

describe("CardFace", () => {
  it("shows the title, the file it expects, what it updates and what it shows now", () => {
    const html = renderToStaticMarkup(createElement(CardFace, { state: atl }));
    expect(html).toContain('data-testid="upload-card"');
    expect(html).toContain('data-card-id="atl"');
    expect(html).toContain("ATL (TV) performance");
    expect(html).toContain("one per TV category");
    expect(html).toContain("Updates: ");
    expect(html).toContain("ATL Media Performance, Home");
    expect(html).toContain("Now showing: ");
    expect(html).toContain("nothing uploaded yet");
  });
  it("has no button for a viewer, and shows the admin's button when given", () => {
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }))).not.toContain("<button");
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }, createElement("button", null, "Upload Excel")))).toContain("Upload Excel</button>");
  });
});
```

In `src/app/(modules)/data-entry/cards-state.test.ts`, change the import lines to:

```ts
import { describe, expect, it } from "vitest";
import type { ActiveVersion } from "@/store/datasets";
import { cardStates, startDraft } from "./cards-state";
import { emptyDraft, toDecisions } from "./logic";
```

and add at the end:

```ts
describe("startDraft", () => {
  it("sends the business of a business's own Digital card, and nothing on the other cards", () => {
    const [atl, hygiene, other] = cardStates([v("digital:hygiene", "h.xlsx", "2026-11-17T04:30:00Z")], BIZ);
    expect(hygiene.id).toBe("digital:hygiene");
    expect(startDraft(hygiene).business).toEqual({ value: "hygiene", newName: "" });
    expect(toDecisions(startDraft(hygiene), BIZ)).toEqual({ business: "hygiene", businesses: [], brands: [] });
    expect(startDraft(other)).toEqual(emptyDraft());
    expect(startDraft(atl)).toEqual(emptyDraft());
  });
});
```

In `src/app/(modules)/data-entry/logic.test.ts`, remove `publishButtonLabel, ` from the import on line 5, and delete this test from `describe("texts", …)`:

```ts
  it("counts the files on the publish button", () => {
    expect(publishButtonLabel(3)).toBe("Publish 3 files");
    expect(publishButtonLabel(1)).toBe("Publish 1 file");
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run "src/app/(modules)/data-entry"`
Expected: FAIL (`./file-block` and `./card-face` do not resolve; `startDraft` is not exported).

- [ ] **Step 3: Implement.**

3a. In `src/app/(modules)/data-entry/logic.ts`, delete the line:

```ts
export const publishButtonLabel = (n: number) => `Publish ${files(n)}`;
```

3b. In `src/app/(modules)/data-entry/cards-state.ts`, change `import { whenDhaka } from "./logic";` to:

```ts
import { emptyDraft, whenDhaka, type RowDraft } from "./logic";
```

and add at the end:

```ts
/** A new file's draft on this card: a business's own Digital card sends that business, so it is never asked. */
export function startDraft(state: CardState): RowDraft {
  return state.business ? { ...emptyDraft(), business: { value: state.business.slug, newName: "" } } : emptyDraft();
}
```

3c. Create `src/app/(modules)/data-entry/file-controls.tsx` (moved from `upload-box.tsx` lines 299 to 451; only `export` and the imports are new):

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilePreview } from "@/server/ingest";
import {
  MAX_NEW_BUSINESS_NAME, MAX_OWN_BRANDS, NEW_BUSINESS, addAllAsNew, brandMatches, brandPickValue, categoryDefaults, decisionValue,
  sameAsOptions, setBusinessDecision, tickShown, type BrandDraft, type BusinessOption, type BusinessPick, type RowDraft,
} from "./logic";

// The Part C questions for one file (business, new businesses, new category, new brands). Moved from upload-box.tsx unchanged.

const SELECT = "h-9 w-full shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm md:w-56";

/** A grey box under the row for list questions, lined up with the row's controls. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:ml-7">{children}</div>;
}

/** Visible businesses, then New business… with a name box. The name is sent when the box loses focus or on Enter. */
export function BusinessSelect({ label, newLabel, pick, businesses, disabled, onPick, onTyping, onCommit }: {
  label: string; newLabel: string; pick: BusinessPick; businesses: BusinessOption[]; disabled: boolean;
  onPick: (p: BusinessPick) => void; onTyping: (p: BusinessPick) => void; onCommit: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
      <select aria-label={label} value={pick.value} disabled={disabled} className={SELECT}
        onChange={(e) => onPick({ value: e.target.value, newName: e.target.value === NEW_BUSINESS ? pick.newName : "" })}>
        <option value="">Pick the business…</option>
        {businesses.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        <option value={NEW_BUSINESS}>New business…</option>
      </select>
      {pick.value === NEW_BUSINESS && (
        <Input aria-label={newLabel} value={pick.newName} maxLength={MAX_NEW_BUSINESS_NAME} disabled={disabled} className="md:w-56"
          onChange={(e) => onTyping({ value: NEW_BUSINESS, newName: e.target.value })}
          onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }} />
      )}
    </div>
  );
}

export function NewBusinesses({ preview: p, draft, businesses, disabled, onDraft }: {
  preview: FilePreview; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; onDraft: (d: RowDraft) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">New businesses in this file</p>
        {p.newBusinesses.length >= 2 && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => onDraft({ ...draft, businesses: addAllAsNew(p, draft.businesses) })}>Add all as new</Button>
        )}
      </div>
      <ul className="space-y-2">
        {draft.bizNames.map((n) => (
          <li key={n} className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-gray-900" title={n}>{n}</p>
            <select aria-label={`Decision for ${n}`} value={decisionValue(draft.businesses, n)} disabled={disabled} className={SELECT}
              onChange={(e) => onDraft({ ...draft, businesses: setBusinessDecision(draft.businesses, draft.bizNames, n, e.target.value) })}>
              <option value="">Decide…</option>
              {sameAsOptions(n, draft, businesses).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function NewCategory({ category, businesses, start, disabled, onAdd }: {
  category: NonNullable<FilePreview["newCategory"]>; businesses: BusinessOption[]; start: RowDraft["atl"]; disabled: boolean;
  onAdd: (atl: NonNullable<RowDraft["atl"]>) => void;
}) {
  const [picks, setPicks] = useState(() => start ?? categoryDefaults(category, businesses));
  const hasBusiness = picks.business.value === NEW_BUSINESS ? !!picks.business.newName.trim() : !!picks.business.value;
  const tooMany = picks.ownBrands.length > MAX_OWN_BRANDS;
  const ready = hasBusiness && picks.ownBrands.length > 0 && !tooMany;
  const toggle = (r: string, on: boolean) =>
    setPicks({ ...picks, ownBrands: on ? category.brands.filter((b) => b === r || picks.ownBrands.includes(b)) : picks.ownBrands.filter((b) => b !== r) });
  return (
    <Panel>
      <p className="text-sm font-medium text-gray-900">New category found: {category.title}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">Business</p>
        <BusinessSelect label={`Business for category ${category.title}`} newLabel={`New business name for ${category.title}`} pick={picks.business} businesses={businesses}
          disabled={disabled}
          onPick={(b) => setPicks({ ...picks, business: b })}
          onTyping={(b) => setPicks({ ...picks, business: b })}
          onCommit={() => {}} />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-gray-500">Our brands</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {category.brands.map((r, k) => (
            <label key={`${k}-${r}`} className="flex min-w-0 max-w-full items-center gap-2 text-sm text-gray-900">
              <input type="checkbox" aria-label={`Our brand ${r}`} checked={picks.ownBrands.includes(r)} disabled={disabled}
                onChange={(e) => toggle(r, e.target.checked)} className="size-4 shrink-0 accent-primary" />
              <span className="min-w-0 truncate">{r}</span>
            </label>
          ))}
        </div>
        {tooMany && <p className="text-sm text-gray-500">Tick at most {MAX_OWN_BRANDS}.</p>}
      </fieldset>
      <Button size="sm" disabled={disabled || !ready} onClick={() => onAdd({ title: category.title, ...picks })}>Add category</Button>
    </Panel>
  );
}

/**
 * Review and add: a copy of the row's brands, saved by Done. fileBusiness: the row's business now (Digital, ATL),
 * shown instead of the name an earlier preview gave.
 */
export function NewBrands({ draft, businesses, disabled, fileBusiness, onDone }: {
  draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; fileBusiness: string | null; onDone: (brands: BrandDraft[]) => void;
}) {
  const [rows, setRows] = useState<BrandDraft[]>(draft.brands);
  const [query, setQuery] = useState("");
  // A brand with no business on its row (OOH) picks one: visible businesses, or one this row adds.
  const adding = draft.bizNames.filter((n) => decisionValue(draft.businesses, n) === "add");
  const set = (k: number, b: Partial<BrandDraft>) => setRows(rows.map((x, j) => (j === k ? { ...x, ...b } : x)));
  const shown = rows.filter((b) => brandMatches(b, query)).length;
  const actions = (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" disabled={disabled || shown === 0} onClick={() => setRows(tickShown(rows, query))}>Tick all</Button>
      <Button size="sm" disabled={disabled} onClick={() => onDone(rows)}>Done</Button>
    </div>
  );
  return (
    <Panel>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Input type="search" aria-label="Search brands" placeholder="Search brands" value={query} className="md:w-64"
          onChange={(e) => setQuery(e.target.value)} />
        {actions}
      </div>
      {shown === 0 && <p className="text-sm text-gray-500">No brand matches the search.</p>}
      <ul className="space-y-3">
        {rows.map((b, k) => {
          if (!brandMatches(b, query)) return null;
          const business = b.business !== null ? (fileBusiness ?? b.business) : null;
          return (
            <li key={b.name} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <label className="flex min-w-0 items-center gap-2 text-sm text-gray-900 md:w-40">
                <input type="checkbox" aria-label={`Add ${b.name}`} checked={b.ticked} disabled={disabled}
                  onChange={(e) => set(k, { ticked: e.target.checked })} className="size-4 shrink-0 accent-primary" />
                <span className="min-w-0 truncate" title={b.name}>{b.name}</span>
              </label>
              <Input aria-label={`Full name for ${b.name}`} value={b.fullName} maxLength={120} disabled={disabled} className="md:flex-1"
                onChange={(e) => set(k, { fullName: e.target.value })} />
              {business !== null ? (
                <p className="min-w-0 truncate text-sm text-gray-500 md:w-56" title={business}>{business}</p>
              ) : (
                <select aria-label={`Business for ${b.name}`} value={brandPickValue(b.pick, draft)} disabled={disabled} className={SELECT}
                  onChange={(e) => set(k, { pick: e.target.value })}>
                  <option value="">Pick the business…</option>
                  {businesses.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                  {adding.map((n) => <option key={n} value={`new:${n}`}>{n}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {shown > 0 && actions}
    </Panel>
  );
}
```

3d. Create `src/app/(modules)/data-entry/file-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FileType } from "@/lib/ingest/file-types";
import type { FilePreview } from "@/server/ingest";
import { BusinessSelect, NewBrands, NewBusinesses, NewCategory, Panel } from "./file-controls";
import { brandWarning, greyReason, rowStatus, underFileBusiness, type BusinessOption, type BusinessPick, type RowDraft, type RowStatus } from "./logic";

const AMBER = "bg-amber-100 text-amber-900";
const CHIP: Record<RowStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-800" },
  "needs-type": { label: "Needs a type", className: AMBER },
  "needs-business": { label: "Needs a business", className: AMBER },
  "new-business": { label: "New business", className: AMBER },
  "new-category": { label: "New category", className: AMBER },
  blocked: { label: "Can't publish", className: "bg-red-100 text-red-800" },
};

/** A file while the server reads it. */
export function SkeletonBlock({ name }: { name: string }) {
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-300" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm text-gray-500">Reading {name}…</p>
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="h-9 animate-pulse rounded-lg bg-gray-100 md:ml-7" />
    </li>
  );
}

export type FileBlockProps = {
  name: string; cardType: FileType; fixedBusiness: boolean; preview: FilePreview | null; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean;
  onDraft: (d: RowDraft) => void; onTyping: (d: RowDraft) => void; onCommit: () => void; onRemove: (() => void) | null;
};

/**
 * One file in the Check before publishing dialog (spec 3.4): what was read, the warnings to check, the errors, and
 * the Part C questions. The card decides the type, so there is no type select. The business is asked only on the
 * Digital card for another business.
 */
export function FileBlock({ name, cardType, fixedBusiness, preview: p, draft, businesses, disabled, onDraft, onTyping, onCommit, onRemove }: FileBlockProps) {
  const [lastCategory, setLastCategory] = useState<RowDraft["atl"]>(null); // the picks before Change, to start the block from
  const [reviewing, setReviewing] = useState(false); // the Review and add panel is open
  const brandLine = p ? brandWarning(p) : null;
  const reviewButton = (
    <Button variant="outline" size="xs" disabled={disabled} className="ml-2 align-middle" onClick={() => setReviewing(true)}>Review and add</Button>
  );
  const status = p ? rowStatus(p) : null;
  const grey = p ? greyReason(p) : null;
  const askBusiness = cardType === "digital" && !fixedBusiness;
  const pick: BusinessPick = draft.business.value ? draft.business : { value: p?.business?.slug ?? "", newName: "" };
  const categoryAdded = cardType === "atl" && draft.atl && p && !p.newCategory;
  return (
    <li data-testid="preview-row" className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900" title={name}>{name}</p>
        {status && <Badge className={CHIP[status].className}>{CHIP[status].label}</Badge>}
        {onRemove && <Button variant="ghost" size="xs" disabled={disabled} aria-label={`Remove ${name}`} onClick={onRemove}>Remove</Button>}
      </div>
      {(askBusiness || p?.label) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4 md:pl-7">
          {askBusiness && (
            <BusinessSelect label={`Business for ${name}`} newLabel={`New business name for ${name}`} pick={pick} businesses={businesses}
              disabled={disabled}
              onPick={(b) => onDraft({ ...draft, business: b })}
              onTyping={(b) => onTyping({ ...draft, business: b })}
              onCommit={onCommit} />
          )}
          {p?.label && (
            <div className="min-w-0 text-sm">
              <p className="text-xs font-medium text-gray-500">What was read</p>
              <p className="text-gray-900">{p.label}</p>
              {p.summary && <p className="text-xs text-gray-500">{p.summary}</p>}
            </div>
          )}
        </div>
      )}
      {p && (p.errors.length > 0 || p.warnings.length > 0 || grey) && (
        <div className="space-y-1 text-sm md:pl-7">
          {p.errors.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-red-700">{p.errors.map((m, k) => <li key={k}>{m}</li>)}</ul>}
          {p.warnings.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-gray-500">Please check</p>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
                {p.warnings.map((m, k) => <li key={k}>{m}{m === brandLine && !reviewing && reviewButton}</li>)}
              </ul>
            </div>
          )}
          {grey && <p className="text-gray-500">{grey}</p>}
        </div>
      )}
      {brandLine && !reviewing && !p?.warnings.includes(brandLine) && <div className="md:pl-7">{reviewButton}</div>}
      {p && reviewing && (
        <NewBrands draft={draft} businesses={businesses} disabled={disabled}
          fileBusiness={underFileBusiness(draft) ? (p.business?.name ?? null) : null}
          onDone={(brands) => { setReviewing(false); onDraft({ ...draft, brands }); }} />
      )}
      {p && draft.bizNames.length > 0 && (
        <NewBusinesses preview={p} draft={draft} businesses={businesses} disabled={disabled} onDraft={onDraft} />
      )}
      {p?.newCategory && (
        <NewCategory key={p.newCategory.title} category={p.newCategory} businesses={businesses} disabled={disabled}
          start={lastCategory?.title === p.newCategory.title ? lastCategory : null}
          onAdd={(atl) => onDraft({ ...draft, atl })} />
      )}
      {categoryAdded && draft.atl && (
        <Panel>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="min-w-0 flex-1 text-gray-700">
              New category {draft.atl.title}, under {p.business?.name ?? draft.atl.business.newName}. Our brands: {draft.atl.ownBrands.join(", ")}.
            </p>
            <Button variant="outline" size="sm" disabled={disabled}
              onClick={() => { setLastCategory(draft.atl); onDraft({ ...draft, atl: null }); }}>Change</Button>
          </div>
        </Panel>
      )}
    </li>
  );
}
```

3e. Create `src/app/(modules)/data-entry/card-face.tsx`:

```tsx
import type { DragEventHandler, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CardState } from "./cards-state";

type Drop = {
  dragging?: boolean;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
};

/**
 * One Upload Data card (spec 3.2): the title, the file it expects, the pages it updates and what it shows now.
 * No hooks: the server page renders it as is for a viewer, and DataCard adds the admin's button and drop.
 */
export function CardFace({ state, dragging = false, onDragOver, onDragLeave, onDrop, children }: Drop & { state: CardState; children?: ReactNode }) {
  return (
    <Card data-testid="upload-card" data-card-id={state.id} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className={cn("min-w-0 transition-colors", dragging && "border-primary bg-accent")}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{state.title}</h2>
          <p className="text-gray-500">{state.card.fileText}</p>
        </div>
        <dl className="space-y-1">
          <div>
            <dt className="inline text-gray-500">{"Updates: "}</dt>
            <dd className="inline text-gray-900">{state.card.updates}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">{"Now showing: "}</dt>
            <dd className="inline text-gray-900 [overflow-wrap:anywhere]">{state.nowShowing}</dd>
          </div>
        </dl>
        {children && <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}
```

3f. Create `src/app/(modules)/data-entry/data-card.tsx` (the state handling is `UploadBox`'s, with the type fixed by the card):

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FilePreview } from "@/server/ingest";
import { CardFace } from "./card-face";
import { startDraft, type CardState } from "./cards-state";
import { FileBlock, SkeletonBlock } from "./file-block";
import { afterPreview, canPublishAll, postUploads, publishedMessage, toDecisions, uploadForm, type BusinessOption, type RowDraft } from "./logic";

/**
 * One Upload Data card for the admin: Upload Excel or a drop opens "Check before publishing", which previews the
 * files as this card's type, asks the Part C questions, and publishes. The server checks every file again.
 */
export function DataCard({ state, businesses }: { state: CardState; businesses: BusinessOption[] }) {
  const { card } = state;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0); // only the newest preview request may update the blocks
  const sent = useRef(""); // the decisions the blocks on screen were previewed with
  const nextId = useRef(0);
  const [ids, setIds] = useState<number[]>([]); // a stable React key per file, so a block's open panels follow it
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<RowDraft[]>([]);
  const [previews, setPreviews] = useState<FilePreview[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = checking || publishing;

  const decisionsOf = (ds: RowDraft[]) => ds.map((d) => toDecisions(d, businesses));
  /** Every file goes as this card's type: the card decides the type, and the server checks the file is one. */
  const typesOf = (list: File[]) => list.map(() => card.type);

  /** Previews every current file again, so batch rules (two files for one dataset) stay right. */
  async function check(nextFiles: File[], nextDrafts: RowDraft[], keepBlocks: boolean) {
    const id = ++latest.current;
    const decisions = decisionsOf(nextDrafts);
    sent.current = JSON.stringify(decisions);
    setFiles(nextFiles);
    setDrafts(nextDrafts);
    setError(null);
    if (!keepBlocks) setPreviews(null);
    if (nextFiles.length === 0) return setChecking(false);
    setChecking(true);
    const res = await postUploads<{ previews: FilePreview[] }>("/api/uploads/preview", uploadForm(nextFiles, typesOf(nextFiles), decisions));
    if (id !== latest.current) return;
    setChecking(false);
    if (res.error) {
      sent.current = ""; // nothing was previewed: the same decisions can be sent again
      setError(res.error);
      setPreviews(null);
      return;
    }
    const list = res.previews ?? [];
    setPreviews(list);
    // Names the server no longer asks about (decided) stay on screen so the admin can change them.
    setDrafts(nextDrafts.map((d, i) => (list[i] ? afterPreview(d, list[i]) : d)));
  }

  /** Keeps a file's draft; previews again when what would be sent changed. */
  function apply(next: RowDraft[]) {
    if (JSON.stringify(decisionsOf(next)) !== sent.current) void check(files, next, true);
    else setDrafts(next);
  }
  const setDraft = (i: number, d: RowDraft) => apply(drafts.map((x, j) => (j === i ? d : x)));
  const typeDraft = (i: number, d: RowDraft) => setDrafts(drafts.map((x, j) => (j === i ? d : x))); // typing: sent on blur

  function add(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    setLeftOut(chosen.filter((f) => f.size === 0).map((f) => f.name));
    const usable = chosen.filter((f) => f.size > 0); // the server refuses empty files
    const taken = card.multiple ? usable : usable.slice(0, 1); // only the ATL card takes several files
    if (taken.length === 0) return;
    setIds(taken.map(() => ++nextId.current));
    void check(taken, taken.map(() => startDraft(state)), false);
  }

  function clear() {
    latest.current++;
    sent.current = "";
    setIds([]);
    setFiles([]);
    setDrafts([]);
    setPreviews(null);
    setChecking(false);
    setError(null);
    setLeftOut([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    if (files.length === 1) return clear();
    const keep = (_: unknown, j: number) => j !== i;
    setIds(ids.filter(keep));
    void check(files.filter(keep), drafts.filter(keep), false);
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const res = await postUploads<{ published: { datasetKey: string; label: string; versionId: number }[] }>(
      "/api/uploads/publish", uploadForm(files, typesOf(files), decisionsOf(drafts)),
    );
    setPublishing(false);
    if (res.error) return setError(res.error);
    toast.success(publishedMessage(res.published ?? []));
    clear();
    router.refresh(); // the cards' Now showing lines
  }

  const blocksReady = previews !== null && previews.length === files.length;
  const canPublish = canPublishAll(previews, files.length) && !busy;

  return (
    <>
      <CardFace state={state} dragging={dragging}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) add(e.dataTransfer.files); }}>
        <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden />
          Upload Excel
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx" multiple={card.multiple} tabIndex={-1} className="sr-only"
          aria-label={`Choose Excel ${card.multiple ? "files" : "file"} for ${state.title}`}
          onChange={(e) => add(e.target.files)} />
        {leftOut.length > 0 && (
          <p className="w-full text-sm text-amber-800">{leftOut.join(", ")} {leftOut.length === 1 ? "is" : "are"} empty and left out.</p>
        )}
      </CardFace>
      <Dialog open={files.length > 0} onOpenChange={(open) => { if (!open && !publishing) clear(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle className="pr-8">Check before publishing · {state.title}</DialogTitle>
          </DialogHeader>
          {checking && <span role="status" className="sr-only">Reading the files…</span>}
          <ul className={cn("divide-y divide-gray-200 rounded-xl border border-gray-200", checking && blocksReady && "opacity-60")} aria-busy={checking}>
            {files.map((f, i) => {
              const p = blocksReady && previews ? previews[i] : null;
              const key = ids[i] ?? `f${i}`;
              if (checking && !p) return <SkeletonBlock key={key} name={f.name} />;
              return (
                <FileBlock key={key} name={f.name} cardType={card.type} fixedBusiness={state.business !== null} preview={p}
                  draft={drafts[i] ?? startDraft(state)} businesses={businesses} disabled={busy}
                  onDraft={(d) => setDraft(i, d)}
                  onTyping={(d) => typeDraft(i, d)}
                  onCommit={() => apply(drafts)}
                  onRemove={card.multiple ? () => remove(i) : null} />
              );
            })}
          </ul>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={clear} disabled={publishing}>Cancel</Button>
            <Button onClick={() => void publish()} disabled={!canPublish}>{publishing ? "Publishing…" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

3g. Replace `src/app/(modules)/data-entry/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";
import { getCatalog } from "@/store/catalog";
import { listActiveVersions, listHistory } from "@/store/datasets";
import { getStore } from "@/store/client";
import { CardFace } from "./card-face";
import { cardStates } from "./cards-state";
import { DataCard } from "./data-card";
import { HistoryTable } from "./history-table";

export const metadata: Metadata = { title: "Data Entry" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Tab = "upload" | "history";

const TABS: { key: Tab; label: string; href: string }[] = [
  { key: "upload", label: "Upload Data", href: "/data-entry" },
  { key: "history", label: "Upload History", href: "/data-entry?tab=history" },
];

const tabOf = (sp: Record<string, string | string[] | undefined>): Tab => (sp.tab === "history" ? "history" : "upload");

export default function DataEntryPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Data Entry" subtitle="Upload the Excel files in the same format you use today. Every upload is kept in Upload History.">
        <Suspense fallback={<SegmentedLinks label="Data Entry sections" items={TABS} value="" />}>
          <Tabs searchParams={searchParams} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<PageSkeleton label="Loading" />}>
        <DataEntryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Tabs({ searchParams }: { searchParams: Search }) {
  return <SegmentedLinks label="Data Entry sections" items={TABS} value={tabOf(await searchParams)} />;
}

async function DataEntryContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const tab = tabOf(await searchParams);
  const admin = await isAdmin(); // one cookie read; passed down as a prop
  const store = await getStore();

  if (tab === "history") {
    return <HistoryTable rows={await listHistory(store, { limit: 200 })} admin={admin} />;
  }
  const catalog = await getCatalog(store);
  const cards = cardStates(await listActiveVersions(store), catalog.businesses);
  // The visible businesses for the pickers; the server checks every pick again.
  const businesses = catalog.businesses.filter((b) => !b.hidden).map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="space-y-4">
      {!admin && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <Lock className="size-4 shrink-0 text-gray-500" aria-hidden />
          <span>Only the admin can upload. Sign in to upload.</span>
          <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2">Sign in</Link>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (admin ? <DataCard key={c.id} state={c} businesses={businesses} /> : <CardFace key={c.id} state={c} />))}
      </div>
    </div>
  );
}
```

3h. Delete the old drop box:

```bash
git rm "src/app/(modules)/data-entry/upload-box.tsx"
```

- [ ] **Step 4: Run them**

Run: `npx vitest run "src/app/(modules)/data-entry" src/lib/ingest src/server` then `npx tsc --noEmit` then `npx eslint "src/app/(modules)/data-entry"`
Expected: PASS, no type errors, no lint errors. (The old Playwright upload specs now fail because `upload-drop` is gone; Task 6 rewrites them.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(modules)/data-entry/file-controls.tsx" "src/app/(modules)/data-entry/file-block.tsx" "src/app/(modules)/data-entry/file-block.test.ts" "src/app/(modules)/data-entry/card-face.tsx" "src/app/(modules)/data-entry/card-face.test.ts" "src/app/(modules)/data-entry/data-card.tsx" "src/app/(modules)/data-entry/page.tsx" "src/app/(modules)/data-entry/cards-state.ts" "src/app/(modules)/data-entry/cards-state.test.ts" "src/app/(modules)/data-entry/logic.ts" "src/app/(modules)/data-entry/logic.test.ts"
git commit -F - <<'EOF'
feat(data-entry): one card per file with a Check before publishing dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

(`git rm` in 3h already staged the deletion of `upload-box.tsx`.)

---

### Task 5: Sidebar without Uploads & History

**Files:**
- Modify: `src/components/shell/nav-items.ts`, `src/components/shell/sidebar.tsx`
- Test: `src/components/shell/nav-items.test.ts`, `src/app/(modules)/data-entry/logic.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NAV_ITEMS` without `/uploads`. The Data group is Data Entry, Businesses & Brands, Settings. The `/uploads` route and page stay.

- [ ] **Step 1: Write the failing tests.**

In `src/components/shell/nav-items.test.ts`, replace the first test with:

```ts
  it("puts Businesses & Brands in the Data group right after Data Entry", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/businesses");
    expect(NAV_ITEMS[i]).toEqual({ href: "/businesses", label: "Businesses & Brands", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/data-entry") + 1);
  });

  it("has no Uploads & History item: Upload History lives in Data Entry", () => {
    expect(NAV_ITEMS.map((n) => n.href)).not.toContain("/uploads");
    expect(NAV_ITEMS.filter((n) => n.group === "Data").map((n) => n.label)).toEqual(["Data Entry", "Businesses & Brands", "Settings"]);
  });
```

In `src/app/(modules)/data-entry/logic.test.ts`, replace `describe("menu", …)` with:

```ts
describe("menu", () => {
  it("puts Data Entry first in the Data group, before Businesses & Brands", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/data-entry");
    expect(NAV_ITEMS[i]).toEqual({ href: "/data-entry", label: "Data Entry", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/businesses") - 1);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/components/shell/nav-items.test.ts "src/app/(modules)/data-entry/logic.test.ts"`
Expected: FAIL (`/uploads` is still between Data Entry and Businesses & Brands).

- [ ] **Step 3: Implement.**

In `src/components/shell/nav-items.ts`, delete the line:

```ts
  { href: "/uploads", label: "Uploads & History", group: "Data" },
```

In `src/components/shell/sidebar.tsx`, delete the line `  "/uploads": History,` from `ICONS`, and change the lucide import to:

```ts
import {
  Building2, CalendarRange, ChartColumn, FileUp, House, MonitorSmartphone, ReceiptText, Settings, Target, Wallet, type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/components/shell "src/app/(modules)/data-entry"` then `npx tsc --noEmit` then `npx eslint src/components/shell "src/app/(modules)/data-entry/logic.test.ts"`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/nav-items.ts src/components/shell/nav-items.test.ts src/components/shell/sidebar.tsx "src/app/(modules)/data-entry/logic.test.ts"
git commit -F - <<'EOF'
fix(shell): drop Uploads & History from the sidebar

Upload History now lives in Data Entry. The /uploads page stays for the old pages' upload panels.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The Phase 2 flows through the cards (Playwright)

**Files:**
- Modify: `e2e/helpers.ts`, `e2e/phase2a-upload.spec.ts`, `e2e/phase2b-upload.spec.ts`, `e2e/phase2c-names.spec.ts`
- Unchanged, checked: `playwright.config.ts` (fresh-store still matches `phase2c-*`, chromium still depends on it)

**Interfaces:**
- Consumes: `data-testid="upload-card"` + `data-card-id` (Task 4), `data-testid="preview-row"` (Task 4), the dialog title "Check before publishing · <title>", the Publish / Cancel buttons, `UPLOAD_CARDS`, `wrongCardMessage`, `notThisFileMessage`, `OOH_MASTER_MESSAGE` (Task 1).
- Produces (`e2e/helpers.ts`):
```ts
export const openUpload: (page: Page) => Promise<void>;                              // /data-entry, waits for the cards
export const card: (page: Page, id: string) => Locator;                              // [data-testid=upload-card][data-card-id=<id>]
export const checkDialog: (page: Page) => Locator;                                   // the Check before publishing dialog
export const uploadToCard: (page: Page, id: string, files: Upload[]) => Promise<Locator>; // opens, chooses, waits for every block
export const publishBtn: (page: Page) => Locator;                                    // the dialog's Publish button
// kept: XLSX_TYPE, Upload, fileOf, sheetFile, escapeRegExp, historyRows, ready, settled, pickBusiness
// removed: addFiles (the drop box is gone)
```

- [ ] **Step 1: Run the old specs to see them fail**

Run: `npx playwright test e2e/phase2c-names.spec.ts e2e/phase2a-upload.spec.ts e2e/phase2b-upload.spec.ts`
Expected: FAIL. `openUpload` waits for `data-testid="upload-drop"`, which Task 4 removed.

- [ ] **Step 2: Write the new helpers and specs.**

Replace `e2e/helpers.ts` with:

```ts
import { expect, type Locator, type Page } from "@playwright/test";
import { clientFile, makeXlsx } from "../src/lib/ingest/test-workbooks";

// Shared steps for the Data Entry upload specs (phase2a, phase2b, phase2c): one card per file, then the
// Check before publishing dialog.

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type Upload = { name: string; mimeType: string; buffer: Buffer };

/** A client file from Asset/xlsx, optionally under another name. */
export const fileOf = (rel: string, name = rel.split("/").pop()!): Upload => ({ name, mimeType: XLSX_TYPE, buffer: clientFile(rel) });
/** A one-sheet workbook built in memory. */
export const sheetFile = (name: string, rows: unknown[][], sheetName = "S"): Upload => ({ name, mimeType: XLSX_TYPE, buffer: makeXlsx([{ name: sheetName, rows }]) });

/** Text for use inside a RegExp, matched literally. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Opens Upload Data and waits for its cards. */
export const openUpload = async (page: Page) => {
  await page.goto("/data-entry");
  await expect(page.getByTestId("upload-card").first()).toBeVisible();
};
/**
 * One Upload Data card by its id: "atl", "digital" (the card for a business with no Digital data yet),
 * "digital:<business slug>", "fy", "channel", "billing", "calendar" or "billboard".
 */
export const card = (page: Page, id: string) => page.locator(`[data-testid="upload-card"][data-card-id="${id}"]`);
/** The Check before publishing dialog. */
export const checkDialog = (page: Page) => page.getByRole("dialog");
/** Opens Upload Data, chooses the files on one card, and returns the dialog once every file has been read. */
export const uploadToCard = async (page: Page, id: string, files: Upload[]) => {
  await openUpload(page);
  await card(page, id).locator("input[type=file]").setInputFiles(files);
  const dialog = checkDialog(page);
  await expect(dialog.getByTestId("preview-row")).toHaveCount(files.length);
  return dialog;
};
export const publishBtn = (page: Page) => checkDialog(page).getByRole("button", { name: "Publish", exact: true });
export const historyRows = async (page: Page) => {
  await page.goto("/data-entry?tab=history");
  return page.getByTestId("history-table").locator("tbody tr");
};

/** A file block's Ready chip. */
export const ready = (row: Locator) => row.getByText("Ready", { exact: true });
/** Waits until no preview request is running, so the block controls are enabled again. */
export const settled = (page: Page) => expect(page.locator("ul[aria-busy=true]")).toHaveCount(0);

/**
 * Picks `name` in a Business select when it is on the list, else "New business…" with the name typed in its box
 * and Enter (which sends it on a Digital file, and does nothing in the New category block).
 */
export const pickBusiness = async (page: Page, selectLabel: string, boxLabel: string, name: string) => {
  const select = page.getByLabel(selectLabel, { exact: true });
  if (await select.locator("option", { hasText: new RegExp(`^${escapeRegExp(name)}$`) }).count()) {
    await select.selectOption({ label: name });
    return;
  }
  await select.selectOption({ label: "New business…" });
  const box = page.getByLabel(boxLabel, { exact: true });
  await box.fill(name);
  await box.press("Enter");
};
```

Replace `e2e/phase2c-names.spec.ts` with:

```ts
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { hasClientFiles } from "../src/lib/ingest/test-workbooks";
import { card, checkDialog, fileOf, pickBusiness, publishBtn, ready, settled, sheetFile, uploadToCard, type Upload } from "./helpers";

// Phase 2 Part C user flow, through the Upload Data cards (Part D): the business, brand and ATL category lists start
// empty and uploads ask about new names. Runs first, as the "fresh-store" project (playwright.config.ts), so the
// shared temp store is still empty. Serial: later paths build on the businesses earlier ones add.
test.describe.configure({ mode: "serial" });

const BILLING = "Dashboard_Media_Final_Fixed_26th_October_2026.xlsx";
const BILLING_LABEL = "Billing master, 2,956 lines";
const BILLING_NAMES = ["Toiletries", "Hygiene", "Foods", "Salt", "Commodity", "Electrical", "Rice", "IB", "SCJ", "CB", "ACI Salt", "CB Core", "Beverage"];
const EMPTY_LIST = "No businesses yet. Add one here, or upload a file and add the businesses it contains.";
const HIDDEN_LINE = "This business is hidden. Show it to add brands.";

/** An Activity Calendar for Dec'26 with a Grand Total row: one line per [business, brand]. */
const calendar = (name: string, lines: [string, string][]) => sheetFile(name, [
  ["CB Media Activity Dec'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ...lines.map(([biz, brand]) => [biz, brand, 1, 0.5, 0, 0, 1.5]),
  ["Grand Total", null, lines.length, lines.length / 2, 0, 0, lines.length * 1.5],
], "Dec'26");

/** An ATL dashboard titled "Lux Soap", a category no other spec uses. */
const luxSoap = (): Upload => {
  const jul = new Date(Date.UTC(2026, 6, 1));
  return sheetFile("lux-soap.xlsx", [["Brand Name: Lux Soap"], ["Brand Name", jul], [null, "GRP", "Spend"], ["Lux", 10, 1000], ["Dove", 30, 3000]], "GRP");
};

const newBusinessChip = (row: Locator) => row.getByText("New business", { exact: true });
const brandWarning = (row: Locator) => row.getByText(/\d+ brands? not on your list\./);

/** Opens /businesses and returns the business names it lists (none when it shows the empty state). */
const listedBusinesses = async (page: Page) => {
  await page.goto("/businesses");
  const table = page.getByTestId("businesses-table");
  await expect(table.or(page.getByText(EMPTY_LIST))).toBeVisible();
  if (!(await table.isVisible())) return [];
  return (await table.locator("tbody tr td:first-child a").allTextContents()).map((s) => s.trim());
};
const businessRow = (page: Page, name: string) =>
  page.getByTestId("businesses-table").locator("tbody tr").filter({ has: page.getByRole("link", { name, exact: true }) });

const decision = (row: Locator, name: string) => row.getByLabel(`Decision for ${name}`, { exact: true });

/** The names a file's New business block asks about, from its "Decision for <name>" selects. */
const askedNames = async (row: Locator) => {
  const labels = await row.getByLabel(/^Decision for /).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.map((l) => l.replace(/^Decision for /, ""));
};

test("1. empty list: /businesses shows the empty state", async ({ page }) => {
  expect(await listedBusinesses(page)).toEqual([]);
  await expect(page.getByRole("heading", { name: "Businesses & Brands" })).toBeVisible();
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add business" })).toBeVisible();
});

test("2. real Billing file on its card: decide 13 new businesses with Add all as new, ACI Salt same as Salt, publish", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  expect(await listedBusinesses(page)).toEqual([]); // path 1's empty start

  const dialog = await uploadToCard(page, "billing", [fileOf(BILLING)]);
  await expect(dialog).toContainText("Check before publishing · Media billing");
  const row = dialog.getByTestId("preview-row");
  await expect(newBusinessChip(row)).toBeVisible();
  await expect(row.getByText("New businesses in this file")).toBeVisible();
  expect((await askedNames(row)).sort()).toEqual([...BILLING_NAMES].sort());
  await expect(publishBtn(page)).toBeDisabled();

  await row.getByRole("button", { name: "Add all as new" }).click();
  await expect(ready(row)).toBeVisible();
  await settled(page);
  for (const n of BILLING_NAMES) await expect(decision(row, n), n).toHaveValue("add");

  // ACI Salt is the same business as Salt, which this file adds.
  await decision(row, "ACI Salt").selectOption({ label: "Same as Salt" });
  await expect(decision(row, "ACI Salt")).toHaveValue("same:new:Salt");
  await settled(page);
  await expect(decision(row, "Salt")).toHaveValue("add"); // Salt itself stays new
  await expect(ready(row)).toBeVisible();
  await expect(brandWarning(row)).toBeVisible(); // brands are never pre-ticked: they stay flagged
  await expect(row.getByRole("button", { name: "Review and add" })).toBeVisible();
  await expect(publishBtn(page)).toBeEnabled();
  await publishBtn(page).click();
  await expect(page.getByText(`Published 1 file: ${BILLING_LABEL}`)).toBeVisible();
  await expect(checkDialog(page)).toHaveCount(0);
  await expect(card(page, "billing")).toContainText(`Now showing: ${BILLING} · `);

  const after = await listedBusinesses(page);
  expect([...after].sort()).toEqual(BILLING_NAMES.filter((x) => x !== "ACI Salt").sort()); // 12 businesses, no ACI Salt
  await page.getByRole("link", { name: "Salt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Salt", exact: true })).toBeVisible();
  await expect(page.getByText("Also matches: ACI Salt")).toBeVisible();
});

test("3. a new ATL category: Lux Soap under Toiletries with our brand Lux, published, the ATL card's Now showing updates", async ({ page }) => {
  const dialog = await uploadToCard(page, "atl", [luxSoap()]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText("New category", { exact: true })).toBeVisible();
  await expect(row.getByText("New category found: Lux Soap")).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  const add = row.getByRole("button", { name: "Add category" });
  await expect(add).toBeDisabled();
  await expect(row.getByLabel("Our brand Lux")).not.toBeChecked(); // never pre-ticked without a suggestion
  await expect(row.getByLabel("Our brand Dove")).not.toBeChecked();

  await pickBusiness(page, "Business for category Lux Soap", "New business name for Lux Soap", "Toiletries");
  await row.getByLabel("Our brand Lux").check();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText("New category Lux Soap, under Toiletries. Our brands: Lux.")).toBeVisible();
  await settled(page);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: ATL, Lux Soap/)).toBeVisible();
  // The first ATL category in the fresh store.
  await expect(card(page, "atl")).toContainText(/Now showing: 1 category · last upload lux-soap\.xlsx · \d{1,2} \w+ \d{4}, \d{2}:\d{2}/);

  await listedBusinesses(page);
  await page.getByRole("link", { name: "Toiletries", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Toiletries", exact: true })).toBeVisible();
  const atl = page.getByTestId("atl-table").locator("tbody tr").filter({ hasText: "Lux Soap" });
  await expect(atl).toHaveCount(1);
  await expect(atl.locator("td").nth(0)).toHaveText("Lux Soap");
  await expect(atl.locator("td").nth(1)).toHaveText("Lux"); // the Our brands column: Lux only, Dove left out
});

test("4. Review and add: Savlon HW is added as Savlon Handwash, and the same file then asks nothing", async ({ page }) => {
  const BIZ = "E2E Toiletries Four";
  const file = calendar("cal-review.xlsx", [[BIZ, "Savlon HW"]]);
  const dialog = await uploadToCard(page, "calendar", [file]);
  const row = dialog.getByTestId("preview-row");
  await expect(newBusinessChip(row)).toBeVisible();
  await expect(row.getByText("New businesses in this file")).toBeVisible();
  await expect(row.getByRole("button", { name: "Add all as new" })).toHaveCount(0); // one name only
  await decision(row, BIZ).selectOption({ label: "Add as new" });
  await expect(ready(row)).toBeVisible();
  await settled(page);

  await expect(row.getByText("1 brand not on your list.")).toBeVisible();
  await row.getByRole("button", { name: "Review and add" }).click();
  await expect(row.getByLabel("Full name for Savlon HW")).toHaveValue("Savlon Handwash");
  await expect(row.getByLabel("Add Savlon HW")).not.toBeChecked(); // never pre-ticked
  await row.getByLabel("Add Savlon HW").check();
  await row.getByRole("button", { name: "Done" }).first().click();
  await expect(brandWarning(row)).toHaveCount(0);
  await settled(page);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file/)).toBeVisible();

  await listedBusinesses(page);
  await page.getByRole("link", { name: BIZ, exact: true }).click();
  await expect(page.getByRole("heading", { name: BIZ, exact: true })).toBeVisible();
  const brand = page.getByTestId("brands-table").locator("tbody tr").filter({ hasText: "Savlon Handwash" });
  await expect(brand).toHaveCount(1);
  await expect(brand.locator("td").nth(1)).toHaveText("Savlon HW"); // the Also matches column

  // The same file again: the business and the brand are both on the list now.
  await uploadToCard(page, "calendar", [file]);
  await expect(ready(row)).toBeVisible();
  await expect(brandWarning(row)).toHaveCount(0);
  await expect(row.getByText("New businesses in this file")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Review and add" })).toHaveCount(0);
});

test("5. Cancel after deciding a new business changes nothing on the list", async ({ page }) => {
  const BIZ = "E2E Cancel Co";
  const before = await listedBusinesses(page);
  const file = calendar("cal-cancel.xlsx", [[BIZ, "E2E Cancel Brand"]]);
  const dialog = await uploadToCard(page, "calendar", [file]);
  const row = dialog.getByTestId("preview-row");
  await expect(newBusinessChip(row)).toBeVisible();
  await decision(row, BIZ).selectOption({ label: "Add as new" });
  await expect(ready(row)).toBeVisible();
  await settled(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(checkDialog(page)).toHaveCount(0);

  expect(await listedBusinesses(page)).toEqual(before);
  // The decision was dropped too: the same file asks again.
  await uploadToCard(page, "calendar", [file]);
  await expect(newBusinessChip(row)).toBeVisible();
  await expect(decision(row, BIZ)).toHaveValue("");
});

const HIDDEN_BIZ = "E2E Hidden Co";

test("admin adds a business, hides it, and its page says it is hidden instead of offering Add brand", async ({ page }) => {
  await listedBusinesses(page);
  await page.getByRole("button", { name: "Add business" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business name").fill(HIDDEN_BIZ);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(businessRow(page, HIDDEN_BIZ)).toHaveCount(1);

  // A new business: empty lists, and Add brand.
  await page.getByRole("link", { name: HIDDEN_BIZ, exact: true }).click();
  await expect(page.getByRole("heading", { name: HIDDEN_BIZ, exact: true })).toBeVisible();
  await expect(page.getByText("No brands yet.")).toBeVisible();
  await expect(page.getByText("No ATL categories yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add brand" })).toBeVisible();

  // Hide it from the list.
  await listedBusinesses(page);
  await page.getByRole("button", { name: `Hide ${HIDDEN_BIZ}` }).click();
  await expect(page.getByRole("button", { name: `Show ${HIDDEN_BIZ}` })).toBeVisible();
  await expect(businessRow(page, HIDDEN_BIZ).getByText("Hidden", { exact: true })).toBeVisible();

  // Its page: the hidden line and Show, no Add brand.
  await page.getByRole("link", { name: HIDDEN_BIZ, exact: true }).click();
  await expect(page.getByText(HIDDEN_LINE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add brand" })).toHaveCount(0);
  // Show from the page brings Add brand back; hide it again for the viewer check.
  await page.getByRole("button", { name: `Show ${HIDDEN_BIZ}` }).click();
  await expect(page.getByRole("button", { name: "Add brand" })).toBeVisible();
  await expect(page.getByText(HIDDEN_LINE)).toHaveCount(0);
  await listedBusinesses(page);
  await page.getByRole("button", { name: `Hide ${HIDDEN_BIZ}` }).click();
  await expect(page.getByRole("button", { name: `Show ${HIDDEN_BIZ}` })).toBeVisible();
});

// The viewer checks need a business on the list whatever ran before: publish one through the API as the admin.
const VIEWER_BIZ = "E2E Viewer Co";
const seedBusiness = async (browser: Browser) => {
  const ctx = await browser.newContext({ storageState: "e2e/.auth/admin.json", baseURL: "http://localhost:3100" });
  const f = calendar("seed-names.xlsx", [[VIEWER_BIZ, "E2E Viewer Brand"]]);
  const decisions = JSON.stringify({ businesses: [{ name: VIEWER_BIZ, action: "new" }], brands: [] });
  const res = await ctx.request.post("/api/uploads/publish", {
    headers: { Origin: "http://localhost:3100" },
    multipart: { files: { name: f.name, mimeType: f.mimeType, buffer: f.buffer }, "decisions-0": decisions },
  });
  expect(res.status()).toBe(200);
  await ctx.close();
};

const ADMIN_CONTROLS = /^(Add business|Add brand|Rename|Hide|Show|Change)\b/;

test.describe("6. viewer", () => {
  test.beforeAll(async ({ browser }) => seedBusiness(browser));
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees /businesses and a business page with no buttons or dialogs", async ({ page }) => {
    await listedBusinesses(page);
    await expect(businessRow(page, VIEWER_BIZ)).toHaveCount(1);
    await expect(page.getByRole("button", { name: ADMIN_CONTROLS })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("link", { name: VIEWER_BIZ, exact: true }).click();
    await expect(page.getByRole("heading", { name: VIEWER_BIZ, exact: true })).toBeVisible();
    await expect(page.getByText("No brands yet.")).toBeVisible();
    // A page with a slug still marks where you are after a full load (the shell reads the path inside Suspense).
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Businesses & Brands" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Businesses & Brands");
    await expect(page.getByRole("button", { name: ADMIN_CONTROLS })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a hidden business's page shows the Hidden tag but no admin line or Show", async ({ page }) => {
    expect(await listedBusinesses(page)).toContain(HIDDEN_BIZ); // hidden by the admin test above
    await page.getByRole("link", { name: HIDDEN_BIZ, exact: true }).click();
    await expect(page.getByRole("heading", { name: HIDDEN_BIZ, exact: true })).toBeVisible();
    // cacheComponents keeps the list page in the DOM, hidden, after a client navigation: look at what shows.
    await expect(page.getByText("Hidden", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(HIDDEN_LINE)).toHaveCount(0);
    await expect(page.getByRole("button", { name: ADMIN_CONTROLS })).toHaveCount(0);
  });
});

test.describe("7. phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  const noSideScroll = async (page: Page) => {
    await page.waitForLoadState("networkidle");
    return page.evaluate(() => document.documentElement.scrollWidth);
  };

  test("the New business block fits with no side scroll", async ({ page }) => {
    const names: [string, string][] = [["E2E Phone Business", "E2E Phone Brand"], ["E2E Phone Business With A Rather Long Name For A Small Screen", "E2E Phone Brand Two"]];
    const dialog = await uploadToCard(page, "calendar", [calendar("cal-phone-with-a-long-file-name.xlsx", names)]);
    const row = dialog.getByTestId("preview-row");
    await expect(row.getByText("New businesses in this file")).toBeVisible();
    await expect(row.getByRole("button", { name: "Add all as new" })).toBeVisible();
    expect(await noSideScroll(page)).toBeLessThanOrEqual(375);
    for (const [n] of names) {
      const box = (await decision(row, n).boundingBox())!;
      expect(box.x + box.width, n).toBeLessThanOrEqual(375);
    }
    await row.getByRole("button", { name: "Add all as new" }).click();
    await expect(ready(row)).toBeVisible();
    expect(await noSideScroll(page)).toBeLessThanOrEqual(375);
  });

  test("/businesses and a business page fit with no side scroll", async ({ page }) => {
    const names = await listedBusinesses(page);
    expect(names.length).toBeGreaterThan(0); // the paths above added businesses
    expect(await noSideScroll(page)).toBeLessThanOrEqual(375);
    await page.getByRole("link", { name: names[0], exact: true }).click();
    await expect(page.getByRole("heading", { name: names[0], exact: true })).toBeVisible();
    expect(await noSideScroll(page)).toBeLessThanOrEqual(375);
  });
});
```

Replace `e2e/phase2a-upload.spec.ts` with:

```ts
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { clientFile, hasClientFiles, makeXlsx } from "../src/lib/ingest/test-workbooks";
import { UPLOAD_CARDS, notThisFileMessage, wrongCardMessage, type CardKey } from "../src/lib/ingest/cards";
import { XLSX_TYPE, card, checkDialog, fileOf, historyRows, openUpload, publishBtn, ready, sheetFile, uploadToCard } from "./helpers";

// Phase 2 Part A user flow, every path, through the Upload Data cards (Part D). Serial: paths 7 to 9 build on each other.
test.describe.configure({ mode: "serial" });

const SAVLON = "atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx";
const SEPTEX = "atl/2._2026_Dash_Board_-_Septex_-_Oct26.xlsx";
// The category is named from the file's own "Brand Name:" title now that lists start empty.
const SAVLON_LABEL = "ATL, ACI Savlon Soap, Jul'25 to Oct'26";
const VIEWER_NOTE = "Only the admin can upload. Sign in to upload.";

const cardOf = (key: CardKey) => UPLOAD_CARDS.find((c) => c.key === key)!;
/** An Activity Calendar for Nov'26 that detection is sure of (month sheet, Grand Total row), with one line for `business`. */
const calendarFile = (name: string, business: string) => sheetFile(name, [
  ["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  [business, "Savlon Soap", 1, 0.5, 0, 0, 1.5], ["Grand Total", null, 1, 0.5, 0, 0, 1.5],
], "Nov'26");

/**
 * Lists start empty, and the specs share one store: an ATL file whose category is not on the list yet asks for it.
 * Add it with the suggested business and brands, so this spec works whether or not the category exists.
 */
const addCategoryIfAsked = async (row: Locator) => {
  const ask = row.getByText(/^New category found: /);
  await expect(ready(row).or(ask).first()).toBeVisible();
  if (await ask.isVisible()) await row.getByRole("button", { name: "Add category" }).click();
  await expect(ready(row)).toBeVisible();
};

test("1. a read error blocks publishing", async ({ page }) => {
  // The "Brand Name:" line is there, but no "Brand Name" / "Brand" header row: unsure, read as ATL, a read error.
  const f = sheetFile("noheader.xlsx", [["Brand Name: E2E No Header"], ["Category: Soap"], ["Brands", "Jul'26"], ["Lux", 1]], "GRP");
  const dialog = await uploadToCard(page, "atl", [f]);
  await expect(dialog).toContainText("Check before publishing · ATL (TV) performance");
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(row.getByText(`The header row with "Brand Name" or "Brand" wasn't found.`)).toBeVisible();
  await expect(row.getByText(/New category/)).toHaveCount(0);
  await expect(publishBtn(page)).toBeDisabled();
});

test("2. a plain workbook is refused, saying what the card expects", async ({ page }) => {
  const dialog = await uploadToCard(page, "calendar", [sheetFile("plain.xlsx", [["a"]])]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText(notThisFileMessage(cardOf("calendar")))).toBeVisible();
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
});

test("3. a file on the wrong card is blocked, naming the card to use", async ({ page }) => {
  const dialog = await uploadToCard(page, "channel", [calendarFile("cal-wrong-card.xlsx", "E2E Wrong Card Co")]);
  await expect(dialog).toContainText("Check before publishing · Channel cost");
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText(wrongCardMessage(cardOf("channel"), "calendar"))).toBeVisible();
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(row.getByText("New businesses in this file")).toHaveCount(0); // blocked before any question
  await expect(publishBtn(page)).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(checkDialog(page)).toHaveCount(0);
});

test("4. an unsure file on its card is read as that type: Ready with a warning", async ({ page }) => {
  // A business name only this test uses, so it is new whatever other specs added. No Grand Total row: unsure.
  const rows = [["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["E2E Care 2a", "Savlon Soap", 1, 0.5, 0, 0, 1.5]];
  const dialog = await uploadToCard(page, "calendar", [sheetFile("cal.xlsx", rows, "Nov'26")]);
  const row = dialog.getByTestId("preview-row");
  // The list starts empty: the file's business is new, and must be decided first.
  await expect(row.getByText("New business", { exact: true })).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  await page.getByLabel("Decision for E2E Care 2a").selectOption({ label: "Add as new" });
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(`Sheet "Nov'26" has no Grand Total row; read to the last row.`)).toBeVisible();
  await expect(publishBtn(page)).toBeEnabled();
});

test("5. real Savlon Soap file previews with its label (16 months from Jul'25)", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const dialog = await uploadToCard(page, "atl", [fileOf(SAVLON)]);
  const row = dialog.getByTestId("preview-row");
  await addCategoryIfAsked(row);
  await expect(row.getByText(SAVLON_LABEL)).toBeVisible();
  await expect(publishBtn(page)).toBeEnabled();
});

let rowsBefore = 0;
test("6. Cancel changes nothing in Upload History", async ({ page }) => {
  rowsBefore = await (await historyRows(page)).count();
  const dialog = await uploadToCard(page, "calendar", [calendarFile("cal.xlsx", "T")]);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(checkDialog(page)).toHaveCount(0);
  expect(await (await historyRows(page)).count()).toBe(rowsBefore);
});

test("7. publish two ATL files on the ATL card: toast, Now showing, two In use rows", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const dialog = await uploadToCard(page, "atl", [fileOf(SAVLON), fileOf(SEPTEX)]);
  for (const f of [SAVLON, SEPTEX]) await addCategoryIfAsked(dialog.getByTestId("preview-row").filter({ hasText: fileOf(f).name }));
  await expect(ready(dialog.getByTestId("preview-row"))).toHaveCount(2);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 2 files/)).toBeVisible();
  await expect(checkDialog(page)).toHaveCount(0);
  await expect(card(page, "atl")).toContainText(/Now showing: \d+ categories · last upload \d+\._2026_Dash_Board_-_\w+_-_Oct26\.xlsx · /);
  const rows = await historyRows(page);
  await expect(rows.filter({ hasText: SAVLON_LABEL }).filter({ hasText: "In use" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Septex" }).filter({ hasText: "In use" })).toHaveCount(1);
});

test("8. republish the same file with a warning, then restore the older one", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const confirms: string[] = [];
  page.on("dialog", (d) => {
    confirms.push(d.message());
    void d.accept();
  });
  const dialog = await uploadToCard(page, "atl", [fileOf(SAVLON)]);
  await expect(dialog.getByTestId("preview-row").getByText("This is the same file as the one in use.")).toBeVisible();
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file/)).toBeVisible();

  const rows = await historyRows(page);
  const savlon = () => rows.filter({ hasText: SAVLON_LABEL });
  await expect(savlon()).toHaveCount(2);
  await expect(savlon().first()).toContainText("In use"); // newest first
  await expect(savlon().first().getByRole("button", { name: /Restore/ })).toHaveCount(0);
  const older = savlon().nth(1);
  await expect(older).not.toContainText("In use");
  await older.getByRole("button", { name: /Restore/ }).click();
  await expect.poll(() => confirms.length).toBe(1);
  expect(confirms[0]).toMatch(/^Use this upload for /);
  expect(confirms[0]).toContain("Only that dataset changes.");
  await expect(page.getByText(/^Restored\. /)).toBeVisible();
  // The badge moves on the same page, without a reload.
  await expect(savlon().first()).not.toContainText("In use");
  await expect(savlon().nth(1)).toContainText("In use");
});

test("9. admin can download the original file", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const rows = await historyRows(page);
  const href = await rows.filter({ hasText: SAVLON_LABEL }).first().getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/uploads\/\d+/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const body = await res.body();
  expect(body.equals(clientFile(SAVLON))).toBe(true);
});

// The viewer checks must not depend on client files: make sure History has a row first.
const seedHistory = async (browser: Browser) => {
  const ctx = await browser.newContext({ storageState: "e2e/.auth/admin.json", baseURL: "http://localhost:3100" });
  const rows = [["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ["Grand Total", null, 1, 0.5, 0, 0, 1.5]];
  // Lists start empty: decide the file's business as new (ignored when it is already on the list).
  const decisions = JSON.stringify({ businesses: [{ name: "Toiletries", action: "new" }], brands: [] });
  const res = await ctx.request.post("/api/uploads/publish", {
    headers: { Origin: "http://localhost:3100" },
    multipart: { files: { name: "seed-cal.xlsx", mimeType: XLSX_TYPE, buffer: makeXlsx([{ name: "Nov'26", rows }]) }, "decisions-0": decisions },
  });
  expect(res.status()).toBe(200);
  await ctx.close();
};

test.describe("10. viewer", () => {
  test.beforeAll(async ({ browser }) => seedHistory(browser));
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees History without Restore or Download", async ({ page }) => {
    await page.goto("/data-entry?tab=history");
    await expect(page.getByTestId("history-table")).toBeVisible();
    await expect(page.getByTestId("history-table").locator("tbody tr").first()).toBeVisible();
    expect(await page.getByTestId("history-table").locator("tbody tr").count()).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
  });

  test("sees the cards without buttons, and a note to sign in", async ({ page }) => {
    await page.goto("/data-entry");
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const cards = page.getByTestId("upload-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(UPLOAD_CARDS.length);
    await expect(card(page, "atl")).toContainText("ATL (TV) performance");
    await expect(card(page, "calendar")).toContainText(/Now showing: .+\.xlsx · /); // the seeded calendar
    await expect(page.getByRole("button", { name: /Upload Excel/ })).toHaveCount(0);
    await expect(page.locator("input[type=file]")).toHaveCount(0);
  });

  test("the server refuses the viewer", async ({ request }) => {
    expect((await request.get("/api/uploads/1")).status()).toBe(403);
    const res = await request.post("/api/uploads/publish", {
      headers: { Origin: "http://localhost:3100" },
      multipart: { files: { name: "x.xlsx", mimeType: XLSX_TYPE, buffer: makeXlsx([{ name: "S", rows: [["a"]] }]) } },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  const noSideScroll = async (page: Page) => {
    await page.waitForLoadState("networkidle");
    return page.evaluate(() => document.documentElement.scrollWidth <= 375);
  };
  /** The box ends inside the screen and does not scroll sideways itself. */
  const fits = (l: Locator) => l.evaluate((el) => el.getBoundingClientRect().right <= 375 && el.scrollWidth <= el.clientWidth + 1);

  test("the cards sit in one column, and the check dialog fits the screen", async ({ page }) => {
    await openUpload(page);
    expect(await noSideScroll(page)).toBe(true);
    for (const c of await page.getByTestId("upload-card").all()) expect(await fits(c)).toBe(true);
    const atl = (await card(page, "atl").boundingBox())!;
    const digital = (await card(page, "digital").boundingBox())!;
    expect(digital.y).toBeGreaterThanOrEqual(atl.y + atl.height); // one column: Digital is below ATL

    const dialog = await uploadToCard(page, "calendar", [sheetFile("plain-with-a-rather-long-file-name-for-a-small-phone-screen.xlsx", [["a"]])]);
    await expect(dialog.getByTestId("preview-row").getByText("Can't publish")).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    expect(await fits(dialog)).toBe(true);
    const btn = (await publishBtn(page).boundingBox())!;
    expect(btn.x + btn.width).toBeLessThanOrEqual(375);
  });

  test("history fits the screen (admin)", async ({ page }) => {
    await page.goto("/data-entry?tab=history");
    await expect(page.getByTestId("history-table")).toBeVisible();
    const box = page.getByTestId("history-table").locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
    expect(await noSideScroll(page)).toBe(true);
    expect(await box.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true); // the table scrolls inside its own box
  });

  test.describe("10 on a phone: viewer", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeAll(async ({ browser }) => seedHistory(browser));
    test("sees the history, the cards and the sign-in note without side scroll", async ({ page }) => {
      await page.goto("/data-entry?tab=history");
      await expect(page.getByTestId("history-table")).toBeVisible();
      await expect(page.getByTestId("history-table").locator("tbody tr").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
      expect(await noSideScroll(page)).toBe(true);
      await page.goto("/data-entry");
      await expect(page.getByText(VIEWER_NOTE)).toBeVisible();
      expect(await noSideScroll(page)).toBe(true);
      for (const c of await page.getByTestId("upload-card").all()) expect(await fits(c)).toBe(true);
    });
  });
});
```

Replace `e2e/phase2b-upload.spec.ts` with:

```ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { hasClientFiles, makeXlsx } from "../src/lib/ingest/test-workbooks";
import { OOH_MASTER_MESSAGE } from "../src/lib/ingest/cards";
import { XLSX_TYPE, card, fileOf, historyRows, openUpload, pickBusiness, publishBtn, ready, settled, uploadToCard, type Upload } from "./helpers";

// Phase 2 Part B user flow, through the Upload Data cards (Part D): the new file types and the Digital cards.
// Serial: one shared temp store.
test.describe.configure({ mode: "serial" });

const HYGIENE = "Hygiene_Business.xlsx";

// Digital sheets with a brand no business owns, so neither brands nor the file name settle the business.
const digitalBook = () => makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
  ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
  ...(p === "Meta" ? [["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
] })));
const digitalFile = (name: string): Upload => ({ name, mimeType: XLSX_TYPE, buffer: digitalBook() });

// The real file for each new type, on its own card, with the label its reader gives.
const NEW_TYPES = [
  ["channel", "Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx", "Channel Cost, Jul'26 to Nov'26"],
  ["fy", "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx", "FY spend, FY 2026-27"],
  ["billing", "Dashboard_Media_Final_Fixed_26th_October_2026.xlsx", "Billing master, 2,956 lines"],
  ["billboard", "Billboard_Billing_Status_Updated_10th_Nov26.xlsx", "Billboard billing, 169 bills"],
] as const;

/** The specs share one store: picks `name` for a Digital file when it is on the list, else adds it as New business…. */
const pickFileBusiness = (page: Page, fileName: string, name: string) =>
  pickBusiness(page, `Business for ${fileName}`, `New business name for ${fileName}`, name);

/** Decides every new business in a file as new (Add all as new, or the one name's select), until it is Ready. */
const addBusinessesAsNew = async (page: Page, row: Locator) => {
  await expect(ready(row).or(row.getByText("New business", { exact: true })).first()).toBeVisible();
  await settled(page);
  const all = row.getByRole("button", { name: "Add all as new" });
  if (await all.isVisible()) await all.click();
  else {
    for (const select of await row.getByLabel(/^Decision for /).all()) {
      if ((await select.inputValue()) === "") await select.selectOption({ label: "Add as new" });
    }
  }
  await expect(ready(row)).toBeVisible();
  await settled(page);
};

/** A real Digital file under a neutral name on the card for another business: Ready, Hygiene found from its (added) brands. */
const addHygieneAsDigital = async (page: Page) => {
  const dialog = await uploadToCard(page, "digital", [fileOf(HYGIENE, "digital.xlsx")]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText(/^Digital, Hygiene, /)).toBeVisible();
  await expect(ready(row)).toBeVisible();
  await expect(page.getByLabel("Business for digital.xlsx").locator("option:checked")).toHaveText("Hygiene");
  return row;
};

test("1. Digital from brands: once its brands are added, Hygiene gets its own card and a renamed file comes back Ready", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  // First upload: no brand of the file is on the list yet, so the admin picks the business and adds the brands.
  const dialog = await uploadToCard(page, "digital", [fileOf(HYGIENE, "digital.xlsx")]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText("Needs a business")).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  await pickFileBusiness(page, "digital.xlsx", "Hygiene");
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(/^Digital, Hygiene, /)).toBeVisible();
  await expect(row.getByText(/brands? not on your list\./)).toBeVisible();
  await row.getByRole("button", { name: "Review and add" }).click();
  await row.getByRole("button", { name: "Tick all" }).first().click();
  await row.getByRole("button", { name: "Done" }).first().click();
  await expect(row.getByText(/brands? not on your list\./)).toHaveCount(0);
  await settled(page);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, Hygiene/)).toBeVisible();

  // Hygiene now has its own card; the open card is for another business.
  await expect(card(page, "digital:hygiene")).toContainText("Digital · Hygiene");
  await expect(card(page, "digital:hygiene")).toContainText("Now showing: digital.xlsx · ");
  await expect(card(page, "digital")).toContainText("Digital · another business");

  // Second upload on the card for another business: the business now comes from the brands.
  await addHygieneAsDigital(page);
  await expect(publishBtn(page)).toBeEnabled();
});

test("2. a business's own Digital card never asks for the business", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const dialog = await uploadToCard(page, "digital:hygiene", [fileOf(HYGIENE, "hygiene-again.xlsx")]);
  await expect(dialog).toContainText("Check before publishing · Digital · Hygiene");
  const row = dialog.getByTestId("preview-row");
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(/^Digital, Hygiene, /)).toBeVisible();
  await expect(page.getByLabel("Business for hygiene-again.xlsx")).toHaveCount(0);
  await expect(publishBtn(page)).toBeEnabled();
});

test("3. Digital unclear: pick Salt, publish, and Salt gets its own card", async ({ page }) => {
  const dialog = await uploadToCard(page, "digital", [digitalFile("digital.xlsx")]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText("Needs a business")).toBeVisible();
  await expect(page.getByLabel("Business for digital.xlsx")).toHaveValue("");
  await expect(publishBtn(page)).toBeDisabled();

  await pickFileBusiness(page, "digital.xlsx", "Salt");
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(/^Digital, Salt/)).toBeVisible();
  await settled(page);
  await expect(publishBtn(page)).toBeEnabled();
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, Salt/)).toBeVisible();
  await expect(card(page, "digital:salt")).toContainText("Digital · Salt");
  await expect(card(page, "digital")).toContainText("Digital · another business");

  const rows = await historyRows(page);
  await expect(rows.filter({ hasText: "Digital, Salt" }).filter({ hasText: "In use" })).toHaveCount(1);
});

test("4. Digital for a new business: added in the dialog, then it has its own card", async ({ page }) => {
  const NAME = "E2E Digital Co";
  await openUpload(page);
  await expect(card(page, "digital:e2e-digital-co")).toHaveCount(0);
  const dialog = await uploadToCard(page, "digital", [digitalFile("digital-new.xlsx")]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText("Needs a business")).toBeVisible();
  await pickFileBusiness(page, "digital-new.xlsx", NAME);
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(/^Digital, E2E Digital Co/)).toBeVisible();
  await settled(page);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, E2E Digital Co/)).toBeVisible();
  const own = card(page, "digital:e2e-digital-co");
  await expect(own).toContainText(`Digital · ${NAME}`);
  await expect(own).toContainText("Now showing: digital-new.xlsx · ");
});

test("5. each new type on its own card: Ready with its label, published, Now showing, then In use", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  for (const [id, f, label] of NEW_TYPES) {
    const dialog = await uploadToCard(page, id, [fileOf(f)]);
    // Lists may still miss some of the file's businesses: decide them as new.
    await addBusinessesAsNew(page, dialog.getByTestId("preview-row"));
    await expect(dialog.getByText(label), f).toBeVisible();
    await publishBtn(page).click();
    await expect(page.getByText(`Published 1 file: ${label}`)).toBeVisible();
    await expect(card(page, id), f).toContainText(`Now showing: ${f} · `);
  }
  const history = await historyRows(page);
  for (const [, , label] of NEW_TYPES) {
    await expect(history.filter({ hasText: label }).filter({ hasText: "In use" }), label).toHaveCount(1);
  }
});

test("6. the OOH master sheet has no card, and on the billboard card it is blocked with where it goes", async ({ page }) => {
  const ooh: Upload = {
    name: "ooh-master.xlsx", mimeType: XLSX_TYPE,
    buffer: makeXlsx([{ name: "Sites", rows: [["SL", "OOH Location", "Latitude", "Longitude"], [1, "Gulshan 1", 23.78, 90.41]] }]),
  };
  const dialog = await uploadToCard(page, "billboard", [ooh]);
  const row = dialog.getByTestId("preview-row");
  await expect(row.getByText(OOH_MASTER_MESSAGE)).toBeVisible();
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  await expect(card(page, "ooh-sites")).toHaveCount(0);
});

test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("1 on a phone: the Digital file with its business select fits with no side scroll", async ({ page }) => {
    test.skip(!hasClientFiles, "client files not present");
    const row = await addHygieneAsDigital(page);
    await expect(page.getByLabel("Business for digital.xlsx")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await row.evaluate((el) => el.getBoundingClientRect().right <= 375 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const box = (await page.getByLabel("Business for digital.xlsx").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
});
```

- [ ] **Step 3: Run them**

Run: `npx playwright test e2e/phase2c-names.spec.ts e2e/phase2a-upload.spec.ts e2e/phase2b-upload.spec.ts`
Expected: PASS (fresh-store runs phase2c first; client-file tests skip when `Asset/xlsx` is absent). A failure here is a Task 4 bug: fix it in the component with a failing unit test first, not by loosening the spec.

- [ ] **Step 4: Run the whole suite and the build**

Run: `npx vitest run` then `npx tsc --noEmit` then `npx eslint e2e src` then `npx playwright test` then `npm run build`
Expected: all PASS (phase1 still loads `/uploads` and `/data-entry`; settings.spec walks the new `NAV_ITEMS`), and the build finishes with no prerender error for `/data-entry`.

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers.ts e2e/phase2a-upload.spec.ts e2e/phase2b-upload.spec.ts e2e/phase2c-names.spec.ts
git commit -F - <<'EOF'
test(e2e): walk the Phase 2 uploads through the Data Entry cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Self-review against the spec

Coverage, section by section:
- **1. Why / 2. Decisions:** 2.1 one card per file, type from the card: Tasks 1, 4 (every file sent as `type-<i>` = the card's type). 2.2 Digital one card per business: Task 3 (`cardStates`), Task 4 (fixed business via `startDraft`). 2.3 OOH master sheet not a card: Task 1 (`cardForType("ooh-sites")` is null, `OOH_MASTER_MESSAGE`), Task 2, Task 6 (phase2b test 6). 2.4 detection as a safety check: Task 2. 2.5 one Upload History, menu item goes: Task 4 (tab), Task 5 (sidebar). 2.6 Manual Entry: out of scope; only its "Manual edit" Now showing line is handled (Task 3).
- **3.1 page:** title, subtitle, tabs "Upload Data" / "Upload History": Task 4 (page.tsx).
- **3.2 cards:** order, titles, file texts, Updates, Now showing (ATL count), Upload Excel and drop (admin), viewer note with Sign in link, 2 columns / 1 on a phone: Tasks 1, 3, 4; Task 6 (viewer, phone).
- **3.3 Digital cards:** one per visible business with a Digital upload, then "Digital performance" / "Digital · another business" which asks the business (pick or New business); after publishing, its own card: Tasks 3, 4; Task 6 (phase2b tests 1 to 4).
- **3.4 Check before publishing:** title, "Reading <file name>…", What was read, Please check (amber), errors (red), the Part C questions unchanged, Cancel / Publish (on only when every file can publish), toast "Published 1 file: <label>", Now showing updates, ATL several files each with Remove: Task 4 (`DataCard`, `FileBlock`, `SkeletonBlock`, `file-controls.tsx`); Task 6.
- **3.5 safety check:** sure and another type, OOH master sheet text, none, unsure, old warning gone: Task 2 (unit and real files), Task 1 (texts), Task 6 (phase2a tests 2 and 3, phase2b test 6).
- **3.6 Upload History tab:** unchanged `HistoryTable`: Task 4 keeps it; Task 6 keeps the history, restore and download tests.
- **3.7 menu:** Task 5; `/uploads` stays.
- **4. code outline:** card list (Task 1), server (Task 2; API and form fields unchanged), store query (Task 3), page with cards and dialog (Task 4), sidebar (Task 5).
- **5. tests:** unit (Tasks 1 to 5); browser flows through the cards including wrong file, ATL new category then Now showing, Digital new business then its card, Billing with Add all as new, viewer, phone (Task 6); real-file tests keep passing (Task 2 Step 4, Task 6 Step 4).

Placeholders: none. Type names are consistent across tasks: `UploadCard`, `CardKey`, `ActiveVersion`, `CardState`, `startDraft`, `FileBlockProps`, `DataCard`, `CardFace`.

Choices the reviewer should know:
- "<card type>" in the safety messages uses the type label with "a" or "an" ("This is not an Activity Calendar file."), from one private map in `cards.ts`.
- The card for a business with no Digital data has id `digital` (not `digital:new`), so a business slugged `new` cannot collide with it.
- The ATL count is every active `atl:*` dataset, as the spec says, hidden categories included.
- The Publish button says "Publish" (spec 3.4); `publishButtonLabel` is removed.
- A `chosenType` of `ooh-sites` (no card, API only) still blocks a sure mismatch with a plain message, and its "none" case keeps the old message.
