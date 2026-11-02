import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

// Regression: after choosing a month, a refresh or a menu click jumped back to the current month,
// so data entered for another month looked lost.
test("the chosen month is kept across pages and refreshes, and applies without a click", async ({ page }) => {
  await page.goto("/spend?month=2031-06");
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "June 2031" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "June 2031" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Spend", exact: true }).click();
  const month = page.getByRole("form", { name: "Filters" }).getByLabel("Month");
  await expect(month).toHaveValue("2031-06");

  await month.fill("2031-07");
  await expect(page).toHaveURL(/month=2031-07/);
  await page.goto("/performance");
  await expect(page.getByRole("form", { name: "Filters" }).getByLabel("Month")).toHaveValue("2031-07");
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

  await page.goto("/spend?month=2031-09");
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("upload-spend");
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await page.getByRole("button", { name: "Show August 2031" }).click();
  await expect(page).toHaveURL(/month=2031-08/);
  await expect(page.getByTestId("spend-matrix")).toContainText(brand);

  // The same file again explains where its data already is.
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText("Its data is already saved for August 2031");
});
