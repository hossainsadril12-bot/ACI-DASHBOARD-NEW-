import { beforeAll, describe, expect, it, vi } from "vitest";
import { adminSession } from "@/store/schema";
import { createTestStore } from "@/store/test-store";
import { LOCK_MS, recordFailure } from "./lockout";
import { isValidSession } from "./session";
import { attemptSignIn } from "./sign-in";

// Lets a test run code in the middle of a sign-in, between the try being counted and the password check ending.
const h = vi.hoisted(() => ({ duringCheck: undefined as undefined | (() => Promise<void>) }));
vi.mock("./password", async (orig) => {
  const real = await orig<typeof import("./password")>();
  return {
    ...real,
    verifyPassword: async (...args: Parameters<typeof real.verifyPassword>) => {
      await h.duringCheck?.();
      return real.verifyPassword(...args);
    },
  };
});
const { hashPassword } = await import("./password");

const t0 = new Date("2026-11-15T10:00:00Z");
let admin: { user: string; passwordHash: string };
beforeAll(async () => {
  admin = { user: "admin", passwordHash: await hashPassword("correct horse battery") };
});
const good = { user: "admin", password: "correct horse battery" };
const bad = { user: "admin", password: "wrong password here" };

describe("attemptSignIn", () => {
  it("signs in with the right user and password", async () => {
    const store = await createTestStore();
    const r = await attemptSignIn(store, admin, good, t0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await isValidSession(store, r.token, t0)).toBe(true);
  });

  it("says how many tries are left after a wrong password", async () => {
    const r = await attemptSignIn(await createTestStore(), admin, bad, t0);
    expect(r).toEqual({ ok: false, error: "Wrong user name or password. 4 tries left." });
  });

  it("counts a wrong user name as a wrong try", async () => {
    const r = await attemptSignIn(await createTestStore(), admin, { ...good, user: "root" }, t0);
    expect(r).toEqual({ ok: false, error: "Wrong user name or password. 4 tries left." });
  });

  it("locks on the 5th wrong try and refuses even the right password during the lock", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 4; i++) await attemptSignIn(store, admin, bad, t0);
    const fifth = await attemptSignIn(store, admin, bad, t0);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.error).toMatch(/^Too many wrong tries\. Sign-in is locked until 16:10/);
    const during = await attemptSignIn(store, admin, good, new Date(t0.getTime() + 60_000));
    expect(during.ok).toBe(false);
  });

  it("lets the right password in once the lock is over", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await attemptSignIn(store, admin, bad, t0);
    expect((await attemptSignIn(store, admin, good, new Date(t0.getTime() + LOCK_MS))).ok).toBe(true);
  });

  it("refuses the right password when a parallel request has locked sign-in", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await recordFailure(store, t0);
    const r = await attemptSignIn(store, admin, good, new Date(t0.getTime() + 1000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Too many wrong tries\. Sign-in is locked until/);
  });

  it("refuses the right password when a request running at the same time locks sign-in mid-check", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 4; i++) await recordFailure(store, t0);
    h.duringCheck = async () => {
      h.duringCheck = undefined;
      await recordFailure(store, t0); // a parallel request's wrong try pushes the count past the limit
    };
    const r = await attemptSignIn(store, admin, good, t0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Too many wrong tries. Sign-in is locked until/);
    expect(await store.select().from(adminSession)).toHaveLength(0);
  });
});
