import { test, expect, type Dialog, type Locator, type Page } from "@playwright/test";
import { makeXlsx } from "../src/lib/ingest/test-workbooks";
import { XLSX_TYPE, historyRows } from "./helpers";
import { currentFyStart, dhakaDate, fyMonthLabels } from "../src/lib/manual/rules";

// Phase 2 Part E: Manual Entry. Serial: one shared temp store; later tests use what earlier ones saved.
test.describe.configure({ mode: "serial" });

const VIEWER_NOTE = "Only the admin can change data. Sign in to edit.";
const CHANNEL_FILE = "e2e-manual-channel.xlsx";
const MONTH_HEADS = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];

/** A Channel Cost file with one Electronic row, "E2E TV One", 100,000 BDT in Jul'26. */
const channelBook = () => makeXlsx([
  { name: "Electronic", rows: [["SL", "Channel Name", ...MONTH_HEADS], [], [1, "E2E TV One", 100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100000]] },
  { name: "Digital", rows: [["SL", "Platform", ...MONTH_HEADS]] },
  { name: "Press & Radio", rows: [["SL", "Name", ...MONTH_HEADS]] },
]);

const openManual = async (page: Page) => {
  await page.goto("/data-entry?tab=manual");
  await expect(page.getByRole("group", { name: "Manual Entry sections" })).toBeVisible();
};
/** Clicks a switch button until its section shows (a click before hydration is lost). */
const showView = async (page: Page, label: string, id: string) => {
  const section = page.getByTestId(id);
  await expect(async () => {
    await page.getByRole("group", { name: "Manual Entry sections" }).getByRole("button", { name: label, exact: true }).click();
    await expect(section).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return section;
};
/** Types into a box until the editor reacts (typing before hydration is lost). */
const typeUntil = async (box: Locator, value: string, reacted: Locator) => {
  await expect(async () => {
    await box.fill(value);
    await expect(reacted).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};
/** A quarter button in a section's quarter row. */
const quarterButton = (section: Locator, label: string) =>
  section.getByRole("group", { name: "Quarter" }).getByRole("button", { name: label, exact: true });
/** Clicks a quarter button until it shows as chosen (a click before hydration is lost). */
const pickQuarter = async (section: Locator, label: string) => {
  const button = quarterButton(section, label);
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};
const QUARTER_LABELS = ["Q1 Jul–Sep", "Q2 Oct–Dec", "Q3 Jan–Mar", "Q4 Apr–Jun"];
/** The quarter Manual Entry should open on for an FY (design 1.1), worked out here on its own as the test's oracle. */
const openingQuarter = (fyStart: number): string => {
  const now = new Date();
  if (currentFyStart(now) !== fyStart) return "Full year";
  const month = Number(dhakaDate(now).slice(5, 7));
  return QUARTER_LABELS[Math.floor(((month + 5) % 12) / 3)];
};
/** A month column head such as Jul'26. */
const MONTH_HEAD = /^[A-Z][a-z]{2}'\d\d$/;

test("1. channel: edit an amount, Save & publish, History shows Manual edit, Restore brings the upload back", async ({ page }) => {
  const res = await page.request.post("/api/uploads/publish", {
    headers: { Origin: "http://localhost:3100" },
    multipart: { files: { name: CHANNEL_FILE, mimeType: XLSX_TYPE, buffer: channelBook() } },
  });
  expect(res.status()).toBe(200);

  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  await expect(channel.getByText("Channel cost · Electronic")).toBeVisible();
  await expect(channel.getByText("BDT · type amounts, add or remove rows, then Save & publish")).toBeVisible();
  await expect(channel.getByLabel("Channel 1", { exact: true })).toHaveValue("E2E TV One");
  await pickQuarter(channel, "Full year");
  const jul = channel.getByLabel("Channel 1 Jul'26", { exact: true });
  await expect(jul).toHaveValue("100000");
  await expect(channel.getByText("All saved")).toBeVisible();

  await typeUntil(jul, "250000", channel.getByText("Unsaved changes"));
  await channel.getByRole("button", { name: "Save & publish" }).click();
  await expect(channel.getByText("All saved")).toBeVisible();
  await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("250000");

  const rows = await historyRows(page);
  await expect(rows.first()).toContainText("Manual edit");
  await expect(rows.first()).toContainText("In use");
  const uploaded = rows.filter({ hasText: CHANNEL_FILE }).first();
  const accept = (d: Dialog) => d.accept();
  page.on("dialog", accept);
  await expect(async () => {
    await uploaded.getByRole("button", { name: "Restore" }).click();
    await expect(uploaded).toContainText("In use", { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  page.off("dialog", accept);

  await openManual(page);
  const restored = page.getByTestId("manual-channel");
  await pickQuarter(restored, "Full year");
  await expect(restored.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
});

const FY_BIZ = "E2E Manual Biz";
const FY_BRAND = "E2E Manual Brand";

/** Adds the business on Businesses & Brands unless it is already there. */
const ensureBusiness = async (page: Page, name: string) => {
  await page.goto("/businesses");
  await expect(page.getByRole("heading", { name: "Businesses & Brands" })).toBeVisible();
  if (await page.getByRole("link", { name, exact: true }).count()) return;
  await page.getByRole("button", { name: "Add business" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business name").fill(name);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
};

test("2. FY: add a brand with a new name, Save & publish, and it is on Businesses & Brands", async ({ page }) => {
  await ensureBusiness(page, FY_BIZ);
  await openManual(page);
  const fy = await showView(page, "FY media spend", "manual-fy");
  await fy.getByRole("button", { name: "+ Add brand" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Business", { exact: true }).selectOption({ label: FY_BIZ });
  await dialog.getByLabel("Brand", { exact: true }).selectOption({ label: "New brand…" });
  await dialog.getByLabel("New brand name").fill(FY_BRAND);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(fy.getByText(`FY media spend · ${FY_BRAND}`)).toBeVisible();
  await expect(fy.getByText(new RegExp(`^BDT Mn · ${FY_BIZ} · FY \\d{4}-\\d{2} months Jul to Jun, plus the last FY total$`))).toBeVisible();
  await expect(fy.getByText("Unsaved changes")).toBeVisible();
  await pickQuarter(fy, "Q1 Jul–Sep");
  await fy.getByLabel(/^TV Jul'\d\d$/).fill("1.5");
  await fy.getByRole("button", { name: "Save & publish" }).click();
  await expect(fy.getByText("All saved")).toBeVisible();
  await expect(fy.getByLabel("FY brand").locator("option:checked")).toHaveText(FY_BRAND);

  await page.goto("/businesses");
  await page.getByRole("link", { name: FY_BIZ, exact: true }).click();
  await expect(page.getByTestId("brands-table")).toContainText(FY_BRAND);
});

test("3. bills: add, edit and delete a bill; delete asks first; a missing vendor shows in red", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  await expect(bills.getByText(/^\d+ bills? · add a bill or change a status\. Each save publishes\.$/)).toBeVisible();
  const dialog = page.getByRole("dialog");
  const row = bills.getByTestId("manual-bills-table").locator("tbody tr").filter({ hasText: "E2E-001" });
  const search = bills.getByLabel("Search bills");

  await bills.getByRole("button", { name: "+ Add bill" }).click();
  await expect(dialog.getByText("Add bill", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Status", { exact: true })).toHaveValue("Finance/Audit");
  await expect(dialog.getByLabel("Submit Date", { exact: true })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter the name of the media / vendor.");
  await dialog.getByLabel("Name of the Media / Vendor", { exact: true }).fill("E2E Vendor One");
  await dialog.getByLabel("Bill No", { exact: true }).fill("E2E-001");
  await dialog.getByLabel("PO Amount", { exact: true }).fill("1000");
  await dialog.getByLabel("Bill Amount", { exact: true }).fill("800");
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog).toHaveCount(0);
  await search.fill("E2E-001");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Finance/Audit");

  await row.getByRole("button", { name: "Edit bill E2E-001" }).click();
  await expect(dialog.getByText(/^Edit bill · SL \d+$/)).toBeVisible();
  const diffBox = dialog.getByLabel("Bill Difference (blank = PO − Bill)", { exact: true });
  await expect(diffBox).toHaveValue(""); // 1000 - 800 is the derived value, so it shows blank
  await dialog.getByLabel("Bill Amount", { exact: true }).fill("900");
  await dialog.getByLabel("Status", { exact: true }).selectOption("Payment Done");
  await dialog.getByRole("button", { name: "Save & publish" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("Payment Done");

  // the saved difference followed the Bill Amount (100), so it is still the derived value and shows blank, not 200
  await row.getByRole("button", { name: "Edit bill E2E-001" }).click();
  await expect(dialog.getByLabel("Bill Amount", { exact: true })).toHaveValue("900");
  await expect(diffBox).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  await row.getByRole("button", { name: "Edit bill E2E-001" }).click();
  page.once("dialog", (d) => d.dismiss());
  await dialog.getByRole("button", { name: "Delete bill" }).click();
  await expect(dialog).toBeVisible(); // said no: nothing deleted
  await expect(row).toHaveCount(1);
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Delete bill E2E-001? You can bring it back from Upload History.");
    return d.accept();
  });
  await dialog.getByRole("button", { name: "Delete bill" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);

  const history = await historyRows(page);
  await expect(history.first()).toContainText("Manual edit");
  await expect(history.first()).toContainText("Billboard billing");
});

/** channelBook's FY: its months are Jul'26 to Jun'27. */
const CHANNEL_FY = 2026;

test("4. quarters: Channel cost opens on today's quarter, Full year shows 12, and an edit in a hidden month is saved", async ({ page }) => {
  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  const table = channel.getByTestId("channel-table");
  const monthHeads = table.getByRole("columnheader", { name: MONTH_HEAD });
  const labels = fyMonthLabels(CHANNEL_FY);
  const opening = openingQuarter(CHANNEL_FY);
  const q = QUARTER_LABELS.indexOf(opening);
  await expect(quarterButton(channel, opening)).toHaveAttribute("aria-pressed", "true");
  await expect(monthHeads).toHaveText(q < 0 ? labels : labels.slice(q * 3, q * 3 + 3)); // 3 columns while today is in FY 2026-27
  await expect(table.getByRole("columnheader", { name: "SL", exact: true })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Channel", exact: true })).toBeVisible();
  await expect(channel.getByRole("button", { name: "Remove E2E TV One" })).toBeVisible();

  await pickQuarter(channel, "Full year");
  await expect(monthHeads).toHaveText(labels);

  // Type Aug'26 in Q1, hide it with Q2, then save: Aug is still sent.
  await pickQuarter(channel, "Q1 Jul–Sep");
  await expect(monthHeads).toHaveText(["Jul'26", "Aug'26", "Sep'26"]);
  const aug = channel.getByLabel("Channel 1 Aug'26", { exact: true });
  await typeUntil(aug, "4321", channel.getByText("Unsaved changes"));
  await pickQuarter(channel, "Q2 Oct–Dec");
  await expect(monthHeads).toHaveText(["Oct'26", "Nov'26", "Dec'26"]);
  await expect(aug).toHaveCount(0);
  await expect(channel.getByText("Unsaved changes")).toBeVisible();
  await channel.getByRole("button", { name: "Save & publish" }).click();
  await expect(channel.getByText("All saved")).toBeVisible();
  await expect(quarterButton(channel, "Q2 Oct–Dec")).toHaveAttribute("aria-pressed", "true"); // the remount after a save keeps the choice

  // After a reload the stored version has the hidden months: Jul as it was, Aug as typed.
  await openManual(page);
  const again = page.getByTestId("manual-channel");
  await pickQuarter(again, "Q1 Jul–Sep");
  await expect(again.getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
  await expect(again.getByLabel("Channel 1 Aug'26", { exact: true })).toHaveValue("4321");

  // FY media spend shares the choice and keeps Media and Last FY.
  const fy = await showView(page, "FY media spend", "manual-fy");
  await expect(quarterButton(fy, "Q1 Jul–Sep")).toHaveAttribute("aria-pressed", "true");
  await pickQuarter(fy, "Q3 Jan–Mar");
  const fyTable = fy.getByTestId("fy-table");
  await expect(fyTable.getByRole("columnheader", { name: MONTH_HEAD })).toHaveText([/^Jan'\d\d$/, /^Feb'\d\d$/, /^Mar'\d\d$/]);
  await expect(fyTable.getByRole("columnheader", { name: "Media", exact: true })).toBeVisible();
  await expect(fyTable.getByRole("columnheader", { name: "Last FY", exact: true })).toBeVisible();
  await expect(fy.getByLabel("TV Last FY", { exact: true })).toBeVisible();
  const channelAgain = await showView(page, "Channel cost", "manual-channel");
  await expect(quarterButton(channelAgain, "Q3 Jan–Mar")).toHaveAttribute("aria-pressed", "true");
});

/** Every month column (and Last FY) has its first-row box right under its heading, at the heading's right edge. */
const expectBoxesUnderHeadings = async (table: Locator, headNames: (string | RegExp)[], expected: number) => {
  const heads = table.locator("thead th");
  const firstRowCells = table.locator("tbody tr").first().locator("td");
  const count = await heads.count();
  let checked = 0;
  for (let i = 0; i < count; i++) {
    const text = ((await heads.nth(i).textContent()) ?? "").trim();
    if (!headNames.some((n) => (typeof n === "string" ? n === text : n.test(text)))) continue;
    const th = await heads.nth(i).boundingBox();
    // the heading's text ends at the cell's right edge less its padding; the box ends at its own cell's edge less the same padding
    const pad = await heads.nth(i).evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    const box = await firstRowCells.nth(i).locator("input").boundingBox();
    expect(th, `heading ${text}`).not.toBeNull();
    expect(box, `box under ${text}`).not.toBeNull();
    expect(Math.abs(th!.x + th!.width - pad - (box!.x + box!.width)), `${text}: box right edge vs heading right edge`).toBeLessThanOrEqual(2);
    expect(box!.x, `${text}: box left edge`).toBeGreaterThanOrEqual(th!.x - 1);
    checked++;
  }
  expect(checked).toBe(expected);
};

test("4b. quarters: on Q1 each month box sits under its right-aligned heading on Channel cost and FY media spend", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  await pickQuarter(channel, "Q1 Jul–Sep");
  await expectBoxesUnderHeadings(channel.getByTestId("channel-table"), [MONTH_HEAD], 3);

  const fy = await showView(page, "FY media spend", "manual-fy");
  await pickQuarter(fy, "Q1 Jul–Sep");
  await expectBoxesUnderHeadings(fy.getByTestId("fy-table"), [MONTH_HEAD, "Last FY"], 4);
});

/** The table fills (at least 95% of) its card's table container. */
const expectTableFillsCard = async (table: Locator) => {
  const t = await table.boundingBox();
  const c = await table.locator("xpath=ancestor::*[@data-slot='table-container'][1]").boundingBox();
  expect(t).not.toBeNull();
  expect(c).not.toBeNull();
  expect(t!.width / c!.width).toBeGreaterThanOrEqual(0.95);
};

test("4c. the Channel and FY tables fill the card on Q1, and Full year keeps boxes under headings without a side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= 1280);
  await openManual(page);
  const channel = page.getByTestId("manual-channel");
  await pickQuarter(channel, "Q1 Jul–Sep");
  await expectTableFillsCard(channel.getByTestId("channel-table"));
  const fy = await showView(page, "FY media spend", "manual-fy");
  await pickQuarter(fy, "Q1 Jul–Sep");
  await expectTableFillsCard(fy.getByTestId("fy-table"));

  await pickQuarter(fy, "Full year");
  expect(await noSideScroll()).toBe(true);
  await expectBoxesUnderHeadings(fy.getByTestId("fy-table"), [MONTH_HEAD, "Last FY"], 13);
  const channelAgain = await showView(page, "Channel cost", "manual-channel");
  await pickQuarter(channelAgain, "Full year");
  expect(await noSideScroll()).toBe(true);
  await expectBoxesUnderHeadings(channelAgain.getByTestId("channel-table"), [MONTH_HEAD], 12);
});

test("5. bills: the Submit Date range narrows the list and the count", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  const dialog = page.getByRole("dialog");
  for (const [no, sb] of [["E2E-RANGE-A", "2026-08-15"], ["E2E-RANGE-B", "2026-10-20"]]) {
    await bills.getByRole("button", { name: "+ Add bill" }).click();
    await dialog.getByLabel("Name of the Media / Vendor", { exact: true }).fill(`Vendor ${no}`);
    await dialog.getByLabel("Bill No", { exact: true }).fill(no);
    await dialog.getByLabel("Submit Date", { exact: true }).fill(sb);
    await dialog.getByRole("button", { name: "Save & publish" }).click();
    await expect(dialog).toHaveCount(0);
  }
  const table = bills.getByTestId("manual-bills-table");
  const rowA = table.locator("tbody tr").filter({ hasText: "E2E-RANGE-A" });
  const rowB = table.locator("tbody tr").filter({ hasText: "E2E-RANGE-B" });
  const count = bills.getByText(/^\d+ of \d+ bills$/);
  const from = bills.getByLabel("Submitted from", { exact: true });
  const to = bills.getByLabel("to", { exact: true });
  await expect(count).toHaveCount(0); // Any to Any and no search: no count line
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(from.locator("option").first()).toHaveText("Any");
  await expect(from.locator("option")).toContainText(["Any", "Aug'26", "Oct'26"]);
  await expect(to.locator("option")).toContainText(["Any", "Aug'26", "Oct'26"]);

  await bills.getByLabel("Search bills").fill("E2E-RANGE");
  await expect(count).toHaveText(/^2 of \d+ bills$/);
  await from.selectOption({ label: "Oct'26" });
  await expect(count).toHaveText(/^1 of \d+ bills$/);
  await expect(rowB).toHaveCount(1);
  await expect(rowA).toHaveCount(0);
  await from.selectOption({ label: "Any" });
  await to.selectOption({ label: "Aug'26" });
  await expect(count).toHaveText(/^1 of \d+ bills$/);
  await expect(rowA).toHaveCount(1);
  await expect(rowB).toHaveCount(0);
  await from.selectOption({ label: "Oct'26" }); // From later than To: nothing matches
  await expect(count).toHaveText(/^0 of \d+ bills$/);
  await expect(table.getByText("No bills match.", { exact: true })).toBeVisible();

  await from.selectOption({ label: "Any" });
  await to.selectOption({ label: "Any" });
  await expect(count).toHaveText(/^2 of \d+ bills$/); // the search alone still counts
  await bills.getByLabel("Search bills").fill("");
  await expect(count).toHaveCount(0);
  await expect(table.getByText("No bills match.", { exact: true })).toHaveCount(0);
});

test("6. bills: Columns adds Brand and hides Bill No, and this browser remembers it", async ({ page }) => {
  await openManual(page);
  const bills = await showView(page, "OOH / billboard bills", "manual-bills");
  const head = (name: string) => bills.getByTestId("manual-bills-table").getByRole("columnheader", { name, exact: true });
  for (const name of ["SL", "Vendor", "Bill No", "Bill Amount", "Status", "Edit"]) await expect(head(name)).toHaveCount(1);
  for (const name of ["PO", "PO Amount", "Brand", "Location"]) await expect(head(name)).toHaveCount(0);

  const borderColor = await bills.getByRole("button", { name: "Columns", exact: true })
    .evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(borderColor).not.toBe("rgba(0, 0, 0, 0)");

  const menu = page.getByRole("menu");
  await expect(async () => {
    await bills.getByRole("button", { name: "Columns", exact: true }).click();
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(menu.getByRole("menuitemcheckbox")).toHaveText(["PO", "Bill No", "PO Amount", "Bill Amount", "Brand", "Location"]);
  const item = (name: string) => menu.getByRole("menuitemcheckbox", { name, exact: true });
  await expect(item("Bill No")).toHaveAttribute("aria-checked", "true");
  await expect(item("Bill Amount")).toHaveAttribute("aria-checked", "true");
  await expect(item("Brand")).toHaveAttribute("aria-checked", "false");
  await item("Brand").click();
  await expect(item("Brand")).toHaveAttribute("aria-checked", "true");
  await item("Bill No").click();
  await expect(item("Bill No")).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(head("Brand")).toHaveCount(1);
  await expect(head("Bill No")).toHaveCount(0);
  await expect(head("Bill Amount")).toHaveCount(1);

  await page.reload();
  const again = await showView(page, "OOH / billboard bills", "manual-bills");
  const headAgain = (name: string) => again.getByTestId("manual-bills-table").getByRole("columnheader", { name, exact: true });
  await expect(headAgain("Brand")).toHaveCount(1);
  await expect(headAgain("Bill No")).toHaveCount(0);
});

test.describe("viewer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees the tab read-only with the note, no Save, Add or Remove, and can switch quarters", async ({ page }) => {
    await openManual(page);
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const channel = page.getByTestId("manual-channel");
    await pickQuarter(channel, "Q1 Jul–Sep");
    await expect(channel.getByLabel("Channel 1 Oct'26", { exact: true })).toHaveCount(0);
    await pickQuarter(channel, "Full year");
    await expect(channel.getByLabel("Channel 1 Oct'26", { exact: true })).toBeDisabled();
    await expect(channel.getByLabel("Channel 1 Jul'26", { exact: true })).toBeDisabled();
    await expect(channel.getByLabel("Channel 1", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save & publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add channel" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  });

  test("sees FY media spend with its boxes off and no Add brand", async ({ page }) => {
    await openManual(page);
    const fy = await showView(page, "FY media spend", "manual-fy");
    await expect(fy.getByRole("button", { name: "+ Add brand" })).toHaveCount(0);
    await pickQuarter(fy, "Q1 Jul–Sep");
    await expect(fy.getByLabel(/^TV Jul'\d\d$/)).toBeDisabled();
    await expect(fy.getByLabel("FY brand")).toBeEnabled();
  });

  test("sees the bills with no Add bill or Edit, and can still filter and pick columns", async ({ page }) => {
    await openManual(page);
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    await expect(bills.getByTestId("manual-bills-table")).toBeVisible();
    await expect(bills.getByRole("button", { name: "+ Add bill" })).toHaveCount(0);
    await expect(bills.getByRole("button", { name: /^Edit bill/ })).toHaveCount(0);
    await expect(bills.getByLabel("Search bills")).toBeEnabled();
    await expect(bills.getByLabel("Submitted from", { exact: true })).toBeEnabled();
    await expect(bills.getByLabel("to", { exact: true })).toBeEnabled();
    await bills.getByLabel("Submitted from", { exact: true }).selectOption({ label: "Oct'26" });
    await expect(bills.getByText(/^\d+ of \d+ bills$/)).toBeVisible();
    await expect(bills.getByRole("button", { name: "Columns", exact: true })).toBeEnabled();
  });
});

test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  const VIEWS: [string, string][] = [["Channel cost", "manual-channel"], ["FY media spend", "manual-fy"], ["OOH / billboard bills", "manual-bills"]];
  const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= 375);
  /** The table's own scroll box ends inside the screen. */
  const tableBox = (section: Locator) => section.locator('[data-slot="table-container"]').first();

  test("each editor's table scrolls inside its card and the page does not scroll sideways", async ({ page }) => {
    await openManual(page);
    await page.waitForLoadState("networkidle");
    expect(await noSideScroll(page)).toBe(true);
    for (const [label, id] of VIEWS) {
      const section = await showView(page, label, id);
      expect(await noSideScroll(page), label).toBe(true);
      expect(await tableBox(section).evaluate((el) => el.getBoundingClientRect().right <= 375), label).toBe(true);
    }
    // The 12-month channel table is wider than a phone: it scrolls inside its own box.
    const channel = await showView(page, "Channel cost", "manual-channel");
    await pickQuarter(channel, "Full year");
    expect(await tableBox(channel).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test("the bill dialog fits the screen", async ({ page }) => {
    await openManual(page);
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    await bills.getByRole("button", { name: "+ Add bill" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
  });

  test("the quarter row and the bills toolbar stay inside the screen", async ({ page }) => {
    await openManual(page);
    for (const [label, id] of VIEWS.slice(0, 2)) {
      const section = await showView(page, label, id);
      const row = section.getByTestId("quarter-row");
      await expect(row).toBeVisible();
      expect(await row.evaluate((el) => el.getBoundingClientRect().right <= 375), label).toBe(true);
      await pickQuarter(section, "Q4 Apr–Jun"); // the last button: reached by scrolling inside the row's own box
      expect(await noSideScroll(page), label).toBe(true);
    }
    const bills = await showView(page, "OOH / billboard bills", "manual-bills");
    const toolbar = bills.getByTestId("bills-toolbar");
    expect(await toolbar.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
    const menu = page.getByRole("menu");
    await expect(async () => {
      await bills.getByRole("button", { name: "Columns", exact: true }).click();
      await expect(menu).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    expect(await menu.evaluate((el) => el.getBoundingClientRect().right <= 375)).toBe(true);
    expect(await noSideScroll(page)).toBe(true);
  });

  test.describe("viewer on a phone", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("sees the note and the editors without side scroll", async ({ page }) => {
      await openManual(page);
      await expect(page.getByText(VIEWER_NOTE)).toBeVisible();
      for (const [label, id] of VIEWS) {
        await showView(page, label, id);
        expect(await noSideScroll(page), label).toBe(true);
      }
    });
  });
});
