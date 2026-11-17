import { sql } from "drizzle-orm";
import { blob, check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
export const uploadFile = sqliteTable(
  "upload_file",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [check("upload_file_size_positive", sql`${t.sizeBytes} > 0`)],
);

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
  (t) => [
    index("dataset_version_key_idx").on(t.datasetKey, t.id),
    check("dataset_version_source_valid", sql`${t.source} IN ('upload', 'manual')`),
    check("dataset_version_key_length", sql`length(${t.datasetKey}) BETWEEN 1 AND 120`),
  ],
);

/** One row per dataset (e.g. "billing", "atl:Savlon Soap"): which version the pages show. */
export const dataset = sqliteTable(
  "dataset",
  {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  activeVersionId: integer("active_version_id").notNull().references(() => datasetVersion.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [check("dataset_key_length", sql`length(${t.key}) BETWEEN 1 AND 120`)],
);

/** Businesses the admin owns. The slug is made once from the first name and never changes. */
export const business = sqliteTable(
  "business",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [
    check("business_slug_length", sql`length(${t.slug}) BETWEEN 1 AND 60`),
    check("business_name_length", sql`length(${t.name}) BETWEEN 1 AND 120`),
  ],
);

/** Brands, each under one business. Names are unique across businesses (see name_match). */
export const brand = sqliteTable(
  "brand",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessSlug: text("business_slug").notNull().references(() => business.slug),
    name: text("name").notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [check("brand_name_length", sql`length(${t.name}) BETWEEN 1 AND 120`)],
);

/** ATL categories (one per Excel tab title), each owned by a business. */
export const atlCategory = sqliteTable(
  "atl_category",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    normName: text("norm_name").notNull().unique(),
    businessSlug: text("business_slug").notNull().references(() => business.slug),
    /** "Our brand" rows in the file: JSON array of names. */
    ownBrands: text("own_brands", { mode: "json" }).$type<string[]>().notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [
    check("atl_category_slug_length", sql`length(${t.slug}) BETWEEN 1 AND 60`),
    check("atl_category_name_length", sql`length(${t.name}) BETWEEN 1 AND 120`),
    check("atl_category_own_brands_array", sql`json_type(${t.ownBrands}) = 'array'`),
  ],
);

/** Every name that points at a business or a brand: own names, old names and "same as" names. Keyed by the normalised name; `name` keeps the spelling. */
export const nameMatch = sqliteTable(
  "name_match",
  {
    kind: text("kind", { enum: ["business", "brand"] }).notNull(),
    normName: text("norm_name").notNull(),
    name: text("name").notNull(),
    businessSlug: text("business_slug").references(() => business.slug),
    brandId: integer("brand_id").references(() => brand.id),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.normName] }),
    check(
      "name_match_target",
      sql`(${t.kind} = 'business' AND ${t.businessSlug} IS NOT NULL AND ${t.brandId} IS NULL) OR (${t.kind} = 'brand' AND ${t.brandId} IS NOT NULL AND ${t.businessSlug} IS NULL)`,
    ),
    check("name_match_norm_name_length", sql`length(${t.normName}) BETWEEN 1 AND 120`),
    check("name_match_name_length", sql`length(${t.name}) BETWEEN 1 AND 120`),
  ],
);

/** Admin sessions. Only the SHA-256 of the cookie token is stored. */
export const adminSession = sqliteTable("admin_session", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** Wrong sign-in tries and the 10-minute lock. One row, key "admin". */
export const loginLock = sqliteTable(
  "login_lock",
  {
  key: text("key").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [check("login_lock_failed_count_nonneg", sql`${t.failedCount} >= 0`)],
);
