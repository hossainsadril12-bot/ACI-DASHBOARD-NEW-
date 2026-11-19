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

export type ActiveData<T> = { versionId: number; label: string; summary: Record<string, unknown>; createdAt: Date; data: T };

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

/** The version a dataset shows now, for the Upload Data cards' "In use" line. */
export type ActiveVersion = { datasetKey: string; kind: string; label: string; fileName: string | null; createdAt: Date; source: DatasetSource };

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

/** Saves new versions inside the caller's transaction, so other changes (the name lists) commit with them. */
export async function publishVersionsTx(tx: StoreTx, inputs: PublishInput[]): Promise<number[]> {
  if (inputs.length === 0) throw new ValidationError("Nothing to publish.");
  const clean = inputs.map(checkInput); // validate everything before writing anything
  const versionIds: number[] = [];
  for (const input of clean) versionIds.push(await insertVersion(tx, input));
  return versionIds;
}

/** Saves new versions (with their original files) and makes them the ones the pages show. All of them or none. */
export async function publishVersions(store: Store, inputs: PublishInput[]): Promise<{ versionIds: number[] }> {
  // publishVersionsTx checks every input before it writes anything, so a refusal rolls back an empty transaction.
  return { versionIds: await store.transaction((tx) => publishVersionsTx(tx, inputs)) };
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

/** The version a dataset shows now, with its data. Works on the store or inside a transaction. */
export async function getActiveData<T>(store: Store | StoreTx, datasetKey: string): Promise<ActiveData<T> | null> {
  const db = store as StoreTx; // the same query either way, as getCatalog does
  const [row] = await db
    .select({ versionId: datasetVersion.id, label: datasetVersion.label, summary: datasetVersion.summary, createdAt: datasetVersion.createdAt, data: datasetVersion.data })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .where(eq(dataset.key, datasetKey))
    .limit(1);
  return row ? { ...row, data: row.data as T } : null;
}

export const STALE_MESSAGE = "This data changed after you opened it. Reload to see the latest, then make your change again.";

/**
 * Inside a write transaction: the dataset's active version, only while it is still the one the admin opened (null:
 * nothing published yet). A publish or a restore since then is refused with STALE_MESSAGE, so a save never
 * overwrites it. The transaction holds the write lock (BEGIN IMMEDIATE), so two saves cannot both pass.
 */
export async function activeIfCurrentTx<T>(tx: StoreTx, datasetKey: string, baseVersionId: number | null): Promise<ActiveData<T> | null> {
  const active = await getActiveData<T>(tx, datasetKey);
  if ((active?.versionId ?? null) !== baseVersionId) throw new ValidationError(STALE_MESSAGE);
  return active;
}

/** Every dataset's active version, by dataset key. Leaves out the data itself. */
export async function listActiveVersions(store: Store): Promise<ActiveVersion[]> {
  return store
    .select({
      datasetKey: dataset.key,
      kind: datasetVersion.kind,
      label: datasetVersion.label,
      fileName: uploadFile.name,
      createdAt: datasetVersion.createdAt,
      source: datasetVersion.source,
    })
    .from(dataset)
    .innerJoin(datasetVersion, eq(dataset.activeVersionId, datasetVersion.id))
    .leftJoin(uploadFile, eq(datasetVersion.fileId, uploadFile.id))
    .orderBy(dataset.key);
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
