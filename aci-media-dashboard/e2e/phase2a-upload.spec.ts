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
