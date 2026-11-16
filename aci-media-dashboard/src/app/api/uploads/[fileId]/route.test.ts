import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";
import { publishVersion } from "@/store/datasets";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const { GET } = await import("./route");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const call = (id: string) => GET(new Request(`http://x/api/uploads/${id}`), { params: Promise.resolve({ fileId: id }) });

beforeEach(async () => { h.store = await createTestStore(); h.jar.clear(); });

describe("GET /api/uploads/:fileId", () => {
  it("refuses a viewer", async () => {
    const res = await call("1");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Only the admin can download uploaded files. Please sign in.");
  });
  it("gives the admin the original bytes with safe headers", async () => {
    h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
    await publishVersion(h.store, { datasetKey: "calendar", kind: "calendar", label: "L", source: "upload", summary: {}, data: {}, file: { name: 'Oct "26"\r\n.xlsx', bytes: Buffer.from("PKabc") } });
    const res = await call("1");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PKabc");
    const cd = res.headers.get("content-disposition")!;
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd).toContain('filename="Oct _26___.xlsx"');
    expect(cd).toContain("filename*=UTF-8''");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("keeps filename= pure ASCII for non-ASCII and backslash names, and encodes RFC 5987 specials", async () => {
    h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
    await publishVersion(h.store, { datasetKey: "calendar", kind: "calendar", label: "L", source: "upload", summary: {}, data: {}, file: { name: "Café\\ “Q3”.xlsx", bytes: Buffer.from("PK") } });
    await publishVersion(h.store, { datasetKey: "spend", kind: "spend", label: "L", source: "upload", summary: {}, data: {}, file: { name: "Bob's (1)*.xlsx", bytes: Buffer.from("PK") } });
    const a = (await call("1")).headers.get("content-disposition")!;
    expect(a.match(/filename="([^"]*)"/)![1]).toMatch(/^[\x20-\x7e]*$/);
    expect(a).toContain('filename="Caf__ _Q3_.xlsx"');
    const b = (await call("2")).headers.get("content-disposition")!;
    expect(b).toContain("filename*=UTF-8''Bob%27s%20%281%29%2A.xlsx");
  });
  it("404s for a bad or missing id", async () => {
    h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token);
    expect((await call("abc")).status).toBe(404);
    expect((await call("99")).status).toBe(404);
  });
});
