import { test, expect, type Page } from "@playwright/test";
import { chooseBusiness as choose } from "./helpers";

// The shared Business filter keeps its choice across pages and a refresh, and is absent where the PRD hides it.

const current = async (page: Page, name: string) => {
  const buttons = page.getByRole("group", { name: "Business" });
  if (await buttons.count()) return expect(buttons.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  return expect(page.getByRole("button", { name: `Business: ${name}` })).toBeVisible();
};

test("the Business filter is remembered across pages and refreshes", async ({ page }) => {
  await page.goto("/fy-spend");
  const first = page.getByRole("group", { name: "Business" }).getByRole("button").nth(1);
  const name = (await first.count())
    ? (await first.textContent())!.trim()
    : "Toiletries";
  await choose(page, name);
  await current(page, name);
  await page.goto("/atl");
  await current(page, name);
  await page.reload();
  await current(page, name);
  await choose(page, "All businesses");
  await current(page, "All businesses");
});

test("pages the PRD keeps unfiltered show no Business filter", async ({ page }) => {
  for (const p of ["/channel/electronic", "/data-entry", "/settings/access"]) {
    await page.goto(p);
    await expect(page.getByRole("heading", { level: 1 }).first(), `${p} loaded`).toBeVisible();
    await expect(page.getByRole("group", { name: "Business" }), p).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Business: / }), p).toHaveCount(0);
  }
});
