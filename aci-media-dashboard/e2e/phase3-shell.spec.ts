import { test, expect, type Page } from "@playwright/test";
import { PRD_PAGES } from "../src/components/shell/nav-items";

// Phase 3 shell flow from an EMPTY store (runs before any upload). Do not create businesses or upload here.

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const openAllGroups = async (page: Page) => {
  for (const head of await nav(page).getByRole("button").all()) {
    if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
  }
};

test("every sidebar link opens its page; unbuilt pages name their file", async ({ page }) => {
  await page.goto("/");
  for (const p of PRD_PAGES) {
    await openAllGroups(page);
    await nav(page).getByRole("link", { name: p.label, exact: true }).click();
    await expect(nav(page).getByRole("link", { name: p.label, exact: true }), p.code).toHaveAttribute("aria-current", "page");
    if (!p.built) {
      await expect(page.getByRole("heading", { name: `${p.code} ${p.label}` })).toBeVisible();
      // .first(): while the page streams in, the fallback and the final note can both be in the DOM for a moment.
      await expect(page.getByText("This page is being built.").first()).toBeVisible();
      await expect(page.getByText(p.files ? `It will read: ${p.files}` : p.note!).first()).toBeVisible();
    }
  }
});

test("the admin gets the upload card link, and it opens that card", async ({ page }) => {
  await page.goto("/fy-spend");
  await page.getByRole("link", { name: "Open its upload card" }).click();
  await expect(page).toHaveURL(/\/data-entry#card-fy$/);
  await expect(page.locator("#card-fy")).toBeInViewport();
});

test.describe("viewer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("sees the being-built note with no upload link", async ({ page }) => {
    await page.goto("/fy-spend");
    await expect(page.getByText("This page is being built.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open its upload card" })).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("the Menu drawer opens, navigates and closes", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page)).toBeHidden();
    const drawer = page.getByRole("dialog");
    // The click can land before the page hydrates; retry until the drawer opens.
    await expect(async () => {
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(drawer).toBeVisible({ timeout: 1500 });
    }).toPass();
    await drawer.getByRole("button", { name: /Media Spend/ }).click();
    await drawer.getByRole("link", { name: "FY Media Spend", exact: true }).click();
    await expect(page).toHaveURL(/\/fy-spend$/);
    await expect(drawer).toBeHidden();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(375);
  });
});
