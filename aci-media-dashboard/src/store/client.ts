import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";
import { assertStoreEnv } from "./assert-store-env";

export type Store = LibSQLDatabase<typeof schema> & { $client: Client };
export type StoreTx = Parameters<Parameters<Store["transaction"]>[0]>[0];

export const STORE_FILE = "media-mind.db";
export const APP_ID = "media-mind";

/** libsql wants forward slashes, also on Windows ("file:C:/data dir/media-mind.db"). */
export function toFileUrl(filePath: string): string {
  return "file:" + path.resolve(filePath).split(path.sep).join("/");
}

/** Opens a store and brings its tables up to date. `url` is ":memory:" in tests. */
export async function openStore(url: string): Promise<Store> {
  const client = createClient({ url, timeout: 5000 });
  if (url !== ":memory:") {
    await client.execute("PRAGMA journal_mode = WAL");
  }
  const store = drizzle({ client, schema });
  await migrate(store, { migrationsFolder: path.join(process.cwd(), "drizzle-store") });
  await store.insert(schema.meta).values({ key: "app", value: APP_ID }).onConflictDoNothing();
  return store;
}

let storePromise: Promise<Store> | undefined;

/** The app's one store, opened once per server process. */
export function getStore(): Promise<Store> {
  if (!storePromise) {
    const { dataDir } = assertStoreEnv(process.env);
    fs.mkdirSync(dataDir, { recursive: true });
    storePromise = openStore(toFileUrl(path.join(dataDir, STORE_FILE))).catch((e: unknown) => {
      storePromise = undefined;
      throw e;
    });
  }
  return storePromise;
}
