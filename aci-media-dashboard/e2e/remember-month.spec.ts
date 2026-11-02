import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

// Regression: after choosing a month, a refresh or a menu click jumped back to the current month,
// so data entered for another month looked lost.
const shown = async (page: Page, url: string) => {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
};
const cookie = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name)?.value;

test("the chosen month is kept across pages and refreshes, and applies without a click", async ({ page }) => {
  await shown(page, "/spend?month=2031-06");
  await shown(page, "/plan");
  await expect(page.getByRole("heading", { name: "June 2031" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "June 2031" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Spend", exact: true }).click();
  const month = page.getByRole("form", { name: "Filters" }).getByLabel("Month");
  await expect(month).toHaveValue("2031-06");

  await month.fill("2031-07");
  await expect(page).toHaveURL(/month=2031-07/);
  await page.waitForLoadState("networkidle");
  await shown(page, "/performance");
  await expect(page.getByRole("form", { name: "Filters" }).getByLabel("Month")).toHaveValue("2031-07");

  // Home links to other months; opening Home must not change the remembered month.
  await shown(page, "/");
  expect(await cookie(page, "aci-month")).toBe("2031-07");
});

test("Competitors does not lock other pages to one brand, and a deleted brand is ignored", async ({ page }) => {
  await page.context().addCookies([{ name: "aci-brand", value: "999999", url: "http://localhost:3000" }]);
  await shown(page, "/spend?month=2031-06");
  await expect(page.getByRole("form", { name: "Filters" }).getByLabel("Brand")).toHaveValue("");
  expect(await cookie(page, "aci-brand")).toBeUndefined();

  await shown(page, "/competitors?month=2031-05");
  expect(await cookie(page, "aci-brand")).toBeUndefined();
  expect(await cookie(page, "aci-month")).toBe("2031-05");
});

test("after saving a file for another month, the message offers to open that month", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Month Brand ${stamp}`;
  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.spend.columns.map((c) => c.header),
    ["2031-08", null, brand, "TV", null, null, 123_000, null],
  ]), "Spend");
  const file = { name: `e2e-month-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })) };

  await shown(page, "/spend?month=2031-09&group=TV");
  const panel = page.getByTestId("upload-spend");
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await page.getByRole("button", { name: "Show August 2031" }).click();
  await expect(page).toHaveURL(/month=2031-08/);
  await expect(page).toHaveURL(/group=TV/);
  await expect(page.getByTestId("spend-matrix")).toContainText(brand);

  // The same file again explains where its data already is.
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText("Its data is already saved for August 2031");
});
