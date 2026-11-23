import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { gte, like } from "drizzle-orm";

// Delete the run's temp store folder, and only a media-mind-e2e-* folder directly inside the OS temp folder.
function removeTempStore(dir: string | undefined) {
  if (!dir) return;
  const tmp = path.resolve(os.tmpdir());
  const target = path.resolve(dir);
  if (path.dirname(target) !== tmp || !path.basename(target).startsWith("media-mind-e2e-")) return;
  const remove = () => fs.rmSync(target, { recursive: true, force: true });
  try {
    remove();
  } catch {
    // On Windows the dev server still holds the store open here, so try again when the test process exits.
    process.once("exit", () => {
      try {
        remove();
      } catch {
        // Best effort: a leftover temp folder must not fail the run.
      }
    });
  }
}

// Remove data created by e2e runs. Brands cascade to campaigns, budgets, rivals, spend and competitor rows;
// bills cascade to their reminders. Reminders the Home "Remind" button put on other bills go by start time.
export default async function globalTeardown() {
  removeTempStore(process.env.E2E_DATA_DIR);
  loadEnvConfig(process.cwd());
  const { getDb } = await import("../src/db/client");
  const { bills, brands, historyLog, reminders, sourceOwners, tvStations, uploads, vendors } = await import("../src/db/schema");
  const db = getDb();
  await db.delete(brands).where(like(brands.name, "E2E %"));
  await db.delete(uploads).where(like(uploads.fileName, "e2e-%"));
  await db.delete(tvStations).where(like(tvStations.name, "E2E %"));
  await db.delete(bills).where(like(bills.billNo, "E2E-%"));
  await db.delete(vendors).where(like(vendors.name, "E2E %"));
  if (process.env.E2E_STARTED_AT) await db.delete(reminders).where(gte(reminders.createdAt, process.env.E2E_STARTED_AT));
  if (process.env.E2E_STARTED_AT) await db.delete(historyLog).where(gte(historyLog.at, process.env.E2E_STARTED_AT));
  if (process.env.E2E_SOURCE_OWNERS) {
    const saved = JSON.parse(process.env.E2E_SOURCE_OWNERS) as (typeof sourceOwners.$inferSelect)[];
    await db.delete(sourceOwners);
    if (saved.length) await db.insert(sourceOwners).values(saved);
  }
}
