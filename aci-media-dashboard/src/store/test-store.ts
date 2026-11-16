import { openStore, type Store } from "./client";

/** A fresh, empty, migrated store in memory. Never touches a real data dir. */
export function createTestStore(): Promise<Store> {
  return openStore(":memory:");
}
