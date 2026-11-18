import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { clientFile, hasClientFiles, makeXlsx } from "../src/lib/ingest/test-workbooks";
import { XLSX_TYPE, addFiles, fileOf, historyRows, openUpload, publishBtn, ready, sheetFile } from "./helpers";

// Phase 2 Part A user flow, every path. Serial: paths 6 and 7 build on each other.
test.describe.configure({ mode: "serial" });

const SAVLON = "atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx";
const SEPTEX = "atl/2._2026_Dash_Board_-_Septex_-_Oct26.xlsx";
// The category is named from the file's own "Brand Name:" title now that lists start empty.
const SAVLON_LABEL = "ATL, ACI Savlon Soap, Jul'25 to Oct'26";

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
  await openUpload(page);
  // The "Brand Name:" line is there, but no "Brand Name" / "Brand" header row: a read error, before any category question.
  const f = sheetFile("noheader.xlsx", [["Brand Name: E2E No Header"], ["Category: Soap"], ["Brands", "Jul'26"], ["Lux", 1]], "GRP");
  await addFiles(page, [f]);
  const row = page.getByTestId("preview-row");
  await expect(row).toHaveCount(1);
  await page.getByLabel("File type for noheader.xlsx").selectOption({ label: "ATL (TV)" });
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(row.getByText(`The header row with "Brand Name" or "Brand" wasn't found.`)).toBeVisible();
  await expect(row.getByText(/New category/)).toHaveCount(0);
  await expect(publishBtn(page)).toBeDisabled();
});

test("2. a plain workbook is refused as not his file", async ({ page }) => {
  await openUpload(page);
  await addFiles(page, [sheetFile("plain.xlsx", [["a"]])]);
  const row = page.getByTestId("preview-row");
  await expect(row.getByText("This is not one of the usual Media Mind files.").first()).toBeVisible();
  await expect(row.getByText("Can't publish")).toBeVisible();
  await expect(page.getByLabel("File type for plain.xlsx")).toBeDisabled(); // no type can make it publishable
  await expect(publishBtn(page)).toBeDisabled();
});

test("3. unsure file: the admin picks Activity Calendar and it becomes Ready with a warning", async ({ page }) => {
  await openUpload(page);
  // A business name only this test uses, so it is new whatever other specs added.
  const rows = [["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["E2E Care 2a", "Savlon Soap", 1, 0.5, 0, 0, 1.5]];
  await addFiles(page, [sheetFile("cal.xlsx", rows, "Nov'26")]);
  const row = page.getByTestId("preview-row");
  await expect(row.getByText("Needs a type")).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  await page.getByLabel("File type for cal.xlsx").selectOption({ label: "Activity Calendar" });
  // The list starts empty: the file's business is new, and must be decided first.
  await expect(row.getByText("New business", { exact: true })).toBeVisible();
  await expect(publishBtn(page)).toBeDisabled();
  await page.getByLabel("Decision for E2E Care 2a").selectOption({ label: "Add as new" });
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(`Sheet "Nov'26" has no Grand Total row; read to the last row.`)).toBeVisible();
  await expect(publishBtn(page)).toBeEnabled();
});

test("4. real Savlon Soap file previews with its label (16 months from Jul'25)", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  await openUpload(page);
  await addFiles(page, [fileOf(SAVLON)]);
  const row = page.getByTestId("preview-row");
  await addCategoryIfAsked(row);
  await expect(row.getByText(SAVLON_LABEL)).toBeVisible();
  await expect(publishBtn(page)).toHaveText("Publish 1 file");
});

