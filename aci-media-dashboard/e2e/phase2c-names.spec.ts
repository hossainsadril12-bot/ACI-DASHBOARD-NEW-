import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { hasClientFiles } from "../src/lib/ingest/test-workbooks";
import { addFiles, fileOf, openUpload, pickBusiness, publishBtn, ready, settled, sheetFile, type Upload } from "./helpers";

// Phase 2 Part C user flow: the business, brand and ATL category lists start empty and uploads ask about new names.
// Runs first, as the "fresh-store" project (playwright.config.ts), so the shared temp store is still empty.
// Serial: later paths build on the businesses earlier ones add.
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

/** The names a row's New business block asks about, from its "Decision for <name>" selects. */
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

test("2. real Billing file: decide 13 new businesses, ACI Salt same as Salt, publish, the list shows them", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  expect(await listedBusinesses(page)).toEqual([]); // path 1's empty start

  await openUpload(page);
  await addFiles(page, [fileOf(BILLING)]);
  const row = page.getByTestId("preview-row");
  await expect(row).toHaveCount(1);
  await expect(newBusinessChip(row)).toBeVisible();
  await expect(row.getByText("New businesses in this file")).toBeVisible();
  expect((await askedNames(row)).sort()).toEqual([...BILLING_NAMES].sort());
  await expect(publishBtn(page)).toBeDisabled();

  await row.getByRole("button", { name: "Add all as new" }).click();
  await expect(ready(row)).toBeVisible();
  await settled(page);
  for (const n of BILLING_NAMES) await expect(decision(row, n), n).toHaveValue("add");

  // ACI Salt is the same business as Salt, which this row adds.
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

  const after = await listedBusinesses(page);
  expect([...after].sort()).toEqual(BILLING_NAMES.filter((x) => x !== "ACI Salt").sort()); // 12 businesses, no ACI Salt
  await page.getByRole("link", { name: "Salt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Salt", exact: true })).toBeVisible();
  await expect(page.getByText("Also matches: ACI Salt")).toBeVisible();
});

test("3. a new ATL category: Lux Soap under Toiletries with our brand Lux, published, shown on the Toiletries page", async ({ page }) => {
  await openUpload(page);
  await addFiles(page, [luxSoap()]);
  const row = page.getByTestId("preview-row");
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
  await openUpload(page);
  await addFiles(page, [file]);
  const row = page.getByTestId("preview-row");
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
  await openUpload(page);
  await addFiles(page, [file]);
  await expect(ready(row)).toBeVisible();
  await expect(brandWarning(row)).toHaveCount(0);
  await expect(row.getByText("New businesses in this file")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Review and add" })).toHaveCount(0);
});

test("5. Cancel after deciding a new business changes nothing on the list", async ({ page }) => {
  const BIZ = "E2E Cancel Co";
  const before = await listedBusinesses(page);
  const file = calendar("cal-cancel.xlsx", [[BIZ, "E2E Cancel Brand"]]);
  await openUpload(page);
  await addFiles(page, [file]);
  const row = page.getByTestId("preview-row");
  await expect(newBusinessChip(row)).toBeVisible();
  await decision(row, BIZ).selectOption({ label: "Add as new" });
  await expect(ready(row)).toBeVisible();
  await settled(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("preview-row")).toHaveCount(0);

  expect(await listedBusinesses(page)).toEqual(before);
  // The decision was dropped too: the same file asks again.
  await openUpload(page);
  await addFiles(page, [file]);
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
    await openUpload(page);
    await addFiles(page, [calendar("cal-phone-with-a-long-file-name.xlsx", names)]);
    const row = page.getByTestId("preview-row");
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
