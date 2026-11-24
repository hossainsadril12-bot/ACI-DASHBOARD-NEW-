import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { hasClientFiles, clientFile } from "../src/lib/ingest/test-workbooks";
import { openWorkbook } from "../src/lib/ingest/workbook";
import { readCalendar } from "../src/lib/ingest/readers/calendar";
import { xstr } from "../src/lib/ingest/cells";
import { formatMn } from "../src/lib/pages/fy-spend";
import { addBusinessesAsNew, chooseBusiness, fileOf, publishBtn, uploadToCard } from "./helpers";

// 3.1 Monthly Activity Calendar, end to end with his real calendar file. Expected numbers come straight from his
// workbook cells or plain sums over the reader's rows, never from the page's builder.
test.describe.configure({ mode: "serial" });

const FILE = "All_Activity_Calender_FY_26-27.xlsx";
const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10"];
const LATER = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"];
/** His sheet's number style: 2 to 3 decimals, en-US grouping. */
const sheetText = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const sumOf = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const tidy = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Screenshots for the controller, only with CAL_SHOTS=1, so normal runs write no files.
const SHOTS = process.env.CAL_SHOTS === "1"
  ? "C:/Users/Sadri/AppData/Local/Temp/claude/66de2eb4ec382277/cfcea149-46d6-43ca-b8a9-643115ebebf1/scratchpad/cal-shots"
  : null;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

/** The Grand Total row of each month sheet in his workbook: [TV, Digital, Print, OOH, Total] from his own cells. */
function hisGrandTotals(): Map<string, number[]> {
  const wb = openWorkbook(new Uint8Array(clientFile(FILE)));
  const out = new Map<string, number[]>();
  for (const ws of wb.visibleSheets()) {
    let hr = 0;
    for (let r = 1; r <= 8; r++) if (/^business$/i.test(xstr(ws.v(r, 1))) && /^brand$/i.test(xstr(ws.v(r, 2)))) { hr = r; break; }
    expect(hr, ws.name).toBeGreaterThan(0);
    const col: Record<string, number> = {};
    for (let c = 3; c <= 12; c++) for (const r of [hr, hr + 1]) { const h = xstr(ws.v(r, c)).toLowerCase(); if (!col[h]) col[h] = c; }
    for (let r = hr + 2; r <= ws.maxRow; r++) {
      if (!/^grand total$/i.test(xstr(ws.v(r, 1)))) continue;
      out.set(ws.name.trim(), ["tv", "digital", "print", "ooh", "total"].map((k) => { const x = ws.v(r, col[k]); return typeof x === "number" ? x : 0; }));
      break;
    }
  }
  return out;
}

