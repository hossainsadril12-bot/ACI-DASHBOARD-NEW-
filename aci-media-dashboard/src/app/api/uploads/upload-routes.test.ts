import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";
import { listHistory } from "@/store/datasets";
import { MAX_FILE_BYTES } from "@/store/files";
import { makeXlsx } from "@/lib/ingest/test-workbooks";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store, jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("@/store/client", async (o) => ({ ...(await o<typeof import("@/store/client")>()), getStore: async () => h.store }));

const preview = await import("./preview/route");
const publish = await import("./publish/route");
const { SESSION_COOKIE, createSession } = await import("@/auth/session");
const { NOT_ADMIN_MESSAGE } = await import("@/auth/admin");

const TOO_BIG = "The files together are larger than 60 MB. Upload them in smaller groups.";
const calendarBook = (sheet = "Nov'26") => makeXlsx([{ name: sheet, rows: [
  [`CB Media Activity ${sheet}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ["Grand Total", null, 1, 0.5, 0, 0, 1.5],
] }]);
const xlsx = (b: Buffer, name: string) => new File([new Uint8Array(b)], name);

async function multipart(fd: FormData) {
  const res = new Response(fd);
  return { type: res.headers.get("content-type")!, body: Buffer.from(await res.arrayBuffer()) };
}
async function post(fd: FormData, extra: Record<string, string> = {}, lengthOverride?: string | null) {
  const { type, body } = await multipart(fd);
  const headers: Record<string, string> = { "content-type": type, host: "app.test", ...extra };
  if (lengthOverride !== null) headers["content-length"] = lengthOverride ?? String(body.length);
  return new Request("http://app.test/api/uploads/preview", { method: "POST", headers, body });
}
const form = (...files: File[]) => { const fd = new FormData(); for (const f of files) fd.append("files", f); return fd; };
const asAdmin = async () => { h.jar.set(SESSION_COOKIE, (await createSession(h.store)).token); };

beforeEach(async () => { h.store = await createTestStore(); h.jar.clear(); });

describe("upload routes: refusals happen before the body is read", () => {
  it("refuses a viewer and never reads the body", async () => {
    let pulled = false;
    const body = new ReadableStream({ pull() { pulled = true; throw new Error("body was read"); } }, { highWaterMark: 0 });
    const req = new Request("http://app.test/api/uploads/preview", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "10", host: "app.test" }, body, duplex: "half" } as RequestInit);
    for (const route of [preview, publish]) {
      const res = await route.POST(req);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: NOT_ADMIN_MESSAGE });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(pulled).toBe(false);
  });
  it("refuses a cross-origin request from the admin", async () => {
    await asAdmin();
    const res = await preview.POST(await post(form(xlsx(calendarBook(), "c.xlsx")), { origin: "http://evil.test" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Cross-site upload refused." });
  });
  it("refuses a missing Content-Length", async () => {
    await asAdmin();
    const res = await preview.POST(await post(form(xlsx(calendarBook(), "c.xlsx")), {}, null));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: TOO_BIG });
  });
  it("refuses a Content-Length over the cap", async () => {
    await asAdmin();
    const res = await publish.POST(await post(form(xlsx(calendarBook(), "c.xlsx")), {}, String(MAX_FILE_BYTES + 1024 * 1024 + 1)));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: TOO_BIG });
  });
  it("cuts off a stream that sends more than the cap whatever it claimed", async () => {
    await asAdmin();
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({ pull(c) { sent++; if (sent > 80) c.close(); else c.enqueue(chunk); } }, { highWaterMark: 0 });
    const req = new Request("http://app.test/api/uploads/preview", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "1000", host: "app.test" }, body, duplex: "half" } as RequestInit);
    const res = await preview.POST(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: TOO_BIG });
    expect(sent).toBeLessThan(80);
  });
  it("answers 400 for a body that is not multipart", async () => {
    await asAdmin();
    const req = new Request("http://app.test/api/uploads/preview", { method: "POST", headers: { "content-type": "text/plain", "content-length": "3", host: "app.test" }, body: "abc" });
    const res = await preview.POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The upload could not be read. Please try again." });
  });
});

describe("upload routes: admin", () => {
  it("accepts a same-origin request from the admin", async () => {
    await asAdmin();
    const res = await preview.POST(await post(form(xlsx(calendarBook(), "cal.xlsx")), { origin: "http://app.test" }));
    expect(res.status).toBe(200);
  });
  it("compares the origin with x-forwarded-host behind a proxy", async () => {
    await asAdmin();
    const proxied = { host: "internal:3000", "x-forwarded-host": "app.test" };
    const ok = await preview.POST(await post(form(xlsx(calendarBook(), "cal.xlsx")), { ...proxied, origin: "http://app.test" }));
    expect(ok.status).toBe(200);
    const bad = await preview.POST(await post(form(xlsx(calendarBook(), "cal.xlsx")), { ...proxied, origin: "http://evil.test" }));
    expect(bad.status).toBe(403);
    const list = await preview.POST(await post(form(xlsx(calendarBook(), "cal.xlsx")), { ...proxied, "x-forwarded-host": " app.test , other.test", origin: "http://app.test" }));
    expect(list.status).toBe(200);
  });
  it("previews a calendar file", async () => {
    await asAdmin();
    const res = await preview.POST(await post(form(xlsx(calendarBook(), "cal.xlsx"))));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const j = await res.json();
    expect(j).toMatchObject({ error: null, ok: true });
    expect(j.previews[0]).toMatchObject({ fileName: "cal.xlsx", type: "calendar", canPublish: true });
  });
  it("publishes, and the history shows it", async () => {
    await asAdmin();
    const res = await publish.POST(await post(form(xlsx(calendarBook(), "cal.xlsx"))));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ error: null, ok: true, published: [{ datasetKey: "calendar" }] });
    expect((await listHistory(h.store, { datasetKey: "calendar" })).length).toBe(1);
  });
  it("applies type-1 to the second file", async () => {
    await asAdmin();
    const unsure = makeXlsx([{ name: "Nov'26", rows: [
      ["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5],
    ] }]);
    const fd = form(xlsx(makeXlsx([{ name: "S", rows: [["a"]] }]), "a.xlsx"), xlsx(unsure, "b.xlsx"));
    fd.set("type-1", "calendar");
    const j = await (await preview.POST(await post(fd))).json();
    expect(j.previews[0]).toMatchObject({ fileName: "a.xlsx", type: null, canPublish: false });
    expect(j.previews[1]).toMatchObject({ fileName: "b.xlsx", type: "calendar", canPublish: true });
  });
  it("passes business-0 to the service and ignores a value that isn't a business", async () => {
    await asAdmin();
    const digital = makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
      ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
      ...(p === "Meta" ? [["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
    ] })));
    const salt = form(xlsx(digital, "digital.xlsx"));
    salt.set("business-0", "Salt");
    const ok = await (await preview.POST(await post(salt))).json();
    expect(ok.previews[0]).toMatchObject({ type: "digital", canPublish: true, business: "Salt", businessSource: "admin", datasetKey: "digital:Salt" });
    const evil = form(xlsx(digital, "digital.xlsx"));
    evil.set("business-0", "evil");
    const bad = await (await preview.POST(await post(evil))).json();
    expect(bad.previews[0]).toMatchObject({ canPublish: false, needsBusiness: true, business: null, blockReason: "Pick the business." });
    const pub = await (await publish.POST(await post(salt))).json();
    expect(pub).toMatchObject({ ok: true, published: [{ datasetKey: "digital:Salt" }] });
  });
  it("refuses an empty file by name", async () => {
    await asAdmin();
    const res = await preview.POST(await post(form(xlsx(Buffer.alloc(0), "empty.xlsx"))));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "empty.xlsx is empty." });
  });
});
