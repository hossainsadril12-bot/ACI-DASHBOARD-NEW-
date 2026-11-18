import { describe, expect, it } from "vitest";
import { businessOfBrand } from "./brands";

describe("businessOfBrand (his BRANDLIST via BALIAS)", () => {
  it.each([
    ["Savlon Soap", "Toiletries"], ["SkinZen", "Toiletries"], ["Savlon Men", "Toiletries"], ["Neem", "Toiletries"], ["Leona", "Toiletries"],
    ["Freedom Sanitary Napkin", "Hygiene"], ["Twinkle Baby Diaper", "Hygiene"], ["super dry", "Hygiene"],
    ["ACI Pure Salt", "Salt"], ["Mustard Oil", "Food & Beverage"], ["Unknown Brand", null],
  ])("%s -> %s", (name, biz) => expect(businessOfBrand(name)).toBe(biz));
  it("ignores prototype keys", () => {
    for (const k of ["constructor", "__proto__", "toString", "valueOf"]) expect(businessOfBrand(k), k).toBeNull();
  });
});
