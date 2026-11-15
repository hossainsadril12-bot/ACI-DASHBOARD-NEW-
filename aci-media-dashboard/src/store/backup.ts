import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Store } from "./client";

/** A consistent copy of the whole store as one SQLite file. Safe while the app runs. */
export async function createBackup(store: Store): Promise<Buffer> {
  const file = path.join(os.tmpdir(), `media-mind-backup-${randomUUID()}.db`);
  try {
    await store.run(sql`VACUUM INTO ${file}`);
    return await fs.readFile(file);
  } finally {
    await fs.rm(file, { force: true });
  }
}

export function fileStamp(now: Date): string {
  return now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

export function backupFileName(now: Date = new Date()): string {
  return `media-mind-backup-${fileStamp(now)}.db`;
}
