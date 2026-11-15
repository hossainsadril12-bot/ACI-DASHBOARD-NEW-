import { describe, expect, it } from "vitest";
import { uploadFile, datasetVersion } from "./schema";
import { createTestStore } from "./test-store";
import { getFile } from "./files";
import { getActiveData, listHistory, publishVersion, restoreVersion, type PublishInput } from "./datasets";

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

  it("writes nothing when the file is refused", async () => {
    const store = await createTestStore();
    await expect(publishVersion(store, input({ file: { name: "empty.xlsx", bytes: Buffer.alloc(0) } }))).rejects.toThrow(/empty/);
    expect(await store.select().from(datasetVersion)).toEqual([]);
    expect(await store.select().from(uploadFile)).toEqual([]);
  });

  it("refuses a blank dataset key", async () => {
    await expect(publishVersion(await createTestStore(), input({ datasetKey: "  " }))).rejects.toThrow(/Dataset key/);
  });
});
