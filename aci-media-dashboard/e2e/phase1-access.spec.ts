import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

// Phase 1 user flow (https://claude.ai/artifact/4dun3iBGTYWiDwicmX9E7h#phase-1), every box and arrow.
// Serial: the last test locks sign-in for 10 minutes on this throwaway server.
test.describe.configure({ mode: "serial" });

test("viewer opens the link and reads every page without signing in", async ({ page }) => {
  for (const p of ["/", "/spend", "/performance", "/digital", "/competitors", "/billing", "/uploads", "/settings"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBeLessThan(400);
  }
  await expect(page.getByRole("link", { name: "Admin sign in" })).toBeVisible();
});

test("viewer tries to change data and the server refuses", async ({ page }) => {
  const vendor = `E2E Viewer ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Vendor name").fill(vendor);
  await page.getByRole("button", { name: "Add vendor" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Only the admin can change data. Please sign in.");
  await page.reload();
  await expect(page.getByText(vendor)).toHaveCount(0);
});

test("viewer cannot download a backup", async ({ request }) => {
  const res = await request.get("/api/backup");
  expect(res.status()).toBe(403);
  expect(await res.text()).toBe("Only the admin can download a backup. Please sign in.");
});

test.describe("signed-in admin", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("sees Admin, downloads one backup file, and can sign out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^media-mind-backup-.*\.db$/);
    const head = (await fs.readFile(await download.path())).subarray(0, 16).toString("latin1");
    expect(head).toBe("SQLite format 3\u0000");
  });
});

test("admin password: wrong tries count down, the 5th locks, and the right password is refused while locked", async ({ page }) => {
  await page.goto("/sign-in");
  for (const left of [4, 3, 2, 1]) {
    await page.getByLabel("User name").fill(E2E_ADMIN.user);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p[role=alert]")).toHaveText(`Wrong user name or password. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }
  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Too many wrong tries. Sign-in is locked until");

  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Too many wrong tries");
  await expect(page).toHaveURL(/\/sign-in$/);
});