let rowsBefore = 0;
test("5. Cancel changes nothing in Upload History", async ({ page }) => {
  rowsBefore = await (await historyRows(page)).count();
  await openUpload(page);
  await addFiles(page, [sheetFile("cal.xlsx", [["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Total"], ["T", "Savlon Soap", 1, 1], ["Grand Total", null, 1, 1]], "Nov'26")]);
  await expect(page.getByTestId("preview-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("preview-row")).toHaveCount(0);
  expect(await (await historyRows(page)).count()).toBe(rowsBefore);
});

test("6. publish several files: toast and two In use rows", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  await openUpload(page);
  await addFiles(page, [fileOf(SAVLON), fileOf(SEPTEX)]);
  await expect(page.getByTestId("preview-row")).toHaveCount(2);
  for (const f of [SAVLON, SEPTEX]) await addCategoryIfAsked(page.getByTestId("preview-row").filter({ hasText: fileOf(f).name }));
  await expect(ready(page.getByTestId("preview-row"))).toHaveCount(2);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 2 files/)).toBeVisible();
  const rows = await historyRows(page);
  await expect(rows.filter({ hasText: SAVLON_LABEL }).filter({ hasText: "In use" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Septex" }).filter({ hasText: "In use" })).toHaveCount(1);
});

test("7. republish the same file with a warning, then restore the older one", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  const confirms: string[] = [];
  page.on("dialog", (d) => {
    confirms.push(d.message());
    void d.accept();
  });
  await openUpload(page);
  await addFiles(page, [fileOf(SAVLON)]);
  await expect(page.getByTestId("preview-row").getByText("This is the same file as the one in use.")).toBeVisible();
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

test("8. admin can download the original file", async ({ page }) => {
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

test.describe("9. viewer", () => {
  test.beforeAll(async ({ browser }) => seedHistory(browser));
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees History without Restore or Download, and Upload says only the admin can upload", async ({ page }) => {
    await page.goto("/data-entry?tab=history");
    await expect(page.getByTestId("history-table")).toBeVisible();
    await expect(page.getByTestId("history-table").locator("tbody tr").first()).toBeVisible();
    expect(await page.getByTestId("history-table").locator("tbody tr").count()).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
    await page.goto("/data-entry");
    await expect(page.getByText("Only the admin can upload. Sign in to upload files.")).toBeVisible();
    await expect(page.getByTestId("upload-drop")).toHaveCount(0);
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

  // Whole page must fit (top bar included), plus the content box itself.
  const contentFits = async (page: Page, testId: string) => {
    if (!(await noSideScroll(page))) return false;
    return page.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().right <= 375 && el.scrollWidth <= el.clientWidth + 1);
  };

  test("4 on a phone: preview fits the screen", async ({ page }) => {
    test.skip(!hasClientFiles, "client files not present");
    await openUpload(page);
    expect(await contentFits(page, "upload-drop")).toBe(true);
    await addFiles(page, [fileOf(SAVLON)]);
    await addCategoryIfAsked(page.getByTestId("preview-row"));
    await expect(page.getByTestId("preview-row").getByText(SAVLON_LABEL)).toBeVisible();
    await expect(publishBtn(page)).toBeVisible();
    expect(await contentFits(page, "preview-row")).toBe(true);
    const btn = (await publishBtn(page).boundingBox())!;
    expect(btn.x + btn.width).toBeLessThanOrEqual(375);
  });

  test("history fits the screen (admin)", async ({ page }) => {
    await page.goto("/data-entry?tab=history");
    await expect(page.getByTestId("history-table")).toBeVisible();
    const card = page.getByTestId("history-table").locator("xpath=ancestor::div[contains(@class,'overflow-x-auto')][1]");
    expect(await noSideScroll(page)).toBe(true);
    expect(await card.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true); // the table scrolls inside its own box
  });

  test.describe("9 on a phone: viewer", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeAll(async ({ browser }) => seedHistory(browser));
    test("sees the history and the admin-only message without side scroll", async ({ page }) => {
      await page.goto("/data-entry?tab=history");
      await expect(page.getByTestId("history-table")).toBeVisible();
      await expect(page.getByTestId("history-table").locator("tbody tr").first()).toBeVisible();
      expect(await page.getByTestId("history-table").locator("tbody tr").count()).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
      expect(await noSideScroll(page)).toBe(true);
      await page.goto("/data-entry");
      await expect(page.getByText("Only the admin can upload. Sign in to upload files.")).toBeVisible();
      expect(await noSideScroll(page)).toBe(true);
    });
  });
});
