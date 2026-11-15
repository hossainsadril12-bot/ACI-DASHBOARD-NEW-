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

export type AttemptTicket = { allowed: true; count: number } | { allowed: false; state: LockState };

/** Set the lock only if no future lock is already set, so a straggler never moves retryAt. */
async function lockNow(store: Store, now: Date): Promise<void> {
  await store
    .update(loginLock)
    .set({ failedCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MS), updatedAt: now })
    .where(
      sql`${loginLock.key} = ${KEY} AND (${loginLock.lockedUntil} IS NULL OR ${loginLock.lockedUntil} <= ${now.getTime()})`,
    );
}

/** Count this try BEFORE the password is checked, in one SQL statement, so parallel tries cannot overrun the limit. */
export async function beginAttempt(store: Store, now: Date = new Date()): Promise<AttemptTicket> {
  const current = await getLockState(store, now);
  if (current.locked) return { allowed: false, state: current };
  const [row] = await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 1, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({ target: loginLock.key, set: { failedCount: sql`${loginLock.failedCount} + 1`, updatedAt: now } })
    .returning({ failedCount: loginLock.failedCount });
  if (row.failedCount > MAX_TRIES) {
    await lockNow(store, now);
    return { allowed: false, state: await getLockState(store, now) };
  }
  return { allowed: true, count: row.failedCount };
}

/** The password was wrong. The try was already counted by beginAttempt. */
export async function failAttempt(
  store: Store,
  ticket: { allowed: true; count: number },
  now: Date = new Date(),
): Promise<LockState> {
  if (ticket.count >= MAX_TRIES) await lockNow(store, now);
  return getLockState(store, now);
}

export async function recordFailure(store: Store, now: Date = new Date()): Promise<LockState> {
  const ticket = await beginAttempt(store, now);
  if (!ticket.allowed) return ticket.state;
  return failAttempt(store, ticket, now);
}

/** Good sign-in: reset the count. Never lifts an active lock. */
export async function clearFailures(store: Store, now: Date = new Date()): Promise<void> {
  await store
    .insert(loginLock)
    .values({ key: KEY, failedCount: 0, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: loginLock.key,
      set: { failedCount: 0, lockedUntil: null, updatedAt: now },
      setWhere: sql`${loginLock.lockedUntil} IS NULL OR ${loginLock.lockedUntil} <= ${now.getTime()}`,
    });
}
