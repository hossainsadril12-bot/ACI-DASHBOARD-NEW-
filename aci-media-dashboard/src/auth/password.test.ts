import { describe, expect, it } from "vitest";
import { BCRYPT_COST, hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with bcrypt at cost 12 and verifies", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("bcrypt:")).toBe(true);
    const inner = Buffer.from(stored.slice(7), "base64url").toString("utf8");
    expect(inner).toMatch(/^\$2[aby]\$12\$/);
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(10);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).not.toContain("correct horse battery");
    expect(Buffer.from(stored.slice(7), "base64url").toString("utf8")).not.toContain("correct horse battery");
  });

  it("refuses short and over-long passwords when hashing", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
    await expect(hashPassword("x".repeat(73))).rejects.toThrow(/at most 72/);
  });

  it.each(["", "plain", "bcrypt:", "bcrypt:@@@", "scrypt:1:2:3:4:5"])("treats a malformed hash %j as no match", async (h) => {
    expect(await verifyPassword("anything at all", h)).toBe(false);
  });
});
