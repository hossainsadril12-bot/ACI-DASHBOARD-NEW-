import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

let admin = false;
vi.mock("@/auth/admin", () => ({ isAdmin: async () => admin }));
let store: Store;
vi.mock("@/store/client", async (orig) => ({ ...(await orig<typeof import("@/store/client")>()), getStore: async () => store }));

const { GET } = await import("./route");

beforeEach(async () => {
  admin = false;
  store = await createTestStore();
});

describe("GET /api/backup", () => {
  it("refuses viewers with 403 and a plain message", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Only the admin can download a backup. Please sign in.");
  });

  it("gives the admin one SQLite file", async () => {
    admin = true;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="media-mind-backup-.*\.db"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\u0000");
  });
});
