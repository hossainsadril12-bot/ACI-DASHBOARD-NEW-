import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Store } from "./client";

export type BackupFile = { path: string; size: number; cleanup: () => Promise<void> };

/** A consistent copy of the whole store as one SQLite file in the OS temp folder. Safe while the app runs. The caller must call cleanup(). */
export async function createBackupFile(store: Store): Promise<BackupFile> {
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
