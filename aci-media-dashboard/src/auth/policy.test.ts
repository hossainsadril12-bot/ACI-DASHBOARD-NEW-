import { describe, expect, it } from "vitest";
import { PER_PERSON_ACCESS, can } from "./policy";

describe("policy", () => {
  it("lets everyone read and only the admin write", () => {
    expect(can({ kind: "viewer" }, "read")).toBe(true);
    expect(can({ kind: "viewer" }, "write")).toBe(false);
    expect(can({ kind: "admin" }, "read")).toBe(true);
    expect(can({ kind: "admin" }, "write")).toBe(true);
  });

  it("keeps per-person access switched off", () => {
    expect(PER_PERSON_ACCESS).toBe(false);
  });
});
