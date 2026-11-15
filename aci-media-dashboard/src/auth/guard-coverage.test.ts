import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Exported server actions that only read (or that sign in and out) and so need no guard. */
const NO_GUARD = new Set(["billHistoryAction", "signInAction", "signOutAction"]);

function serverActionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name)) return [];
    return /^\s*["']use server["'];/.test(fs.readFileSync(p, "utf8")) ? [p] : [];
  });
}

describe("server action guard coverage", () => {
  const files = serverActionFiles(path.resolve("src/app"));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it("calls requireAdmin before any data access in every write action", () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const runIsGuarded = /async function run\([\s\S]*?\{\s*try\s*\{\s*await requireAdmin\(\);/.test(src);
      for (const part of src.split(/(?=export async function )/).slice(1)) {
        const name = /export async function (\w+)/.exec(part)![1];
        if (NO_GUARD.has(name)) continue;
        const guardAt = [part.indexOf("await requireAdmin()"), runIsGuarded ? part.search(/\brun\(/) : -1]
          .filter((i) => i >= 0)
          .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
        const dataAt = part.search(/\b(getDb|getStore|readForm)\(/);
        if (guardAt === Number.POSITIVE_INFINITY || (dataAt >= 0 && dataAt < guardAt)) missing.push(`${path.relative(process.cwd(), file)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
