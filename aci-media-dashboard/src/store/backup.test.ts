import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { meta } from "./schema";
import { createTestStore } from "./test-store";
import { openStore, toFileUrl, STORE_FILE } from "./client";
import { publishVersion, getActiveData } from "./datasets";
import { backupFileName, createBackup, createBackupFile } from "./backup";
import { NEWER_BACKUP, newestMigration, restoreBackupFile } from "./restore";

const dirs: string[] = [];
async function tempDir() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "mm-backup-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dirs.splice(0)) {
    // Windows can keep a file handle open briefly; a leftover temp folder is harmless.
    await fs.rm(d, { recursive: true, force: true }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EBUSY" && e.code !== "EPERM") throw e;
    });
  }
});

const publish = (store: Awaited<ReturnType<typeof createTestStore>>, data: string) =>
  publishVersion(store, { datasetKey: "billing", kind: "billing", label: data, source: "upload", summary: {}, data, file: { name: "b.xlsx", bytes: Buffer.from(data) } });

describe("backup", () => {
  it("is one SQLite file that holds the data and the original files", async () => {
    const store = await createTestStore();
    await publish(store, "billing-v1");
    const bytes = await createBackup(store);
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");

    const file = path.join(await tempDir(), "copy.db");
    await fs.writeFile(file, bytes);
    const copy = await openStore(toFileUrl(file));
    try {
      expect((await getActiveData(copy, "billing"))?.data).toBe("billing-v1");
    } finally {
      copy.$client.close();
    }
  });

  it("createBackupFile writes a real SQLite file in the temp folder that cleanup removes", async () => {
    const store = await createTestStore();
    await publish(store, "billing-v1");
    const file = await createBackupFile(store);
    try {
      expect(path.dirname(file.path)).toBe(os.tmpdir());
      const bytes = await fs.readFile(file.path);
      expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");
      expect(file.size).toBe(bytes.length);
    } finally {
      await file.cleanup();
    }
    await expect(fs.stat(file.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("createBackup still returns the same bytes as the backup file", async () => {
    const store = await createTestStore();
    await publish(store, "billing-v1");
    const file = await createBackupFile(store);
    try {
      expect((await createBackup(store)).equals(await fs.readFile(file.path))).toBe(true);
    } finally {
      await file.cleanup();
    }
  });

  it("createBackupFile first removes its own temp files older than an hour, and nothing else", async () => {
    const id = randomUUID();
    const old = path.join(os.tmpdir(), `media-mind-backup-${id}.db`);
    const fresh = path.join(os.tmpdir(), `media-mind-backup-${randomUUID()}.db`);
    const unrelated = path.join(os.tmpdir(), `mm-unrelated-${id}.db`);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const f of [old, fresh, unrelated]) await fs.writeFile(f, "x");
    await fs.utimes(old, twoHoursAgo, twoHoursAgo);
    await fs.utimes(unrelated, twoHoursAgo, twoHoursAgo);
    try {
      const file = await createBackupFile(await createTestStore());
      await file.cleanup();
      await expect(fs.stat(old)).rejects.toMatchObject({ code: "ENOENT" });
      await fs.stat(fresh);
      await fs.stat(unrelated);
    } finally {
      for (const f of [old, fresh, unrelated]) await fs.rm(f, { force: true });
    }
  });

  it("names the file with date and time", () => {
    expect(backupFileName(new Date("2026-11-15T09:05:00Z"))).toBe("media-mind-backup-2026-11-15-09-05.db");
  });
});

describe("restoreBackupFile", () => {
  it("puts the backup in place and keeps the old file aside", async () => {
    const dataDir = await tempDir();
    const liveStore = await createTestStore();
    await publish(liveStore, "live-data");
    await fs.writeFile(path.join(dataDir, STORE_FILE), await createBackup(liveStore));

    const source = await createTestStore();
    await publish(source, "backup-data");
    const backupPath = path.join(await tempDir(), "backup.db");
    await fs.writeFile(backupPath, await createBackup(source));

    const { previous } = await restoreBackupFile(dataDir, backupPath, new Date("2026-11-15T10:00:00Z"));
    expect(previous).toBe(path.join(dataDir, "media-mind.before-restore-2026-11-15-10-00.db"));
    await fs.stat(previous!);
    const restored = await openStore(toFileUrl(path.join(dataDir, STORE_FILE)));
    try {
      expect((await getActiveData(restored, "billing"))?.data).toBe("backup-data");
    } finally {
      restored.$client.close();
    }
  });

  it("refuses a file that is not a Media Mind backup", async () => {
    const dir = await tempDir();
    const fake = path.join(dir, "fake.db");
    await fs.writeFile(fake, "not a database at all");
    await expect(restoreBackupFile(dir, fake)).rejects.toThrow(/not a Media Mind backup/);
  });

  async function liveDirWithFile() {
    const dataDir = await tempDir();
    await fs.writeFile(path.join(dataDir, STORE_FILE), "live");
    return dataDir;
  }
  async function expectUntouched(dataDir: string) {
    expect(await fs.readFile(path.join(dataDir, STORE_FILE), "utf8")).toBe("live");
    expect((await fs.readdir(dataDir)).filter((n) => n.includes("before-restore"))).toEqual([]);
  }

  it("refuses a real SQLite file with another schema and leaves the live file alone", async () => {
    const dataDir = await liveDirWithFile();
    const other = path.join(await tempDir(), "other.db");
    const c = createClient({ url: toFileUrl(other) });
    await c.execute("create table x(a)");
    c.close();
    await expect(restoreBackupFile(dataDir, other)).rejects.toThrow(/not a Media Mind backup/);
    await expectUntouched(dataDir);
  });

  it("refuses a database whose app id is different and leaves the live file alone", async () => {
    const dataDir = await liveDirWithFile();
    const store = await createTestStore();
    await store.update(meta).set({ value: "other-app" }).where(eq(meta.key, "app"));
    const file = path.join(await tempDir(), "wrong-app.db");
    await fs.writeFile(file, await createBackup(store));
    await expect(restoreBackupFile(dataDir, file)).rejects.toThrow(/not a Media Mind backup/);
    await expectUntouched(dataDir);
  });

  async function appNewestMigration(): Promise<number> {
    const journal = JSON.parse(await fs.readFile(path.join(process.cwd(), "drizzle-store", "meta", "_journal.json"), "utf8")) as { entries: { when: number }[] };
    return Math.max(...journal.entries.map((e) => e.when));
  }

  /** A backup from createBackupFile, copied into a test folder (libsql can hold the file briefly after close on Windows). */
  async function backupCopy(store: Awaited<ReturnType<typeof createTestStore>>): Promise<string> {
    const file = await createBackupFile(store);
    const copy = path.join(await tempDir(), "backup.db");
    try {
      await fs.copyFile(file.path, copy);
    } finally {
      await file.cleanup();
    }
    return copy;
  }

  it("refuses a backup made by a newer app version and leaves the live file alone", async () => {
    const dataDir = await liveDirWithFile();
    const file = await backupCopy(await createTestStore());
    const c = createClient({ url: toFileUrl(file) });
    await c.execute({
      // Drizzle's id column is "SERIAL", which SQLite leaves NULL, so pick the newest row by created_at.
      sql: "UPDATE __drizzle_migrations SET created_at = ? WHERE created_at = (SELECT max(created_at) FROM __drizzle_migrations)",
      args: [(await appNewestMigration()) + 1],
    });
    c.close();
    await expect(restoreBackupFile(dataDir, file)).rejects.toThrow(NEWER_BACKUP);
    await expectUntouched(dataDir);
  });

  it("still restores a backup made by this app version", async () => {
    const dataDir = await liveDirWithFile();
    const source = await createTestStore();
    await publish(source, "backup-data");
    const { previous } = await restoreBackupFile(dataDir, await backupCopy(source));
    expect(previous).not.toBeNull();
    const restored = await openStore(toFileUrl(path.join(dataDir, STORE_FILE)));
    try {
      expect((await getActiveData(restored, "billing"))?.data).toBe("backup-data");
    } finally {
      restored.$client.close();
    }
  });

  it("refuses a Media Mind-looking file with no migrations table as not a backup", async () => {
    const dataDir = await liveDirWithFile();
    const file = await backupCopy(await createTestStore());
    const c = createClient({ url: toFileUrl(file) });
    await c.execute("DROP TABLE __drizzle_migrations");
    c.close();
    await expect(restoreBackupFile(dataDir, file)).rejects.toThrow(/not a Media Mind backup/);
    await expectUntouched(dataDir);
  });

  it("refuses a backup whose migrations table is empty as not a backup", async () => {
    const dataDir = await liveDirWithFile();
    const file = await backupCopy(await createTestStore());
    const c = createClient({ url: toFileUrl(file) });
    await c.execute("DELETE FROM __drizzle_migrations");
    c.close();
    await expect(restoreBackupFile(dataDir, file)).rejects.toThrow(/not a Media Mind backup/);
    await expectUntouched(dataDir);
  });

  it("refuses a backup whose newest migration time is not a number as not a backup", async () => {
    const dataDir = await liveDirWithFile();
    const file = await backupCopy(await createTestStore());
    const c = createClient({ url: toFileUrl(file) });
    await c.execute("UPDATE __drizzle_migrations SET created_at = 'abc'");
    c.close();
    await expect(restoreBackupFile(dataDir, file)).rejects.toThrow(/not a Media Mind backup/);
    await expectUntouched(dataDir);
  });

  it("restores into an empty data folder", async () => {
    const dataDir = await tempDir();
    const source = await createTestStore();
    await publish(source, "backup-data");
    const backupPath = path.join(await tempDir(), "backup.db");
    await fs.writeFile(backupPath, await createBackup(source));
    expect(await restoreBackupFile(dataDir, backupPath)).toEqual({ previous: null });
    await fs.stat(path.join(dataDir, STORE_FILE));
  });
});

describe("newestMigration", () => {
  it("is the largest when in the journal", () => {
    expect(newestMigration({ entries: [{ when: 5 }, { when: 9 }, { when: 7 }] })).toBe(9);
  });

  it("throws a plain error on an empty or invalid journal instead of refusing every backup", () => {
    for (const bad of [{ entries: [] }, {}, null, { entries: [{ when: "x" }] }, { entries: [{}] }]) {
      expect(() => newestMigration(bad)).toThrow("The app's migration list is missing or broken.");
    }
  });
});
