import { describe, expect, it } from "vitest";
import { createTestStore } from "./test-store";
import { MAX_FILE_BYTES, getFile, saveFile } from "./files";

describe("files", () => {
  it("refuses a file over the size limit", async () => {
    const store = await createTestStore();
    await expect(saveFile(store, { name: "big.xlsx", bytes: Buffer.alloc(MAX_FILE_BYTES + 1) })).rejects.toThrow(/larger than 60 MB/);
  });

  it("saves a blank name as upload", async () => {
    const store = await createTestStore();
    const { id } = await saveFile(store, { name: "   ", bytes: Buffer.from("PK bytes") });
    expect((await getFile(store, id))?.name).toBe("upload");
  });

  it("returns null for a missing file id", async () => {
    expect(await getFile(await createTestStore(), 999)).toBeNull();
  });
});
