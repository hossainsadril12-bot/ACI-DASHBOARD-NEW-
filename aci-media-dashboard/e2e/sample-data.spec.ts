import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { todayDhaka } from "../src/lib/month";

// Loads the sample set on the dev branch, uploads a sample file, then removes everything it added.
test("load sample data, upload a sample file, then remove it", async ({ page }) => {
  test.setTimeout(240_000);
  const month = todayDhaka().slice(0, 7);
  await page.goto("/settings");
  const card = page.getByTestId("sample-data");
  if (await card.getByRole("button", { name: "Remove sample data" }).count()) {
    await card.getByRole("button", { name: "Remove sample data" }).click();
    await card.getByRole("button", { name: "Click again to remove" }).click();
    await expect(card.getByRole("button", { name: "Load sample data" })).toBeVisible({ timeout: 120_000 });
  }
  await card.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText(/Loaded 4 sample brands/)).toBeVisible({ timeout: 180_000 });
  await expect(card).toContainText("4 sample brands loaded");

  const [download] = await Promise.all([page.waitForEvent("download"), card.getByRole("link", { name: "Download sample Media spend file" }).click()]);
  expect(download.suggestedFilename()).toBe(`aci-sample-spend-${month}.xlsx`);
  const file = { name: download.suggestedFilename(), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await readFile(await download.path()) };

  await page.goto(`/spend?month=${month}`);
  const kpi = page.getByTestId("kpi-month-spend");
  const before = await kpi.textContent();
  const panel = page.getByTestId("upload-spend");
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText("Totals match");
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+/)).toBeVisible();
  await expect(kpi).not.toHaveText(before ?? "");

  await page.goto(`/plan?month=${month}`);
  await expect(page.getByTestId("budget-CareSoft Napkin (Sample)")).toContainText("Over budget");

  await page.goto("/settings");
  await card.getByRole("button", { name: "Remove sample data" }).click();
  await card.getByRole("button", { name: "Click again to remove" }).click();
  await expect(page.getByText(/Removed 4 sample brands/)).toBeVisible({ timeout: 120_000 });
  await expect(card.getByRole("button", { name: "Load sample data" })).toBeVisible();
});
