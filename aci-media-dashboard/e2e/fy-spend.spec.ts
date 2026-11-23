import { test, expect } from "@playwright/test";
import { hasClientFiles, clientFile } from "../src/lib/ingest/test-workbooks";
import { openWorkbook } from "../src/lib/ingest/workbook";
import { readFy } from "../src/lib/ingest/readers/fy";
import { formatMn } from "../src/lib/pages/fy-spend";
import { addBusinessesAsNew, chooseBusiness, fileOf, publishBtn, uploadToCard } from "./helpers";

// 3.2 FY Media Spend, end to end with his real FY file. Cards and the grand total do not depend on how
// businesses are grouped, so they are checked against the numbers computed from the same file here.
test.describe.configure({ mode: "serial" });

const FILE = "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx";
const num = (n: number) => formatMn(n).replace(/ BDT Mn$/, "");

test("his real FY file on the page: cards, grand total, media and business filters, phone width", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  test.setTimeout(180_000);
  // Expected numbers come straight from his file, not from the page's builder.
  const wb = openWorkbook(new Uint8Array(clientFile(FILE)));
  const rows = readFy(wb).data;
  const sheet = wb.sheet(wb.sheets.findIndex((s) => /final report/i.test(s.name) && s.visible))!;
  let gt = 0;
  for (let r = 1; r <= sheet.maxRow; r++) if (/^grand total$/i.test(String(sheet.v(r, 1) ?? "").trim())) { gt = r; break; }
  expect(gt).toBeGreaterThan(0);
  const cell = (c: number) => { const x = sheet.v(gt, c); return typeof x === "number" ? x : 0; };
  let reported = 0;
  for (let i = 0; i < 12; i++) if (cell(3 + i) !== 0) reported = i + 1;
  expect(reported).toBeGreaterThan(0);
  expect(reported).toBeLessThan(12);
  const media = ["TV", "Digital", "Print", "OOH"];
  const cardFytd = (m: string) => rows.filter((r) => r.med === m).reduce((t, r) => t + r.m.slice(0, reported).reduce((a, x) => a + (x ?? 0), 0), 0);

  // 1. Upload through the FY card (the same file may already be in use: that only adds a warning).
  const dialog = await uploadToCard(page, "fy", [fileOf(FILE)]);
  await addBusinessesAsNew(page, dialog.getByTestId("preview-row"));
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file: FY spend/)).toBeVisible();

  // 2. The page, with every business.
  await page.goto("/fy-spend");
  await chooseBusiness(page, "All businesses");
  const grand = page.getByTestId("fy-grand-total");
  await expect(grand).toBeVisible();

  // 3. Cards and the grand total match the numbers computed from his file.
  for (const m of media) await expect(page.getByTestId(`fy-card-${m}`), m).toContainText(formatMn(cardFytd(m)));
  await expect(page.locator('[data-testid^="fy-card-"]')).toHaveCount(4);
  const cells = grand.locator("td");
  for (let i = 0; i < 12; i++) {
    const tc = cells.nth(1 + i);
    if (i >= reported) await expect(tc, `month ${i + 1} not reported`).toHaveText("");
    else await expect(tc, `month ${i + 1}`).toHaveText(cell(3 + i) === 0 ? "–" : num(cell(3 + i)));
  }
  await expect(cells.nth(13)).toHaveText(num(cell(15)));

  // 4. The TV media button.
  await page.getByRole("navigation", { name: "Media" }).getByRole("link", { name: "TV", exact: true }).click();
  await expect(page).toHaveURL(/[?&]media=TV\b/);
  await expect(page.getByText("Brand × month spend · TV")).toBeVisible();
  await expect(page.getByTestId("fy-grand-total").locator("td").nth(13)).toHaveText(num(cardFytd("TV")));
  await expect(page.getByTestId("fy-card-TV")).toContainText(formatMn(cardFytd("TV")));
  await page.goto("/fy-spend");

  // 5. One business: the first group under All. Cards change; only that business's groups are left.
  const heading = async () => {
    const names = await page.getByTestId("fy-table").locator("tbody tr").locator("td:first-child").allTextContents();
    return names.map((n) => n.trim());
  };
  const totals = (await heading()).filter((n) => / total$/.test(n) && n !== "Grand total");
  expect(totals.length).toBeGreaterThan(1);
  const biz = totals[0].replace(/ total$/, "");
  const cardTexts = async () => Promise.all(media.map((m) => page.getByTestId(`fy-card-${m}`).textContent()));
  const grandFytd = async () => (await page.getByTestId("fy-grand-total").locator("td").nth(13).textContent())?.trim();
  const allCards = await cardTexts();
  const allGrand = await grandFytd();
  try {
    await chooseBusiness(page, biz);
    await expect(page.getByTestId("fy-table")).toBeVisible();
    await expect.poll(async () => (await heading()).filter((n) => / total$/.test(n) && n !== "Grand total")).toEqual([`${biz} total`]);
    await expect.poll(async () => JSON.stringify([await cardTexts(), await grandFytd()])).not.toBe(JSON.stringify([allCards, allGrand]));
    // The grand total FY to date now equals this business's own total row.
    const own = page.getByTestId("fy-table").locator("tbody tr").filter({ has: page.locator("td:first-child").filter({ hasText: `${biz} total` }) }).first();
    await expect(own.locator("td").nth(13)).toHaveText(await grandFytd() ?? "");
  } finally {
    await chooseBusiness(page, "All businesses");
  }
  await expect.poll(async () => (await heading()).filter((n) => / total$/.test(n) && n !== "Grand total").length).toBeGreaterThan(1);

  // 6. Phone width: the page does not scroll sideways, the table scrolls inside its box.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/fy-spend");
  await expect(page.getByTestId("fy-table")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const box = page.getByTestId("fy-table").locator("xpath=ancestor::*[@data-slot='table-container'][1]");
  expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});
