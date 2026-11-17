import { expect, type Locator, type Page } from "@playwright/test";
import { clientFile, makeXlsx } from "../src/lib/ingest/test-workbooks";

// Shared steps for the Data Entry upload specs (phase2a, phase2b, phase2c).

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type Upload = { name: string; mimeType: string; buffer: Buffer };

/** A client file from Asset/xlsx, optionally under another name. */
export const fileOf = (rel: string, name = rel.split("/").pop()!): Upload => ({ name, mimeType: XLSX_TYPE, buffer: clientFile(rel) });
/** A one-sheet workbook built in memory. */
export const sheetFile = (name: string, rows: unknown[][], sheetName = "S"): Upload => ({ name, mimeType: XLSX_TYPE, buffer: makeXlsx([{ name: sheetName, rows }]) });

/** Text for use inside a RegExp, matched literally. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const openUpload = async (page: Page) => {
  await page.goto("/data-entry");
  await expect(page.getByTestId("upload-drop")).toBeVisible();
};
export const addFiles = (page: Page, files: Upload[]) => page.setInputFiles("input[type=file]", files);
export const publishBtn = (page: Page) => page.getByRole("button", { name: /Publish \d+ files?/ });
export const historyRows = async (page: Page) => {
  await page.goto("/data-entry?tab=history");
  return page.getByTestId("history-table").locator("tbody tr");
};

/** A preview row's Ready chip. */
export const ready = (row: Locator) => row.getByText("Ready", { exact: true });
/** Waits until no preview request is running, so the row controls are enabled again. */
export const settled = (page: Page) => expect(page.locator("ul[aria-busy=true]")).toHaveCount(0);

/**
 * Picks `name` in a Business select when it is on the list, else "New business…" with the name typed in its box
 * and Enter (which sends it on a Digital row, and does nothing in the New category block).
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
