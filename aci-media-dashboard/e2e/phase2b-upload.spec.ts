import { test, expect, type Locator, type Page } from "@playwright/test";
import { hasClientFiles, makeXlsx } from "../src/lib/ingest/test-workbooks";
import { OOH_MASTER_MESSAGE } from "../src/lib/ingest/cards";
import { XLSX_TYPE, addBusinessesAsNew, card, dropOnCard, fileOf, historyRows, openUpload, pickBusiness, publishBtn, ready, settled, uploadToCard, type Upload } from "./helpers";

// Phase 2 Part B user flow, through the Upload Data cards (Part D): the new file types and the Digital cards.
// Serial: one shared temp store.
test.describe.configure({ mode: "serial" });

const HYGIENE = "Hygiene_Business.xlsx";
const SALT = "Salt_Business.xlsx";

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

/** Review and add, Tick all, Done: every brand of the file goes on the list under the file's business. */
const addAllBrands = async (page: Page, row: Locator) => {
  await expect(row.getByText(/brands? not on your list\./)).toBeVisible();
  await row.getByRole("button", { name: "Review and add" }).click();
  await row.getByRole("button", { name: "Tick all" }).first().click();
  await row.getByRole("button", { name: "Done" }).first().click();
  await expect(row.getByText(/brands? not on your list\./)).toHaveCount(0);
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
  await addAllBrands(page, row);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, Hygiene/)).toBeVisible();

  // Hygiene now has its own card; the open card is for another business.
  await expect(card(page, "digital:hygiene")).toContainText("Digital · Hygiene");
  await expect(card(page, "digital:hygiene")).toContainText("In use: digital.xlsx · ");
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
  await expect(own).toContainText("In use: digital-new.xlsx · ");
});

test("5. each new type on its own card: Ready with its label, published, In use, then In use", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  for (const [id, f, label] of NEW_TYPES) {
    const dialog = await uploadToCard(page, id, [fileOf(f)]);
    // Lists may still miss some of the file's businesses: decide them as new.
    await addBusinessesAsNew(page, dialog.getByTestId("preview-row"));
    await expect(dialog.getByText(label), f).toBeVisible();
    await publishBtn(page).click();
    await expect(page.getByText(`Published 1 file: ${label}`)).toBeVisible();
    await expect(card(page, id), f).toContainText(`In use: ${f} · `);
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

test("7. a Salt Digital file dropped on Hygiene's card is blocked, naming the Digital · Salt card", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  // Positive control: on Salt's own card (from path 3) the file is Ready, and its brands become Salt's.
  const own = await uploadToCard(page, "digital:salt", [fileOf(SALT, "salt-digital.xlsx")]);
  const row = own.getByTestId("preview-row");
  await expect(ready(row)).toBeVisible();
  await expect(row.getByText(/^Digital, Salt, /)).toBeVisible();
  await addAllBrands(page, row);
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: Digital, Salt/)).toBeVisible();
  await expect(card(page, "digital:salt")).toContainText("In use: salt-digital.xlsx · ");

  // The same file dropped on Hygiene's own card: its brands belong to Salt, so it is blocked before anything is added.
  const wrong = await dropOnCard(page, "digital:hygiene", [fileOf(SALT, "salt-digital.xlsx")]);
  await expect(wrong).toContainText("Check before publishing · Digital · Hygiene");
  const blocked = wrong.getByTestId("preview-row");
  await expect(blocked.getByText("This file's brands belong to Salt, not Hygiene. Use the Digital · Salt card.")).toBeVisible();
  await expect(blocked.getByText("Can't publish")).toBeVisible();
  await expect(blocked.getByRole("button", { name: "Review and add" })).toHaveCount(0);
  await expect(publishBtn(page)).toBeDisabled();
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
