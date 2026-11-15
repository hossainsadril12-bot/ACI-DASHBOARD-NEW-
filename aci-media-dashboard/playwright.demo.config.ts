import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN } from "./e2e/admin-credentials";

// Live walkthrough for presentations: visible browser, slowed down, data is kept afterwards.
// Runs only against the Neon dev branch (same guard as e2e). Run: npm run demo
const adminHash = "bcrypt:" + Buffer.from(bcrypt.hashSync(E2E_ADMIN.password, 10)).toString("base64url");
const dataDir = path.join(os.tmpdir(), `media-mind-e2e-${process.pid}`);

export default defineConfig({
  testDir: "./demo",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    headless: false,
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo: 350 },
    acceptDownloads: true,
  },
  projects: [
    { name: "admin-setup", testDir: "./e2e", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "e2e/.auth/admin.json" },
      dependencies: ["admin-setup"],
    },
  ],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { MEDIA_MIND_DATA_DIR: dataDir, ADMIN_USER: E2E_ADMIN.user, ADMIN_PASSWORD_HASH: adminHash },
  },
});
