import { describe, expect, it } from "vitest";
import { businessOfBrand, isDigitalBusiness, resolveDigitalBusiness } from "./brands";

describe("businessOfBrand (his BRANDLIST via BALIAS)", () => {
  it.each([
    ["Savlon Soap", "Toiletries"], ["SkinZen", "Toiletries"], ["Savlon Men", "Toiletries"], ["Neem", "Toiletries"], ["Leona", "Toiletries"],
    ["Freedom Sanitary Napkin", "Hygiene"], ["Twinkle Baby Diaper", "Hygiene"], ["super dry", "Hygiene"],
    ["ACI Pure Salt", "Salt"], ["Mustard Oil", "Food & Beverage"], ["Unknown Brand", null],
  ])("%s -> %s", (name, biz) => expect(businessOfBrand(name)).toBe(biz));
});

describe("resolveDigitalBusiness", () => {
  it("is sure from the brands when they all point to one business", () => {
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin", "Twinkle Baby Diaper", "Mystery"], fileName: "x.xlsx", chosen: null }))
      .toEqual({ business: "Hygiene", source: "brands" });
  });
  it("uses the file name when the brands are mixed or unknown", () => {
    expect(resolveDigitalBusiness({ brands: ["Savlon Soap", "ACI Pure Salt"], fileName: "Salt_Business.xlsx", chosen: null }))
      .toEqual({ business: "Salt", source: "file name" });
    expect(resolveDigitalBusiness({ brands: ["Mystery"], fileName: "Hygiene_Business.xlsx", chosen: null }))
      .toEqual({ business: "Hygiene", source: "file name" });
  });
  it("returns null when nothing settles it", () => {
    expect(resolveDigitalBusiness({ brands: ["Mystery"], fileName: "digital.xlsx", chosen: null })).toBeNull();
    expect(resolveDigitalBusiness({ brands: ["Savlon Soap", "ACI Pure Salt"], fileName: "Toiletries and Salt.xlsx", chosen: null })).toBeNull();
  });
  it("the admin's pick always wins", () => {
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin"], fileName: "x.xlsx", chosen: "Salt" })).toEqual({ business: "Salt", source: "admin" });
  });
  it("ignores a runtime-invalid admin pick and falls through", () => {
    const bad = (v: string) => v as unknown as "Salt";
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin"], fileName: "x.xlsx", chosen: bad("constructor") })).toEqual({ business: "Hygiene", source: "brands" });
    expect(resolveDigitalBusiness({ brands: ["Freedom Sanitary Napkin"], fileName: "x.xlsx", chosen: bad("Foo") })).toEqual({ business: "Hygiene", source: "brands" });
    expect(resolveDigitalBusiness({ brands: ["Mystery"], fileName: "digital.xlsx", chosen: bad("Foo") })).toBeNull();
  });
  it("businessOfBrand ignores prototype keys", () => {
    for (const k of ["constructor", "__proto__", "toString", "valueOf"]) expect(businessOfBrand(k), k).toBeNull();
  });
  it("allows only the three Digital businesses", () => {
    expect(isDigitalBusiness("Hygiene")).toBe(true);
    expect(isDigitalBusiness("Food & Beverage")).toBe(false);
    expect(isDigitalBusiness("constructor")).toBe(false);
  });
});
