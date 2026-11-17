import { test, expect, type Page } from "@playwright/test";
import { clientFile, hasClientFiles, makeXlsx } from "../src/lib/ingest/test-workbooks";

// Phase 2 Part B user flow: the new file types and the Digital business picker. Serial: one shared temp store.
test.describe.configure({ mode: "serial" });

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HYGIENE = "Hygiene_Business.xlsx";
const fileOf = (rel: string, name = rel.split("/").pop()!) => ({ name, mimeType: XLSX_TYPE, buffer: clientFile(rel) });

// Digital sheets with a brand no business owns, so neither brands nor the file name settle the business.
const digitalBook = () => makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
  ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
  ...(p === "Meta" ? [["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
] })));

// The real file for each new type, with the label its reader gives.
const NEW_TYPES = [
  ["Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx", "Channel Cost, Jul'26 to Nov'26"],
  ["CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx", "FY spend, FY 2026-27"],
  ["Dashboard_Media_Final_Fixed_26th_October_2026.xlsx", "Billing master, 2,956 lines"],
  ["Billboard_Billing_Status_Updated_10th_Nov26.xlsx", "Billboard billing, 169 bills"],
  ["ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx", "OOH master sheet, 40 sites"],
] as const;

const openUpload = async (page: Page) => {
  await page.goto("/data-entry");
  await expect(page.getByTestId("upload-drop")).toBeVisible();
};
const addFiles = (page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) => page.setInputFiles("input[type=file]", files);
const publishBtn = (page: Page) => page.getByRole("button", { name: /Publish \d+ files?/ });
const historyRows = async (page: Page) => {
  await page.goto("/data-entry?tab=history");
  return page.getByTestId("history-table").locator("tbody tr");
};

/** Path 1: a real Digital file under a neutral name; the business comes from its brands. */
const addHygieneAsDigital = async (page: Page) => {
  await openUpload(page);
  await addFiles(page, [fileOf(HYGIENE, "digital.xlsx")]);
  const row = page.getByTestId("preview-row");
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/^Digital, Hygiene, /)).toBeVisible();
  await expect(row.getByText("Ready")).toBeVisible();
  await expect(page.getByLabel("Business for digital.xlsx")).toHaveValue("Hygiene");
  return row;
};

test("1. Digital from brands: a renamed Hygiene file is Ready with Hygiene picked", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  await addHygieneAsDigital(page);
  await expect(page.getByLabel("File type for digital.xlsx")).toHaveValue("digital");
  await expect(publishBtn(page)).toBeEnabled();
});

test("2. Digital unclear: pick Salt, it becomes Ready, publishes as Digital, Salt", async ({ page }) => {
  await openUpload(page);
  await addFiles(page, [{ name: "digital.xlsx", mimeType: XLSX_TYPE, buffer: digitalBook() }]);
  const row = page.getByTestId("preview-row");
  await expect(row.getByText("Needs a business")).toBeVisible();
  await expect(page.getByLabel("Business for digital.xlsx")).toHaveValue("");
  await expect(publishBtn(page)).toBeDisabled();

  await page.getByLabel("Business for digital.xlsx").selectOption({ label: "Salt" });
  await expect(row.getByText("Ready")).toBeVisible();
  await expect(row.getByText(/^Digital, Salt/)).toBeVisible();
  await expect(publishBtn(page)).toBeEnabled();
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, Salt/)).toBeVisible();

  const rows = await historyRows(page);
  await expect(rows.filter({ hasText: "Digital, Salt" }).filter({ hasText: "In use" })).toHaveCount(1);
});

test("3. every new type: 5 real files Ready with their labels, then In use in Upload History", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  await openUpload(page);
  await addFiles(page, NEW_TYPES.map(([f]) => fileOf(f)));
  const rows = page.getByTestId("preview-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.getByText("Ready", { exact: true })).toHaveCount(5);
  for (const [f, label] of NEW_TYPES) {
    await expect(rows.filter({ hasText: f }).getByText(label), f).toBeVisible();
  }
  await expect(publishBtn(page)).toHaveText("Publish 5 files");
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 5 files/)).toBeVisible();

  const history = await historyRows(page);
  for (const [, label] of NEW_TYPES) {
    await expect(history.filter({ hasText: label }).filter({ hasText: "In use" }), label).toHaveCount(1);
  }
});

test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("1 on a phone: the Digital row with both selects fits with no side scroll", async ({ page }) => {
    test.skip(!hasClientFiles, "client files not present");
    const row = await addHygieneAsDigital(page);
    await expect(page.getByLabel("File type for digital.xlsx")).toBeVisible();
    await expect(page.getByLabel("Business for digital.xlsx")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await row.evaluate((el) => el.getBoundingClientRect().right <= 375 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const label of ["File type for digital.xlsx", "Business for digital.xlsx"]) {
      const box = (await page.getByLabel(label).boundingBox())!;
      expect(box.x + box.width, label).toBeLessThanOrEqual(375);
    }
  });
});
