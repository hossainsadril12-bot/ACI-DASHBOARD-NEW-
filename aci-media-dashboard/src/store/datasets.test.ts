import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dataset, uploadFile, datasetVersion } from "./schema";
import { createTestStore } from "./test-store";
import { getFile } from "./files";
import { STALE_MESSAGE, activeIfCurrentTx, getActiveData, getActiveFileHashes, listActiveVersions, listHistory, publishVersion, publishVersions, restoreVersion, type DatasetSource, type PublishInput } from "./datasets";

const input = (over: Partial<PublishInput> = {}): PublishInput => ({
  datasetKey: "billing",
  kind: "billing",
  label: "Dashboard Media Final, 26 Oct 2026",
  source: "upload",
  summary: { rows: 2 },
  data: [{ business: "Hygiene", amount: 10 }],
  ...over,
});

describe("datasets", () => {
  it("returns null before anything is published", async () => {
    expect(await getActiveData(await createTestStore(), "billing")).toBeNull();
  });

  it("publishes a version and makes it active", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, input());
    const active = await getActiveData<{ business: string; amount: number }[]>(store, "billing");
    expect(active?.versionId).toBe(versionId);
    expect(active?.data).toEqual([{ business: "Hygiene", amount: 10 }]);
  });

  it("keeps the original file with the version", async () => {
    const store = await createTestStore();
    const bytes = Buffer.from("PK fake xlsx bytes");
    await publishVersion(store, input({ file: { name: "billing.xlsx", bytes } }));
    const [h] = await listHistory(store);
    expect(h.fileName).toBe("billing.xlsx");
    expect((await getFile(store, h.fileId!))?.bytes.equals(bytes)).toBe(true);
  });

  it("lists history newest first and marks the active one", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input({ label: "A" }));
    const b = await publishVersion(store, input({ label: "B" }));
    const h = await listHistory(store, { datasetKey: "billing" });
    expect(h.map((r) => [r.versionId, r.isActive])).toEqual([[b.versionId, true], [a.versionId, false]]);
  });

  it("restores an older version of that dataset only", async () => {
    const store = await createTestStore();
    const soapOld = await publishVersion(store, input({ datasetKey: "atl:Savlon Soap", kind: "atl", data: "soap-old" }));
    await publishVersion(store, input({ datasetKey: "atl:Savlon Soap", kind: "atl", data: "soap-new" }));
    await publishVersion(store, input({ datasetKey: "atl:Septex", kind: "atl", data: "septex" }));
    expect(await restoreVersion(store, soapOld.versionId)).toEqual({ datasetKey: "atl:Savlon Soap" });
    expect((await getActiveData(store, "atl:Savlon Soap"))?.data).toBe("soap-old");
    expect((await getActiveData(store, "atl:Septex"))?.data).toBe("septex");
  });

  it("refuses to restore a version that does not exist", async () => {
    await expect(restoreVersion(await createTestStore(), 42)).rejects.toThrow(/no longer exists/);
  });

  it("lists nothing in use before anything is published", async () => {
    expect(await listActiveVersions(await createTestStore())).toEqual([]);
  });

  it("lists the version each dataset shows now, with its file name and source", async () => {
    const store = await createTestStore();
    const old = await publishVersion(store, input({ label: "Billing A", file: { name: "billing-a.xlsx", bytes: Buffer.from("PK bytes a") } }));
    await publishVersion(store, input({ label: "Billing B", file: { name: "billing-b.xlsx", bytes: Buffer.from("PK bytes b") } }));
    await publishVersion(store, input({ datasetKey: "calendar", kind: "calendar", label: "Calendar, typed", source: "manual" }));
    expect(await listActiveVersions(store)).toEqual([
      { datasetKey: "billing", kind: "billing", label: "Billing B", fileName: "billing-b.xlsx", createdAt: expect.any(Date), source: "upload" },
      { datasetKey: "calendar", kind: "calendar", label: "Calendar, typed", fileName: null, createdAt: expect.any(Date), source: "manual" },
    ]);
    await restoreVersion(store, old.versionId);
    expect((await listActiveVersions(store)).map((v) => [v.datasetKey, v.label, v.fileName])).toEqual([
      ["billing", "Billing A", "billing-a.xlsx"],
      ["calendar", "Calendar, typed", null],
    ]);
  });

  it("writes nothing when the file is refused", async () => {
    const store = await createTestStore();
    await expect(publishVersion(store, input({ file: { name: "empty.xlsx", bytes: Buffer.alloc(0) } }))).rejects.toThrow(/empty/);
    expect(await store.select().from(datasetVersion)).toEqual([]);
    expect(await store.select().from(uploadFile)).toEqual([]);
  });

  it("rolls back the saved file when a later step fails", async () => {
    const store = await createTestStore();
    await expect(
      publishVersion(store, input({ source: "bogus" as DatasetSource, file: { name: "ok.xlsx", bytes: Buffer.from("PK bytes") } })),
    ).rejects.toThrow();
    expect(await store.select().from(uploadFile)).toEqual([]);
    expect(await store.select().from(datasetVersion)).toEqual([]);
    expect(await store.select().from(dataset)).toEqual([]);
  });

  it("refuses a dataset kind outside 1 to 60 characters", async () => {
    const store = await createTestStore();
    await expect(publishVersion(store, input({ kind: "  " }))).rejects.toThrow("Dataset kind must be 1 to 60 characters.");
    await expect(publishVersion(store, input({ kind: "k".repeat(61) }))).rejects.toThrow("Dataset kind must be 1 to 60 characters.");
  });

  it("refuses a label outside 1 to 255 characters", async () => {
    const store = await createTestStore();
    await expect(publishVersion(store, input({ label: "  " }))).rejects.toThrow("Label must be 1 to 255 characters.");
    await expect(publishVersion(store, input({ label: "l".repeat(256) }))).rejects.toThrow("Label must be 1 to 255 characters.");
  });

  it("stores the trimmed kind and label", async () => {
    const store = await createTestStore();
    await publishVersion(store, input({ kind: " billing ", label: "  Hello  " }));
    const [h] = await listHistory(store);
    expect([h.kind, h.label]).toEqual(["billing", "Hello"]);
  });

  it("leaves the number of versions unchanged on restore", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input({ label: "A" }));
    await publishVersion(store, input({ label: "B" }));
    await restoreVersion(store, a.versionId);
    expect(await store.select().from(datasetVersion)).toHaveLength(2);
  });

  it("refuses a blank dataset key", async () => {
    await expect(publishVersion(await createTestStore(), input({ datasetKey: "  " }))).rejects.toThrow(/Dataset key/);
  });
});

