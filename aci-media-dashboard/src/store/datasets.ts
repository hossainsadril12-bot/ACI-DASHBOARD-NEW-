import { desc, eq, inArray } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { dataset, datasetVersion, uploadFile } from "./schema";
import { saveFile } from "./files";
import type { Store, StoreTx } from "./client";

export type DatasetSource = "upload" | "manual";

export type PublishInput = {
  datasetKey: string;
  kind: string;
  label: string;
  source: DatasetSource;
  summary: Record<string, unknown>;
  data: unknown;
  file?: { name: string; bytes: Buffer };
};

export type ActiveData<T> = { versionId: number; label: string; createdAt: Date; data: T };

export type HistoryRow = {
  versionId: number;
  datasetKey: string;
  kind: string;
  label: string;
  source: DatasetSource;
  summary: Record<string, unknown>;
  fileId: number | null;
  fileName: string | null;
  createdAt: Date;
  isActive: boolean;
};

function checkInput(input: PublishInput): PublishInput {
  const datasetKey = input.datasetKey.trim();
  if (!datasetKey || datasetKey.length > 120) throw new ValidationError("Dataset key must be 1 to 120 characters.");
  const kind = input.kind.trim();
  if (!kind || kind.length > 60) throw new ValidationError("Dataset kind must be 1 to 60 characters.");
  const label = input.label.trim();
  if (!label || label.length > 255) throw new ValidationError("Label must be 1 to 255 characters.");
  return { ...input, datasetKey, kind, label };
}

async function insertVersion(tx: StoreTx, input: PublishInput): Promise<number> {
  const fileId = input.file ? (await saveFile(tx, input.file)).id : null;
  const [v] = await tx
    .insert(datasetVersion)
    .values({ datasetKey: input.datasetKey, kind: input.kind, label: input.label, source: input.source, summary: input.summary, data: input.data, fileId })
    .returning({ id: datasetVersion.id });
  const updatedAt = new Date();
  await tx
    .insert(dataset)
    .values({ key: input.datasetKey, kind: input.kind, activeVersionId: v.id, updatedAt })
    .onConflictDoUpdate({ target: dataset.key, set: { activeVersionId: v.id, kind: input.kind, updatedAt } });
  return v.id;
}

/** Saves new versions (with their original files) and makes them the ones the pages show. All of them or none. */
export async function publishVersions(store: Store, inputs: PublishInput[]): Promise<{ versionIds: number[] }> {
  if (inputs.length === 0) throw new ValidationError("Nothing to publish.");
  const clean = inputs.map(checkInput); // validate everything before writing anything
  return store.transaction(async (tx) => {
    const versionIds: number[] = [];
    for (const input of clean) versionIds.push(await insertVersion(tx, input));
    return { versionIds };
  });
}

/** Saves a new version (and its original file) and makes it the one the pages show. All or nothing. */
export async function publishVersion(store: Store, input: PublishInput): Promise<{ versionId: number }> {
  const { versionIds } = await publishVersions(store, [input]);
  return { versionId: versionIds[0] };
}

/** SHA-256 of the original file behind each dataset's active version, so a preview can say "same file as the one in use". */
export async function getActiveFileHashes(store: Store, datasetKeys: string[]): Promise<Map<string, string>> {
  if (datasetKeys.length === 0) return new Map();
  const rows = await store
    .select({ key: dataset.key, sha256: uploadFile.sha256 })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .innerJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .where(inArray(dataset.key, datasetKeys));
  return new Map(rows.map((r) => [r.key, r.sha256]));
}

export async function getActiveData<T>(store: Store, datasetKey: string): Promise<ActiveData<T> | null> {
  const [row] = await store
    .select({ versionId: datasetVersion.id, label: datasetVersion.label, createdAt: datasetVersion.createdAt, data: datasetVersion.data })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .where(eq(dataset.key, datasetKey))
    .limit(1);
  return row ? { ...row, data: row.data as T } : null;
}

/** Upload History, newest first. Leaves out the data itself. */
export async function listHistory(store: Store, opts: { datasetKey?: string; limit?: number } = {}): Promise<HistoryRow[]> {
  const rows = await store
    .select({
      versionId: datasetVersion.id,
      datasetKey: datasetVersion.datasetKey,
      kind: datasetVersion.kind,
      label: datasetVersion.label,
      source: datasetVersion.source,
      summary: datasetVersion.summary,
      fileId: datasetVersion.fileId,
      fileName: uploadFile.name,
      createdAt: datasetVersion.createdAt,
      activeVersionId: dataset.activeVersionId,
    })
    .from(datasetVersion)
    .leftJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .leftJoin(dataset, eq(dataset.key, datasetVersion.datasetKey))
    .where(opts.datasetKey ? eq(datasetVersion.datasetKey, opts.datasetKey) : undefined)
    .orderBy(desc(datasetVersion.id))
    .limit(Math.min(Math.max(opts.limit ?? 200, 1), 1000));
  return rows.map(({ activeVersionId, ...r }) => ({ ...r, isActive: activeVersionId === r.versionId }));
}

/** Points that dataset (only that one) back at an older version. History is never rewritten. */
export async function restoreVersion(store: Store, versionId: number): Promise<{ datasetKey: string }> {
  // No transaction needed: versions are never deleted and the update is idempotent.
  const v = await store.query.datasetVersion.findFirst({ where: eq(datasetVersion.id, versionId), columns: { datasetKey: true } });
  if (!v) throw new ValidationError("That upload no longer exists.");
  await store.update(dataset).set({ activeVersionId: versionId, updatedAt: new Date() }).where(eq(dataset.key, v.datasetKey));
  return { datasetKey: v.datasetKey };
}
