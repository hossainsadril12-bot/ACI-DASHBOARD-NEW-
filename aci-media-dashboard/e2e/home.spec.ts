import { test, expect } from "@playwright/test";
import { addDays, todayDhaka } from "../src/lib/month";

test("home shows an overdue bill alert, reminds it, and lists a campaign starting soon", async ({ page }) => {
  const stamp = Date.now();
  const today = todayDhaka();
  const brand = `E2E Home Brand ${stamp}`;
  const billNo = `E2E-${stamp}-H`;

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  await page.goto("/billing");
  await page.getByRole("button", { name: "Add bill" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill no", { exact: true }).fill(billNo);
  await dialog.getByLabel("Bill date").fill(addDays(today, -35));
  await dialog.getByLabel("Bill amount").fill("10,000");
  await dialog.getByRole("button", { name: "Save bill" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/plan?month=${today.slice(0, 7)}`);
  await page.getByRole("button", { name: "Add campaign" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Campaign brand").selectOption({ label: brand });
  await dialog.getByLabel("Campaign name").fill(`Soon ${stamp}`);
  await dialog.getByLabel("Start date").fill(addDays(today, 5));
  await dialog.getByLabel("End date").fill(addDays(today, 20));
  await dialog.getByLabel("Amount 1", { exact: true }).fill("1,000,000");
  await dialog.getByRole("button", { name: "Save campaign" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/old-home");
  await expect(page.getByTestId("alerts")).toContainText(/bills? waiting \d+\+ days/);
  await expect(page.getByTestId("home-upcoming")).toContainText(`Soon ${stamp}`);
  await expect(page.getByTestId(`home-budget-${brand}`)).toContainText("No budget set");

  await page.getByRole("button", { name: "Remind" }).click();
  const reminders = page.getByTestId("home-reminders");
  await expect(reminders).toContainText(billNo);
  await reminders.getByRole("button", { name: `Done: ${billNo}` }).click();
  await expect(page.getByTestId("home-reminders").getByText(billNo)).toHaveCount(0);
});
