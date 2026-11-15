import { eq, sql } from "drizzle-orm";
import { loginLock } from "@/store/schema";
import type { Store } from "@/store/client";

export const MAX_TRIES = 5;
export const LOCK_MS = 10 * 60 * 1000;
const KEY = "admin";

export type LockState = { locked: boolean; retryAt: Date | null; triesLeft: number };

export async function getLockState(store: Store, now: Date = new Date()): Promise<LockState> {
  const row = await store.query.loginLock.findFirst({ where: eq(loginLock.key, KEY) });
  if (row?.lockedUntil && row.lockedUntil > now) return { locked: true, retryAt: row.lockedUntil, triesLeft: 0 };
  return { locked: false, retryAt: null, triesLeft: MAX_TRIES - (row?.failedCount ?? 0) };
}

/** One wrong try. The count goes up in one SQL statement, so parallel tries cannot skip the lock. */
export async function recordFailure(store: Store, now: Date = new Date()): Promise<LockState> {
  const current = await getLockState(store, now);
  if (current.locked) return current;
  const [row] = await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 1, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: loginLock.key, set: { failedCount: sql`${loginLock.failedCount} + 1`, updatedAt: now } })
    .returning({ failedCount: loginLock.failedCount });
  if (row.failedCount >= MAX_TRIES) {
    const retryAt = new Date(now.getTime() + LOCK_MS);
    await store.update(loginLock).set({ failedCount: 0, lockedUntil: retryAt, updatedAt: now }).where(eq(loginLock.key, KEY));
    return { locked: true, retryAt, triesLeft: 0 };
  }
  return { locked: false, retryAt: null, triesLeft: MAX_TRIES - row.failedCount };
}

export async function clearFailures(store: Store, now: Date = new Date()): Promise<void> {
  await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 0, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: loginLock.key, set: { failedCount: 0, lockedUntil: null, updatedAt: now } });
}