/** Drizzle wraps driver errors; the trigger's message is on the cause. */
async function failure(p: Promise<unknown>): Promise<string> {
  try { await p; return ""; } catch (e) { return `${String(e)} ${String((e as { cause?: unknown }).cause ?? "")}`; }
}

const mk = (key: string, name = "a.xlsx", bytes = "abc") => ({
  datasetKey: key, kind: key.split(":")[0], label: `L ${key}`, source: "upload" as const,
  summary: {}, data: { k: key }, file: { name, bytes: Buffer.from(bytes) },
});

describe("Upload History is append-only", () => {
  it("refuses to change or delete versions and files", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, mk("calendar"));
    expect(await failure(store.update(datasetVersion).set({ label: "x" }).where(eq(datasetVersion.id, versionId)))).toMatch(/Upload History cannot be changed/);
    expect(await failure(store.delete(datasetVersion))).toMatch(/Upload History cannot be deleted/);
    expect(await failure(store.update(uploadFile).set({ name: "b" }))).toMatch(/Uploaded files cannot be changed/);
    expect(await failure(store.delete(uploadFile))).toMatch(/Uploaded files cannot be deleted/);
    expect(await store.$count(datasetVersion)).toBe(1);
  });

  it("still lets restore move the active pointer", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, mk("calendar", "a.xlsx", "a"));
    await publishVersion(store, mk("calendar", "b.xlsx", "b"));
    await restoreVersion(store, a.versionId);
    const [row] = await store.select().from(dataset).where(eq(dataset.key, "calendar"));
    expect(row.activeVersionId).toBe(a.versionId);
  });
});

