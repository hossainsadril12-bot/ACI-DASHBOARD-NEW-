import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { APP_ID, STORE_FILE, toFileUrl } from "./client";
import { fileStamp } from "./backup";

const NOT_BACKUP = "This is not a Media Mind backup file.";
export const NEWER_BACKUP = "This backup was made by a newer version of Media Mind. Update the app first, then restore.";

/** The `when` of the newest migration this app ships. Drizzle stores it as created_at in __drizzle_migrations. */
async function appNewestMigration(): Promise<number> {
  return newestMigration(JSON.parse(await fs.readFile(path.join(process.cwd(), "drizzle-store", "meta", "_journal.json"), "utf8")));
}

/** The newest `when` in a Drizzle journal. Throws on an empty or broken journal, which would otherwise make every backup look newer. */
export function newestMigration(journal: unknown): number {
  const entries = (journal as { entries?: unknown } | null)?.entries;
  const whens = Array.isArray(entries) ? entries.map((e) => (e as { when?: unknown } | null)?.when) : [];
  if (whens.length === 0 || !whens.every((w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0)) {
    throw new Error("The app's migration list is missing or broken.");
  }
  return Math.max(...whens);
}

/** Replaces the store file with a backup. Run only while the app is stopped. */
export async function restoreBackupFile(dataDir: string, backupPath: string, now: Date = new Date()): Promise<{ previous: string | null }> {
  const head = Buffer.alloc(16);
  const fh = await fs.open(backupPath, "r");
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  if (head.toString("latin1") !== "SQLite format 3\u0000") throw new Error(NOT_BACKUP);

  const check = createClient({ url: toFileUrl(backupPath) });
  let backupNewest: number;
  try {
    const r = await check.execute("SELECT value FROM meta WHERE key = 'app'");
    if (r.rows[0]?.value !== APP_ID) throw new Error(NOT_BACKUP);
    const m = await check.execute("SELECT max(created_at) AS t FROM __drizzle_migrations");
    backupNewest = Number(m.rows[0]?.t);
  } catch {
    throw new Error(NOT_BACKUP);
  } finally {
    check.close();
  }
  // An empty migrations table gives 0 and a text value gives NaN; neither is a real backup.
  if (!Number.isFinite(backupNewest) || backupNewest <= 0) throw new Error(NOT_BACKUP);
  if (backupNewest > (await appNewestMigration())) throw new Error(NEWER_BACKUP);

  const target = path.join(dataDir, STORE_FILE);
  let previous: string | null = null;
  const moved: string[] = [];
  if (existsSync(target)) {
    previous = path.join(dataDir, `media-mind.before-restore-${fileStamp(now)}.db`);
    await fs.rename(target, previous);
    moved.push("");
    for (const ext of ["-wal", "-shm"]) {
      if (existsSync(target + ext)) {
        await fs.rename(target + ext, previous + ext);
        moved.push(ext);
      }
    }
  }
  try {
    await fs.copyFile(backupPath, target);
  } catch (e) {
    // Put the old store back so a failed restore never leaves the app without data.
    if (previous) for (const ext of moved) await fs.rename(previous + ext, target + ext);
    throw e;
  }
  return { previous };
}
