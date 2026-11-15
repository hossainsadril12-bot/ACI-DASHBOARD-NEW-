import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { adminSession } from "@/store/schema";
import { SESSION_MS, createSession, deleteSession, isValidSession } from "./session";

const t0 = new Date("2026-11-15T10:00:00Z");

describe("admin sessions", () => {
  it("accepts a fresh token and stores only its hash", async () => {
    const store = await createTestStore();
    const { token, expiresAt } = await createSession(store, t0);
    expect(expiresAt).toEqual(new Date(t0.getTime() + SESSION_MS));
    expect(await isValidSession(store, token, t0)).toBe(true);
    const rows = await store.select().from(adminSession);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("rejects missing, unknown, over-long and expired tokens", async () => {
    const store = await createTestStore();
    const { token } = await createSession(store, t0);
    expect(await isValidSession(store, undefined, t0)).toBe(false);
    expect(await isValidSession(store, "nope", t0)).toBe(false);
    expect(await isValidSession(store, "x".repeat(500), t0)).toBe(false);
    expect(await isValidSession(store, token, new Date(t0.getTime() + SESSION_MS))).toBe(false);
  });

  it("signs out by deleting the session", async () => {
    const store = await createTestStore();
    const { token } = await createSession(store, t0);
    await deleteSession(store, token);
    expect(await isValidSession(store, token, t0)).toBe(false);
  });

  it("clears expired sessions when a new one is made", async () => {
    const store = await createTestStore();
    await createSession(store, t0);
    await createSession(store, new Date(t0.getTime() + SESSION_MS + 1));
    expect(await store.select().from(adminSession)).toHaveLength(1);
  });
});
