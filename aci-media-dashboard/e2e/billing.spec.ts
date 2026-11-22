import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { addDays, todayDhaka } from "../src/lib/month";
import { TEMPLATES } from "../src/lib/upload/templates";

// Bills upload month is 2031-05 so a run never replaces real uploaded bills (see global-setup).
function billsXlsx(billNo: string, vendor: string, billDate: string): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.bills.columns.map((c) => c.header),
    [billNo, "PO-E2E", vendor, null, "2031-05", billDate, 80_000, null, "Finance/Audit", null, null],
  ]), "Bills");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("add an old bill, remind, note, mark paid; upload a bill and change its status", async ({ page }) => {
  const stamp = Date.now();
  const today = todayDhaka();
  const oldBill = `E2E-${stamp}-A`;
  const newBill = `E2E-${stamp}-B`;

  await page.goto("/billing");
  await page.getByRole("button", { name: "Add bill" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill no", { exact: true }).fill(oldBill);
  await dialog.getByLabel("Bill date").fill(addDays(today, -40));
  await dialog.getByLabel("Bill amount").fill("250,000");
  await dialog.getByRole("button", { name: "Save bill" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId("check-these-bills")).toContainText(oldBill);
  await page.getByLabel("Search bills").fill(`E2E-${stamp}`);
  await page.getByRole("form", { name: "Bill filters" }).getByRole("button", { name: "Apply" }).click();
  const row = page.getByTestId(`bill-${oldBill}`);
  await expect(row).toContainText("Unpaid");
  await expect(row).toContainText("40 days");

  await row.getByRole("button", { name: `More actions for ${oldBill}` }).click();
  await page.getByRole("menuitem", { name: "Remind" }).click();
  await expect(row).toContainText("Reminder on");
  await page.goto("/old-home");
  await expect(page.getByTestId("home-reminders")).toContainText(oldBill);
  await page.goBack();

  await row.getByRole("button", { name: `More actions for ${oldBill}` }).click();
  await page.getByRole("menuitem", { name: "Note" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill note").fill("Sent to finance");
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(row).toContainText("Sent to finance");

  await row.getByRole("button", { name: "Mark paid" }).click();
  await expect(row).toContainText("Payment Done");
  await expect(row).toContainText(`Paid ${today}`);
  await expect(row).not.toContainText("Reminder on");

  const panel = page.getByTestId("upload-bills");
  await panel.getByLabel("Choose Media bills file").setInputFiles({
    name: `e2e-bills-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: billsXlsx(newBill, `E2E Vendor ${stamp}`, addDays(today, -20)),
  });
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText(`E2E Vendor ${stamp}`);
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+: 1 added/)).toBeVisible();
  const uploaded = page.getByTestId(`bill-${newBill}`);
  await expect(uploaded).toContainText("Finance/Audit");
  await expect(uploaded).toContainText("20 days");

  await uploaded.getByRole("button", { name: newBill, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bill status").selectOption({ label: "Bill Error" });
  await dialog.getByRole("button", { name: "Save bill" }).click();
  await expect(dialog).toBeHidden();
  await expect(uploaded).toContainText("Bill Error");
  await uploaded.getByRole("button", { name: newBill, exact: true }).click();
  await expect(page.getByTestId("bill-history")).toContainText("Bill Error");
});
