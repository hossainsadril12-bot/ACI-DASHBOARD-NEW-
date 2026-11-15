import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date();

/** Marks the file as a Media Mind store (key "app" = "media-mind"). */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** App settings such as the USD rate. Values are JSON. */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Original uploaded files, kept so they can be downloaded again and travel in the backup. */
export const uploadFile = sqliteTable("upload_file", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Every published version of every dataset: the Upload History. Never updated, never deleted. */
export const datasetVersion = sqliteTable(
  "dataset_version",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetKey: text("dataset_key").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    source: text("source", { enum: ["upload", "manual"] }).notNull(),
    summary: text("summary", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    fileId: integer("file_id").references(() => uploadFile.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [index("dataset_version_key_idx").on(t.datasetKey, t.id)],
);

/** One row per dataset (e.g. "billing", "atl:Savlon Soap"): which version the pages show. */
export const dataset = sqliteTable("dataset", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  activeVersionId: integer("active_version_id").notNull().references(() => datasetVersion.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

/** Admin sessions. Only the SHA-256 of the cookie token is stored. */
export const adminSession = sqliteTable("admin_session", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** Wrong sign-in tries and the 10-minute lock. One row, key "admin". */
export const loginLock = sqliteTable("login_lock", {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});
