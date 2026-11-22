import { test, expect, type Dialog, type Locator, type Page } from "@playwright/test";
import { makeXlsx } from "../src/lib/ingest/test-workbooks";
import { XLSX_TYPE, historyRows } from "./helpers";

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
  await expect(page.getByTestId("manual-channel").getByLabel("Channel 1 Jul'26", { exact: true })).toHaveValue("100000");
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
  await fy.getByLabel(/^TV Jul'\d\d$/).fill("1.5");
  await fy.getByRole("button", { name: "Save & publish" }).click();
  await expect(fy.getByText("All saved")).toBeVisible();
  await expect(fy.getByLabel("FY brand").locator("option:checked")).toHaveText(FY_BRAND);

  await page.goto("/businesses");
  await page.getByRole("link", { name: FY_BIZ, exact: true }).click();
  await expect(page.getByTestId("brands-table")).toContainText(FY_BRAND);
});

test.describe("viewer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sees the tab read-only with the note, and no Save, Add or Remove", async ({ page }) => {
    await openManual(page);
    const note = page.getByText(VIEWER_NOTE);
    await expect(note).toBeVisible();
    await expect(note.locator("..").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    const channel = page.getByTestId("manual-channel");
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
    await expect(fy.getByLabel(/^TV Jul'\d\d$/)).toBeDisabled();
    await expect(fy.getByLabel("FY brand")).toBeEnabled();
  });
});
