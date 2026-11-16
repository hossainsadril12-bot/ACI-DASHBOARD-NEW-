import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/store/client";
import { createTestStore } from "@/store/test-store";

const h = vi.hoisted(() => ({ store: undefined as unknown as Store }));
const getDb = vi.fn(() => { throw new Error("DB touched"); });

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {} }));
vi.mock("@/store/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/store/client")>()), getStore: async () => h.store }));
vi.mock("@/db/client", () => ({ getDb: () => getDb() }));

const { NOT_ADMIN_MESSAGE } = await import("./admin");

/** Exported actions that sign in or out, or only read, and so need no guard. Keep this list short and justified. */
const NO_GUARD = new Set(["billHistoryAction", "signInAction", "signOutAction"]);

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return /^\s*["']use server["'];/.test(fs.readFileSync(p, "utf8")) ? [p] : [];
  });
}

const actions: [string, (...a: unknown[]) => Promise<unknown>][] = [];
for (const file of serverActionFiles(path.resolve("src/app"))) {
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn === "function" && !NO_GUARD.has(name)) actions.push([`${path.relative(process.cwd(), file)}: ${name}`, fn as (...a: unknown[]) => Promise<unknown>]);
  }
}

/** Row counts of every store table: a refused action must leave all of them unchanged. */
async function counts(store: Store) {
  const tables = await store.$client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'");
  const out: Record<string, number> = {};
  for (const r of tables.rows) out[String(r.name)] = Number((await store.$client.execute(`SELECT count(*) AS n FROM "${String(r.name)}"`)).rows[0].n);
  return out;
}

const refused = (res: unknown) =>
  (res as { error?: unknown } | null)?.error === NOT_ADMIN_MESSAGE || (res instanceof Error && res.message === NOT_ADMIN_MESSAGE);

beforeEach(async () => { h.store = await createTestStore(); getDb.mockClear(); });

describe("every server action, called by a viewer", () => {
  it("finds them all", () => expect(actions.length).toBeGreaterThanOrEqual(30));

  it.each(actions)("%s is refused and changes nothing", async (_name, fn) => {
    const fd = new FormData();
    fd.set("files", new File([new Uint8Array([1, 2, 3])], "x.xlsx"));
    fd.set("kind", "spend");
    const before = await counts(h.store);
    let res: unknown;
    try { res = await fn(fd, fd); } catch (e) { res = e; }
    expect(refused(res), String((res as { error?: unknown })?.error ?? res)).toBe(true);
    expect(getDb).not.toHaveBeenCalled();
    expect(await counts(h.store)).toEqual(before);
  });
});
