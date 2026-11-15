import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { APP_ID, STORE_FILE, toFileUrl } from "./client";
import { fileStamp } from "./backup";

const NOT_BACKUP = "This is not a Media Mind backup file.";

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
  try {
    const r = await check.execute("SELECT value FROM meta WHERE key = 'app'");
    if (r.rows[0]?.value !== APP_ID) throw new Error(NOT_BACKUP);
  } catch {
    throw new Error(NOT_BACKUP);
  } finally {
    check.close();
  }

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
