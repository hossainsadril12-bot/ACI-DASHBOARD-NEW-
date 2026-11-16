import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { adminSession } from "@/store/schema";
import type { Store } from "@/store/client";

export const SESSION_COOKIE = "mm_admin";
export const SESSION_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
export const SESSION_MS = 8 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(store: Store, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  await store.delete(adminSession).where(lte(adminSession.expiresAt, now));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  await store.insert(adminSession).values({ tokenHash: hashToken(token), createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function isValidSession(store: Store, token: string | undefined, now: Date = new Date()): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const row = await store.query.adminSession.findFirst({
    where: and(eq(adminSession.tokenHash, hashToken(token)), gt(adminSession.expiresAt, now)),
    columns: { tokenHash: true },
  });
  return row !== undefined;
}

export async function deleteSession(store: Store, token: string | undefined): Promise<void> {
  if (token) await store.delete(adminSession).where(eq(adminSession.tokenHash, hashToken(token)));
}
