import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataset, meta } from "./schema";
import { createTestStore } from "./test-store";
import { toFileUrl } from "./client";

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
