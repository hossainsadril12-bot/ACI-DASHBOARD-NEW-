import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN } from "./e2e/admin-credentials";

// A dedicated dev server on port 3100 with a fresh temp store and a test-only admin,
// so e2e never uses a real data folder or the real admin password.
const adminHash = "bcrypt:" + Buffer.from(bcrypt.hashSync(E2E_ADMIN.password, 10)).toString("base64url");
const dataDir = path.join(os.tmpdir(), `media-mind-e2e-${process.pid}`);

export default defineConfig({
  // One dev server and one shared Neon dev branch: run specs one at a time.
  workers: 1,
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: "http://localhost:3100" },
  projects: [
    { name: "admin-setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["admin-setup"],
      testIgnore: /phase1-.*\.spec\.ts/,
    },
    { name: "phase1-flow", use: { ...devices["Desktop Chrome"] }, testMatch: /phase1-.*\.spec\.ts/, dependencies: ["admin-setup"] },
  ],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { MEDIA_MIND_DATA_DIR: dataDir, ADMIN_USER: E2E_ADMIN.user, ADMIN_PASSWORD_HASH: adminHash },
  },
});
