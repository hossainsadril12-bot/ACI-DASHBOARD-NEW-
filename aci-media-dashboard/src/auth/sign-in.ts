import { createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "@/store/client";
import { verifyPassword } from "./password";
import { LOCK_MS, beginAttempt, clearFailures, failAttempt, getLockState } from "./lockout";
import { createSession } from "./session";

export type SignInResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string };

const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export function lockedMessage(retryAt: Date): string {
  const time = retryAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });
  return `Too many wrong tries. Sign-in is locked until ${time} (Dhaka time).`;
}

/** The one place that decides a sign-in. Counts the try first, so a locked account never reaches the password check and parallel guesses cannot overrun the limit. */
export async function attemptSignIn(
  store: Store,
  admin: { user: string; passwordHash: string },
  input: { user: string; password: string },
  now: Date = new Date(),
): Promise<SignInResult> {
  const ticket = await beginAttempt(store, now);
  if (!ticket.allowed) return { ok: false, error: lockedMessage(ticket.state.retryAt ?? new Date(now.getTime() + LOCK_MS)) };

  const userOk = sameText(input.user.trim(), admin.user);
  const passOk = await verifyPassword(input.password, admin.passwordHash); // always runs, so a wrong user name takes the same time
  if (!userOk || !passOk) {
    const after = await failAttempt(store, ticket, now);
    if (after.locked && after.retryAt) return { ok: false, error: lockedMessage(after.retryAt) };
    return { ok: false, error: `Wrong user name or password. ${after.triesLeft} ${after.triesLeft === 1 ? "try" : "tries"} left.` };
  }
  // A right password while a lock exists (set by a parallel request) is still refused.
  const lock = await getLockState(store, now);
  if (lock.locked && lock.retryAt) return { ok: false, error: lockedMessage(lock.retryAt) };
  await clearFailures(store, now);
  const { token, expiresAt } = await createSession(store, now);
  return { ok: true, token, expiresAt };
}
