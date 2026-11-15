import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertStoreEnv } from "./assert-store-env";

const cwd = path.resolve("/app/aci-media-dashboard");
const goodHash = "bcrypt:" + Buffer.from("$2b$12$" + "a".repeat(53)).toString("base64url");
const base = { MEDIA_MIND_DATA_DIR: "../media-mind-data", ADMIN_USER: "admin", ADMIN_PASSWORD_HASH: goodHash };

describe("assertStoreEnv", () => {
  it("returns the resolved data dir and admin settings", () => {
    expect(assertStoreEnv(base, cwd)).toEqual({
      dataDir: path.resolve(cwd, "../media-mind-data"),
      adminUser: "admin",
      adminPasswordHash: goodHash,
    });
  });

  it("passes the base env with no serverless variable (control)", () => {
    expect(() => assertStoreEnv({ ...base, NETLIFY: "", VERCEL: undefined }, cwd)).not.toThrow();
  });

  it.each(["NETLIFY", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME"])("refuses serverless hosting when %s is set", (name) => {
    expect(() => assertStoreEnv({ ...base, [name]: "true" }, cwd)).toThrow(/needs one long-running server with a disk/);
  });

  it("refuses an 80-character base64url string that is not a bcrypt hash", () => {
    expect(() => assertStoreEnv({ ...base, ADMIN_PASSWORD_HASH: "bcrypt:" + "A".repeat(80) }, cwd)).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it("refuses a missing data dir", () => {
    expect(() => assertStoreEnv({ ...base, MEDIA_MIND_DATA_DIR: "" }, cwd)).toThrow(/MEDIA_MIND_DATA_DIR is not set/);
  });

  it.each(["src/data", "public", ".next/store"])("refuses a data dir inside %s", (dir) => {
    expect(() => assertStoreEnv({ ...base, MEDIA_MIND_DATA_DIR: dir }, cwd)).toThrow(/must not be inside/);
  });

  it.runIf(process.platform === "win32").each(["PUBLIC", "Src/data"])("refuses %s on Windows regardless of case", (dir) => {
    expect(() => assertStoreEnv({ ...base, MEDIA_MIND_DATA_DIR: dir }, cwd)).toThrow(/must not be inside/);
  });

  it("refuses a missing admin user", () => {
    expect(() => assertStoreEnv({ ...base, ADMIN_USER: " " }, cwd)).toThrow(/ADMIN_USER is not set/);
  });

  it.each(["", "plain-password", "bcrypt:short", "$2b$12$abc"])("refuses a bad password hash %j", (h) => {
    expect(() => assertStoreEnv({ ...base, ADMIN_PASSWORD_HASH: h }, cwd)).toThrow(/ADMIN_PASSWORD_HASH/);
  });
});