describe("publishVersions", () => {
  it("publishes several datasets in one go", async () => {
    const store = await createTestStore();
    const { versionIds } = await publishVersions(store, [mk("atl:soap"), mk("calendar")]);
    expect(versionIds).toHaveLength(2);
    expect((await getActiveData(store, "atl:soap"))?.data).toEqual({ k: "atl:soap" });
    expect((await getActiveData(store, "calendar"))?.data).toEqual({ k: "calendar" });
  });

  it("refuses the whole batch when one input fails validation", async () => {
    const store = await createTestStore();
    const bad = { ...mk("calendar"), label: "" }; // fails validation
    await expect(publishVersions(store, [mk("atl:soap"), bad])).rejects.toThrow(/Label/);
    expect(await store.$count(datasetVersion)).toBe(0);
    expect(await store.$count(uploadFile)).toBe(0);
  });

  it("is all or nothing when the second file fails inside the transaction", async () => {
    const store = await createTestStore();
    const bad = { ...mk("calendar"), file: { name: "b.xlsx", bytes: Buffer.alloc(0) } }; // passes validation, saveFile throws after the first insert
    await expect(publishVersions(store, [mk("atl:soap"), bad])).rejects.toThrow(/The file is empty/);
    expect(await store.$count(datasetVersion)).toBe(0);
    expect(await store.$count(dataset)).toBe(0);
    expect(await store.$count(uploadFile)).toBe(0);
  });

  it("refuses an empty list", async () => {
    await expect(publishVersions(await createTestStore(), [])).rejects.toThrow(/Nothing to publish/);
  });
});

describe("getActiveFileHashes", () => {
  it("returns the SHA-256 of each active version's original file", async () => {
    const store = await createTestStore();
    await publishVersion(store, mk("calendar", "a.xlsx", "abc"));
    const map = await getActiveFileHashes(store, ["calendar", "atl:soap"]);
    expect(map.get("calendar")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(map.has("atl:soap")).toBe(false);
  });
});

describe("getActiveData", () => {
  it("returns the version's summary with its data", async () => {
    const store = await createTestStore();
    await publishVersion(store, input({ summary: { months: ["2026-07"] } }));
    expect((await getActiveData(store, "billing"))?.summary).toEqual({ months: ["2026-07"] });
  });
});

describe("activeIfCurrentTx", () => {
  const check = (store: Awaited<ReturnType<typeof createTestStore>>, base: number | null) =>
    store.transaction((tx) => activeIfCurrentTx(tx, "billing", base));

  it("passes with null before anything is published, and returns null", async () => {
    expect(await check(await createTestStore(), null)).toBeNull();
  });
  it("returns the active version when it is the one opened", async () => {
    const store = await createTestStore();
    const { versionId } = await publishVersion(store, input());
    expect((await check(store, versionId))?.versionId).toBe(versionId);
  });
  it("refuses once something was published after opening (null base)", async () => {
    const store = await createTestStore();
    await publishVersion(store, input());
    await expect(check(store, null)).rejects.toThrow(STALE_MESSAGE);
  });
  it("refuses a newer publish and a restore made after opening", async () => {
    const store = await createTestStore();
    const a = await publishVersion(store, input({ label: "A" }));
    const b = await publishVersion(store, input({ label: "B" }));
    await expect(check(store, a.versionId)).rejects.toThrow(STALE_MESSAGE);
    await restoreVersion(store, a.versionId);
    await expect(check(store, b.versionId)).rejects.toThrow(STALE_MESSAGE);
  });
});