test("his real calendar file on the page: cards, both views, media toggle, business filter, phone width", async ({ page }) => {
  test.skip(!hasClientFiles, "client files not present");
  test.setTimeout(240_000);
  const data = readCalendar(openWorkbook(new Uint8Array(clientFile(FILE)))).data;
  expect(data.months.map((m) => m.m)).toEqual(MONTHS);
  const rows = data.months.flatMap((m) => m.rows.map((r) => ({ ...r, m: m.m })));
  const fytd = sumOf(rows.map((r) => r.t));
  const oct = data.months.find((m) => m.m === "2026-10")!;
  const octTotal = sumOf(oct.rows.map((r) => r.t));
  const grands = hisGrandTotals();
  expect([...grands.keys()]).toEqual(["July'26", "Aug'26", "Sep'26", "Oct'26"]); // his sheet names

  // 1. Upload through the calendar card (the same file may already be in use: that only adds a warning).
  const dialog = await uploadToCard(page, "calendar", [fileOf(FILE)]);
  await addBusinessesAsNew(page, dialog.getByTestId("preview-row"));
  await publishBtn(page).click();
  await expect(page.getByText(/^Published 1 file/)).toBeVisible();

  // 2. The page, every business, the Gantt by default.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/calendar");
  await chooseBusiness(page, "All businesses");
  const gantt = page.getByTestId("calendar-gantt");
  await expect(gantt).toBeVisible();

  // 3. Cards: FY to date is every row's total; the last month is Oct'26 with its total.
  await expect(page.getByTestId("cal-card-fytd")).toContainText(formatMn(fytd));
  await expect(page.getByTestId("cal-card-fytd")).toContainText("4 months: Jul'26 to Oct'26");
  await expect(page.getByTestId("cal-card-last")).toContainText("Oct'26 spend");
  await expect(page.getByTestId("cal-card-last")).toContainText(formatMn(octTotal));
  await expect(page.getByTestId("cal-card-mix")).toContainText("Media mix Oct'26");

  // 4. Gantt: Nov'26 onward is not uploaded and hatched; Jul to Oct are uploaded.
  const brandRows = gantt.getByTestId("gantt-brand-row");
  expect(await brandRows.count()).toBeGreaterThan(0);
  const first = brandRows.first();
  for (const m of MONTHS) await expect(first.locator(`td[data-month="${m}"]`), m).toHaveAttribute("data-uploaded", "true");
  for (const m of LATER) await expect(first.locator(`td[data-month="${m}"]`), m).toHaveAttribute("data-uploaded", "false");
  const novImage = await first.locator('td[data-month="2026-11"]').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(novImage).toContain("repeating-linear-gradient");
  const octImage = await first.locator('td[data-month="2026-10"]').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(octImage).not.toContain("repeating-linear-gradient");
  await expect(first.locator('td[data-month="2026-11"] [data-medium]')).toHaveCount(0);

  // A brand with TV spend in Oct has its TV lane on in Oct.
  const tvBrand = oct.rows.find((r) => r.v[0] > 0)!;
  expect(tvBrand, "a brand with TV in Oct").toBeTruthy();
  const tvRow = brandRows.filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^\\s*${tvBrand.b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }) }).first();
  await expect(tvRow.locator('td[data-month="2026-10"] [data-medium="TV"]')).toHaveAttribute("data-on", "true");
  // And the brands with TV on in Oct are exactly the file's brands with TV spend in Oct.
  const tvOnOct = brandRows.filter({ has: page.locator('td[data-month="2026-10"] [data-medium="TV"][data-on="true"]') });
  await expect(tvOnOct).toHaveCount(new Set(oct.rows.filter((r) => r.v[0] > 0).map((r) => tidy(r.b))).size);
  await expect(gantt.getByTestId("gantt-total-row")).toHaveCount(1);
  // Print lanes carry their amber edge (an inset shadow Tailwind must have built).
  if (rows.some((r) => r.v[2] > 0)) {
    const printLane = gantt.locator('[data-medium="Print"][data-on="true"]').first();
    expect(await printLane.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/);
  }
  await shot(page, "desktop-gantt");

  // 5. TV switched off: the address has no TV, and no TV lane is left.
  await gantt.getByRole("group", { name: "Media shown" }).getByRole("button", { name: "TV", exact: true }).click();
  await expect(page).toHaveURL(/[?&]media=/);
  const media = new URL(page.url()).searchParams.get("media")!.split(",");
  expect(media).not.toContain("TV");
  expect(media).toEqual(["Digital", "Print", "OOH"]);
  await expect(page.getByTestId("calendar-gantt").getByRole("button", { name: "TV", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("calendar-gantt").locator('[data-medium="TV"]')).toHaveCount(0);
  await expect(page.getByTestId("calendar-gantt").locator('[data-medium="Digital"]').first()).toBeVisible();

  // 6. Sheet view for Oct'26: the Grand Total is his cell, 39.327 (the PRD acceptance number).
  await page.goto("/calendar");
  await page.getByRole("navigation", { name: "Calendar view" }).getByRole("link", { name: "Sheet view" }).click();
  await expect(page).toHaveURL(/[?&]view=sheet\b/);
  await page.getByRole("navigation", { name: "Sheet month" }).getByRole("link", { name: "Oct'26", exact: true }).click();
  await expect(page).toHaveURL(/[?&]sheet=2026-10\b/);
  const sheet = page.getByTestId("calendar-sheet");
  await expect(sheet).toContainText("CB Media Activity & Spending Amount (Mn) · October 2026");
  const grandCells = page.getByTestId("sheet-grand-total").locator("td");
  await expect(grandCells.last()).toHaveText("39.327");
  await expect(grandCells.last()).toHaveText(sheetText(grands.get("Oct'26")![4]));
  await expect(page.getByTestId("calendar-notes")).toContainText("Oct'26 media notes");
  await shot(page, "desktop-sheet-oct");

  // 7. FY to date: the Grand Total is the sum of his four months' Grand Total cells, medium by medium.
  await page.getByRole("navigation", { name: "Sheet month" }).getByRole("link", { name: "FY to date", exact: true }).click();
  await expect(page).toHaveURL(/[?&]sheet=fytd\b/);
  await expect(sheet).toContainText("FY 2026-27 to date (Jul'26 to Oct'26)");
  const four = [...grands.values()];
  const expected = [0, 1, 2, 3, 4].map((k) => { const s = sumOf(four.map((g) => g[k])); return s === 0 ? "" : sheetText(s); });
  await expect(grandCells).toHaveText(["Grand Total", ...expected]);
  await expect(page.getByTestId("calendar-notes")).toHaveCount(0);
  await expect(page.getByTestId("calendar-chart")).toBeVisible();
  await shot(page, "desktop-sheet-fytd");

  // 8. One business: the first group in the Gantt. The cards narrow to its rows; only its group is left.
  await page.goto("/calendar");
  const bizName = (await page.getByTestId("gantt-business-row").first().locator("td").first().textContent())!.trim();
  const bizFytd = sumOf(rows.filter((r) => tidy(r.biz) === tidy(bizName)).map((r) => r.t));
  expect(bizFytd).toBeGreaterThan(0);
  expect(bizFytd).toBeLessThan(fytd);
  try {
    await chooseBusiness(page, bizName);
    await expect(page.getByTestId("cal-card-fytd")).toContainText(formatMn(bizFytd));
    await expect(page.getByTestId("cal-card-fytd")).not.toContainText(formatMn(fytd));
    await expect(page.getByTestId("gantt-business-row")).toHaveCount(1);
    await expect(page.getByTestId("gantt-business-row").locator("td").first()).toHaveText(bizName);
  } finally {
    await chooseBusiness(page, "All businesses");
  }
  await expect(page.getByTestId("cal-card-fytd")).toContainText(formatMn(fytd));

  // 9. Phone width: neither view scrolls the page sideways.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [url, testId, name] of [["/calendar", "calendar-gantt", "phone-gantt"], ["/calendar?view=sheet", "calendar-sheet", "phone-sheet"]] as const) {
    await page.goto(url);
    await expect(page.getByTestId(testId)).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(375);
    await shot(page, name);
  }
});
