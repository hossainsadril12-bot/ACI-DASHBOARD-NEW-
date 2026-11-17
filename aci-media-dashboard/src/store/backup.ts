import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Store } from "./client";

export type BackupFile = { path: string; size: number; cleanup: () => Promise<void> };

const TEMP_NAME = /^media-mind-backup-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.db$/;
const STALE_MS = 60 * 60 * 1000;

/** Removes temp backups older than an hour that a dropped download left behind. Only our own temp names; errors are ignored. */
async function removeStaleBackupFiles(dir: string): Promise<void> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const cutoff = Date.now() - STALE_MS;
  for (const name of names) {
    if (!TEMP_NAME.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if ((await fs.stat(file)).mtimeMs < cutoff) await fs.rm(file, { force: true });
    } catch {
      // In use, already gone or not ours to remove: leave it.
    }
  }
}

/** A consistent copy of the whole store as one SQLite file in the OS temp folder. Safe while the app runs. The caller must call cleanup(). */
export async function createBackupFile(store: Store): Promise<BackupFile> {
  await removeStaleBackupFiles(os.tmpdir());
  const file = path.join(os.tmpdir(), `media-mind-backup-${randomUUID()}.db`);
  const cleanup = () => fs.rm(file, { force: true });
  try {
    await store.run(sql`VACUUM INTO ${file}`);
    const { size } = await fs.stat(file);
    return { path: file, size, cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/** The same backup as bytes in memory. */
export async function createBackup(store: Store): Promise<Buffer> {
  const file = await createBackupFile(store);
  try {
    return await fs.readFile(file.path);
  } finally {
    await file.cleanup();
  }
}

export function fileStamp(now: Date): string {
  return now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

export function backupFileName(now: Date = new Date()): string {
  return `media-mind-backup-${fileStamp(now)}.db`;
}
