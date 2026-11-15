import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { uploadFile } from "./schema";
import type { Store, StoreTx } from "./client";

export const MAX_FILE_BYTES = 60 * 1024 * 1024;

/** Keeps an original file inside the store, so the backup holds it too. */
export async function saveFile(db: Store | StoreTx, input: { name: string; bytes: Buffer }): Promise<{ id: number; sha256: string }> {
  if (input.bytes.length === 0) throw new ValidationError("The file is empty.");
  if (input.bytes.length > MAX_FILE_BYTES) throw new ValidationError("The file is larger than 60 MB.");
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [row] = await db
    .insert(uploadFile)
    .values({ name: input.name.slice(0, 255), sizeBytes: input.bytes.length, sha256, bytes: input.bytes })
    .returning({ id: uploadFile.id });
  return { id: row.id, sha256 };
}

export async function getFile(store: Store, id: number): Promise<{ name: string; bytes: Buffer } | null> {
  const row = await store.query.uploadFile.findFirst({ where: eq(uploadFile.id, id), columns: { name: true, bytes: true } });
  return row ? { name: row.name, bytes: Buffer.from(row.bytes) } : null;
}
