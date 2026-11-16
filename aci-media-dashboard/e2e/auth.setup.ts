import { test as setup, expect } from "@playwright/test";
import { E2E_ADMIN } from "./admin-credentials";

setup("sign in as the admin", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("User name").fill(E2E_ADMIN.user);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
