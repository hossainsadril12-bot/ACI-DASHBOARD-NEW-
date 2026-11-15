import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ jar: new Map<string, string>(), store: undefined as unknown }));
const jar = h.jar;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined) }),
}));
vi.mock("@/store/client", async (orig) => ({
  ...(await orig<typeof import("@/store/client")>()),
  getStore: async () => h.store,
}));

const { NOT_ADMIN_MESSAGE, NotAdminError, isAdmin, requireAdmin } = await import("./admin");
const { SESSION_COOKIE, SESSION_MS, createSession } = await import("./session");

let store: Store;
beforeEach(async () => {
  jar.clear();
  store = await createTestStore();
  h.store = store;
});

describe("admin guard", () => {
  it("refuses a request without a session cookie", async () => {
    expect(await isAdmin()).toBe(false);
    await expect(requireAdmin()).rejects.toBeInstanceOf(NotAdminError);
    await expect(requireAdmin()).rejects.toThrow(NOT_ADMIN_MESSAGE);
    expect(NOT_ADMIN_MESSAGE).toBe("Only the admin can change data. Please sign in.");
  });

  it("refuses a made-up cookie", async () => {
    jar.set(SESSION_COOKIE, "made-up-token");
    expect(await isAdmin()).toBe(false);
  });

  it("refuses an expired session", async () => {
    const { token } = await createSession(store, new Date(Date.now() - SESSION_MS - 1000));
    jar.set(SESSION_COOKIE, token);
    expect(await isAdmin()).toBe(false);
  });

  it("lets a valid admin session through", async () => {
    const { token } = await createSession(store);
    jar.set(SESSION_COOKIE, token);
    expect(await isAdmin()).toBe(true);
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});
