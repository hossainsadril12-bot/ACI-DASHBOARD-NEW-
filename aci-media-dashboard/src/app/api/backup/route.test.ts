import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));
vi.mock("@/store/backup", async (o) => {
  const real = await o<typeof import("@/store/backup")>();
  return { ...real, createBackupFile: vi.fn(real.createBackupFile) };
});

const route = await import("./route");
const { GET } = route;
// What Next 16 really runs for HEAD: the route's own HEAD, or GET when the route has none.
const { autoImplementMethods } = await import("next/dist/server/route-modules/app-route/helpers/auto-implement-methods");
const HEAD = autoImplementMethods(route as Parameters<typeof autoImplementMethods>[0]).HEAD as () => Promise<Response>;
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const { createBackupFile } = await import("@/store/backup");
const spy = vi.mocked(createBackupFile);
const realBackup = await vi.importActual<typeof import("@/store/backup")>("@/store/backup");

async function signInAdmin() {
  h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
}
async function tempPath(): Promise<string> {
  expect(spy).toHaveBeenCalledTimes(1);
  return (await spy.mock.results[0]!.value).path;
}
async function gone(file: string) {
  await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
}

beforeEach(async () => {
  h.store = await createTestStore();
  h.jar.clear();
  spy.mockClear();
});

describe("GET /api/backup", () => {
  it("refuses viewers with 403 and a plain message, and makes no temp file", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Only the admin can download a backup. Please sign in.");
    expect(spy).not.toHaveBeenCalled();
  });

  it("streams the admin one SQLite file with safe headers, then removes the temp file", async () => {
    await signInAdmin();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="media-mind-backup-.*\.db"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const file = await tempPath();
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    await gone(file);
  });

  it("removes the temp file when the download is cancelled", async () => {
    await signInAdmin();
    const res = await GET();
    const file = await tempPath();
    await res.body!.cancel();
    await gone(file);
  });

  it("finishes the download when removing the temp file fails, and logs no path", async () => {
    await signInAdmin();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let temp = "";
    spy.mockImplementationOnce(async (store) => {
      const f = await realBackup.createBackupFile(store);
      temp = f.path;
      return {
        ...f,
        cleanup: async () => {
          await f.cleanup();
          throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${f.path}'`), { code: "EPERM" });
        },
      };
    });
    try {
      const res = await GET();
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");
      expect(errors).toHaveBeenCalled();
      expect(JSON.stringify(errors.mock.calls)).not.toContain(temp);
      expect(JSON.stringify(errors.mock.calls)).toContain("EPERM");
    } finally {
      errors.mockRestore();
    }
  });
});

describe("HEAD /api/backup", () => {
  it("refuses viewers with 403 and makes no temp file", async () => {
    const res = await HEAD();
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("answers the admin with headers only and makes no temp file", async () => {
    await signInAdmin();
    const res = await HEAD();
    try {
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await res.body?.cancel(); // only if a body was wrongly made, so the test leaves no temp file
    }
  });
});
