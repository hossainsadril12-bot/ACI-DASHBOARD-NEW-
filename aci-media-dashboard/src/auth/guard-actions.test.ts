import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  store: undefined as unknown as Store,
  getDb: () => {
    throw new Error("DB touched");
  },
}));
const getDb = vi.fn(h.getDb);

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/store/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/client")>()),
  getStore: async () => h.store,
}));
vi.mock("@/db/client", () => ({ getDb: (...a: unknown[]) => (getDb as (...x: unknown[]) => unknown)(...a) }));

const { NOT_ADMIN_MESSAGE } = await import("./admin");
const { SESSION_COOKIE, createSession } = await import("./session");
const spend = await import("@/app/(modules)/spend/actions");
const billing = await import("@/app/(modules)/billing/actions");
const uploads = await import("@/app/(modules)/uploads/actions");
const settings = await import("@/app/(modules)/settings/actions");

beforeEach(async () => {
  h.jar.clear();
  getDb.mockClear();
  h.store = await createTestStore();
});

const uploadForm = () => {
  const fd = new FormData();
  fd.set("kind", "spend");
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "x.xlsx"));
  return fd;
};

describe("write actions for a viewer (no session)", () => {
  it.each([
    ["deleteSpendAction", () => spend.deleteSpendAction(1)],
    ["deleteBillAction (via run)", () => billing.deleteBillAction(1)],
    ["confirmUploadAction", () => uploads.confirmUploadAction(uploadForm())],
    ["removeSampleDataAction", () => settings.removeSampleDataAction()],
  ])("%s refuses and never touches data", async (_name, call) => {
    expect(await call()).toMatchObject({ error: NOT_ADMIN_MESSAGE });
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe("write actions for the admin", () => {
  it("passes the guard and reaches the data layer", async () => {
    const { token } = await createSession(h.store);
    h.jar.set(SESSION_COOKIE, token);
    const res = await spend.deleteSpendAction(1);
    expect(getDb).toHaveBeenCalled();
    expect(res.error).not.toBe(NOT_ADMIN_MESSAGE);
  });
});
