import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { dataset, loginLock, meta, uploadFile } from "./schema";
import { createTestStore } from "./test-store";
import { openStore, toFileUrl, type Store } from "./client";

describe("openStore", () => {
  it("creates every table and marks the file as Media Mind", async () => {
    const store = await createTestStore();
    const rows = await store.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`);
    const names = rows.map((r) => r.name);
    for (const t of ["admin_session", "dataset", "dataset_version", "login_lock", "meta", "setting", "upload_file"]) {
      expect(names).toContain(t);
    }
    expect(await store.select().from(meta)).toEqual([{ key: "app", value: "media-mind" }]);
  });

  it("enforces foreign keys", async () => {
    const store = await createTestStore();
    await expect(store.insert(dataset).values({ key: "x", kind: "x", activeVersionId: 999, updatedAt: new Date() })).rejects.toThrow();
  });

  it("builds forward-slash file URLs", () => {
    expect(toFileUrl("C:\\data dir\\media-mind.db")).toMatch(/^file:.*\/data dir\/media-mind\.db$/);
  });
});

describe("CHECK constraints", () => {
  it("rejects a dataset_version with an unknown source", async () => {
    const store = await createTestStore();
    await expect(
      store.run(sql`INSERT INTO dataset_version (dataset_key, kind, label, source, summary, data, created_at) VALUES ('k','k','l','bogus','{}','null', 0)`),
    ).rejects.toThrow();
  });

  it("rejects a dataset_version with an empty or too long dataset_key", async () => {
    const store = await createTestStore();
    await expect(
      store.run(sql`INSERT INTO dataset_version (dataset_key, kind, label, source, summary, data, created_at) VALUES ('','k','l','upload','{}','null', 0)`),
    ).rejects.toThrow();
    const long = "a".repeat(121);
    await expect(
      store.run(sql`INSERT INTO dataset_version (dataset_key, kind, label, source, summary, data, created_at) VALUES (${long},'k','l','upload','{}','null', 0)`),
    ).rejects.toThrow();
  });

  it("rejects a dataset with an empty or too long key", async () => {
    const store = await createTestStore();
    await store.run(sql`INSERT INTO dataset_version (dataset_key, kind, label, source, summary, data, created_at) VALUES ('k','k','l','upload','{}','null', 0)`);
    await expect(store.insert(dataset).values({ key: "", kind: "k", activeVersionId: 1 })).rejects.toThrow();
    await expect(store.insert(dataset).values({ key: "a".repeat(121), kind: "k", activeVersionId: 1 })).rejects.toThrow();
  });

  it("rejects an upload_file with size 0", async () => {
    const store = await createTestStore();
    await expect(store.insert(uploadFile).values({ name: "x", sizeBytes: 0, sha256: "x", bytes: Buffer.from("") })).rejects.toThrow();
  });

  it("rejects a login_lock with a negative failed_count", async () => {
    const store = await createTestStore();
    await expect(store.insert(loginLock).values({ key: "admin", failedCount: -1 })).rejects.toThrow();
  });
});

describe("file-backed store", () => {
  let dir: string | undefined;
  let store: Store | undefined;

  afterEach(async () => {
    store?.$client.close();
    store = undefined;
    if (dir) {
      // Windows can keep a file handle open after a failed statement until the process exits; a leftover temp folder is harmless.
      await fs.rm(dir, { recursive: true, force: true }).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "EBUSY" && e.code !== "EPERM") throw e;
      });
    }
    dir = undefined;
  });

  async function open(): Promise<Store> {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mm-client-test-"));
    store = await openStore(toFileUrl(path.join(dir, "test.db")));
    return store;
  }

  const orphan = { key: "x", kind: "x", activeVersionId: 999 };

  it("enforces foreign keys on the connection a transaction uses", async () => {
    const s = await open();
    await expect(s.transaction(async (tx) => { await tx.insert(dataset).values(orphan); })).rejects.toThrow();
  });

  it("enforces foreign keys outside a transaction", async () => {
    const s = await open();
    await expect(s.insert(dataset).values(orphan)).rejects.toThrow();
  });

  it("uses WAL journal mode", async () => {
    const s = await open();
    const rows = await s.all<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
    expect(rows[0].journal_mode).toBe("wal");
  });
});
