import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { LOCK_MS, MAX_TRIES, clearFailures, getLockState, recordFailure } from "./lockout";

const t0 = new Date("2026-11-15T10:00:00Z");

describe("sign-in lock", () => {
  it("starts unlocked with 5 tries", async () => {
    expect(await getLockState(await createTestStore(), t0)).toEqual({ locked: false, retryAt: null, triesLeft: 5 });
    expect(MAX_TRIES).toBe(5);
    expect(LOCK_MS).toBe(10 * 60 * 1000);
  });

  it("counts down and locks on the 5th wrong try for 10 minutes", async () => {
    const store = await createTestStore();
    for (let i = 1; i <= 4; i++) expect((await recordFailure(store, t0)).triesLeft).toBe(5 - i);
    const fifth = await recordFailure(store, t0);
    expect(fifth).toEqual({ locked: true, retryAt: new Date(t0.getTime() + LOCK_MS), triesLeft: 0 });
    expect((await getLockState(store, new Date(t0.getTime() + LOCK_MS - 1))).locked).toBe(true);
  });

  it("unlocks after 10 minutes with 5 fresh tries", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await recordFailure(store, t0);
    expect(await getLockState(store, new Date(t0.getTime() + LOCK_MS))).toEqual({ locked: false, retryAt: null, triesLeft: 5 });
  });

  it("does not extend the lock while locked", async () => {
    const store = await createTestStore();
    for (let i = 0; i < 5; i++) await recordFailure(store, t0);
    const during = await recordFailure(store, new Date(t0.getTime() + 60_000));
    expect(during.retryAt).toEqual(new Date(t0.getTime() + LOCK_MS));
  });

  it("clears the count after a good sign-in", async () => {
    const store = await createTestStore();
    await recordFailure(store, t0);
    await recordFailure(store, t0);
    await clearFailures(store, t0);
    expect((await getLockState(store, t0)).triesLeft).toBe(5);
  });

  it("counts parallel wrong tries correctly", async () => {
    const store = await createTestStore();
    await Promise.all([1, 2, 3, 4, 5].map(() => recordFailure(store, t0)));
    expect((await getLockState(store, t0)).locked).toBe(true);
  });
});
