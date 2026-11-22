import { test, expect } from "@playwright/test";
import { PRD_PAGES } from "../src/components/shell/nav-items";

test("sidebar shows every PRD page", async ({ page }) => {
  await page.goto("/data-entry");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const s of ["Campaign Performance", "Media Spend", "Channel Wise Spend", "Billing & Statement", "Settings"]) {
    const head = nav.getByRole("button", { name: new RegExp(s) });
    if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
  }
  for (const p of PRD_PAGES) await expect(nav.getByRole("link", { name: p.label, exact: true }), p.code).toBeVisible();
});

test("add a brand and a rival in settings", async ({ page }) => {
  const brand = `E2E Brand ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByLabel("Business").selectOption({ label: "Hygiene" });
  await page.getByRole("button", { name: "Add brand" }).click();
  const row = page.getByTestId(`brand-${brand}`);
  await expect(row).toBeVisible();
  await row.getByLabel(`Rival for ${brand}`).fill("Rival One");
  await row.getByRole("button", { name: "Add rival" }).click();
  await expect(row.getByText("Rival One")).toBeVisible();
});

test("template download returns an xlsx", async ({ request }) => {
  const res = await request.get("/api/templates/spend");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("aci-spend-template.xlsx");
});
