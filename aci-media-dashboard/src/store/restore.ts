import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { APP_ID, STORE_FILE, toFileUrl } from "./client";

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
  if (existsSync(target)) {
    const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    previous = path.join(dataDir, `media-mind.before-restore-${stamp}.db`);
    await fs.rename(target, previous);
    for (const ext of ["-wal", "-shm"]) {
      if (existsSync(target + ext)) await fs.rename(target + ext, previous + ext);
    }
  }
  await fs.copyFile(backupPath, target);
  return { previous };
}
