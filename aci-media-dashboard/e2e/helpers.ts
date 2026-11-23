import { expect, type Locator, type Page } from "@playwright/test";
import { clientFile, makeXlsx } from "../src/lib/ingest/test-workbooks";

// Shared steps for the Data Entry upload specs (phase2a, phase2b, phase2c): one card per file, then the
// Check before publishing dialog.

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type Upload = { name: string; mimeType: string; buffer: Buffer };

/** A client file from Asset/xlsx, optionally under another name. */
export const fileOf = (rel: string, name = rel.split("/").pop()!): Upload => ({ name, mimeType: XLSX_TYPE, buffer: clientFile(rel) });
/** A one-sheet workbook built in memory. */
export const sheetFile = (name: string, rows: unknown[][], sheetName = "S"): Upload => ({ name, mimeType: XLSX_TYPE, buffer: makeXlsx([{ name: sheetName, rows }]) });

/** Text for use inside a RegExp, matched literally. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Opens Upload Data and waits for its cards. */
export const openUpload = async (page: Page) => {
  await page.goto("/data-entry");
  await expect(page.getByTestId("upload-card").first()).toBeVisible();
};
/**
 * One Upload Data card by its id: "atl", "digital" (the card for a business with no Digital data yet),
 * "digital:<business slug>", "fy", "channel", "billing", "calendar" or "billboard".
 */
export const card = (page: Page, id: string) => page.locator(`[data-testid="upload-card"][data-card-id="${id}"]`);
/** The Check before publishing dialog. */
export const checkDialog = (page: Page) => page.getByRole("dialog");
/**
 * Gives the files to a card (`give`) until the dialog opens: a choice made before the page has hydrated is lost.
 * Returns the dialog once every file has been read (a large real file takes a while).
 */
const untilChecked = async (page: Page, files: Upload[], give: () => Promise<void>) => {
  const dialog = checkDialog(page);
  await expect(async () => {
    await give();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(dialog.getByTestId("preview-row")).toHaveCount(files.length, { timeout: 30_000 });
  return dialog;
};
/** Opens Upload Data, chooses the files on one card, and returns the dialog once every file has been read. */
export const uploadToCard = async (page: Page, id: string, files: Upload[]) => {
  await openUpload(page);
  return untilChecked(page, files, () => card(page, id).locator("input[type=file]").setInputFiles(files));
};
/** Opens Upload Data, drops the files on one card, and returns the dialog once every file has been read. */
export const dropOnCard = async (page: Page, id: string, files: Upload[]) => {
  await openUpload(page);
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: f.mimeType }));
    }
    return dt;
  }, files.map((f) => ({ name: f.name, mimeType: f.mimeType, base64: f.buffer.toString("base64") })));
  return untilChecked(page, files, () => card(page, id).dispatchEvent("drop", { dataTransfer }));
};
export const publishBtn = (page: Page) => checkDialog(page).getByRole("button", { name: "Publish", exact: true });
export const historyRows = async (page: Page) => {
  await page.goto("/data-entry?tab=history");
  return page.getByTestId("history-table").locator("tbody tr");
};

/** A file block's Ready chip. */
export const ready = (row: Locator) => row.getByText("Ready", { exact: true });
/** Waits until no preview request is running, so the block controls are enabled again. */
export const settled = (page: Page) => expect(page.locator("ul[aria-busy=true]")).toHaveCount(0);

/**
 * Picks `name` in a Business select when it is on the list, else "New business…" with the name typed in its box
 * and Enter (which sends it on a Digital file, and does nothing in the New category block).
 */
export const pickBusiness = async (page: Page, selectLabel: string, boxLabel: string, name: string) => {
  const select = page.getByLabel(selectLabel, { exact: true });
  if (await select.locator("option", { hasText: new RegExp(`^${escapeRegExp(name)}$`) }).count()) {
    await select.selectOption({ label: name });
    return;
  }
  await select.selectOption({ label: "New business…" });
  const box = page.getByLabel(boxLabel, { exact: true });
  await box.fill(name);
  await box.press("Enter");
};

/** Chooses a business in the shared Business filter (buttons when there are few, else the searchable dropdown). */
export const chooseBusiness = async (page: Page, name: string) => {
  const buttons = page.getByRole("group", { name: "Business" });
  if (await buttons.count()) return buttons.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: /^Business: / }).click();
  await page.getByLabel("Search businesses").fill(name);
  await page.getByRole("menuitemradio", { name, exact: true }).click();
};

/** Decides every new business in a file as new (Add all as new, or the one name's select), until it is Ready. */
export const addBusinessesAsNew = async (page: Page, row: Locator) => {
  await expect(ready(row).or(row.getByText("New business", { exact: true })).first()).toBeVisible();
  await settled(page);
  const all = row.getByRole("button", { name: "Add all as new" });
  if (await all.isVisible()) await all.click();
  else {
    for (const select of await row.getByLabel(/^Decision for /).all()) {
      if ((await select.inputValue()) === "") await select.selectOption({ label: "Add as new" });
    }
  }
  await expect(ready(row)).toBeVisible();
  await settled(page);
};
