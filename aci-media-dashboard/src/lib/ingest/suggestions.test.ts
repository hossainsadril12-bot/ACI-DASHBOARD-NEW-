import { describe, expect, it } from "vitest";
import { suggestAtlCategory, suggestBusinessForBrand, suggestFullName } from "./suggestions";

describe("suggestFullName", () => {
  it("gives his official name for a short name", () => {
    expect(suggestFullName("Savlon HW")).toBe("Savlon Handwash");
    expect(suggestFullName("  freedom ")).toBe("Freedom Sanitary Napkin");
  });

  it("gives an official name back as itself, in his spelling", () => {
    expect(suggestFullName("Savlon Handwash")).toBe("Savlon Handwash");
    expect(suggestFullName("savlon  handwash")).toBe("Savlon Handwash");
  });

  it("is null for an unknown or blank name", () => {
    expect(suggestFullName("Mosquito Coil")).toBeNull();
    expect(suggestFullName("  Mosquito   Coil ")).toBeNull();
    expect(suggestFullName("")).toBeNull();
  });
});

describe("suggestBusinessForBrand", () => {
  it("gives his BRANDLIST business", () => {
    expect(suggestBusinessForBrand("Freedom")).toBe("Hygiene");
    expect(suggestBusinessForBrand("Savlon Soap")).toBe("Toiletries");
  });

  it("is null for an unknown name", () => {
    expect(suggestBusinessForBrand("Mosquito Coil")).toBeNull();
  });
});

describe("suggestAtlCategory", () => {
  it("gives his category name and business; the own brand is left to the file's rows", () => {
    expect(suggestAtlCategory("Savlon Soap")).toEqual({ name: "Savlon Soap", business: "Toiletries", ownBrand: null });
    expect(suggestAtlCategory("Freedom Sanitary Napkin")).toEqual({ name: "Freedom Sanitary Napkin", business: "Hygiene", ownBrand: null });
  });

  it("keeps his Septex rule: a Septex antiseptic title is Septex, not Antiseptic Liquid", () => {
    expect(suggestAtlCategory("Septex Antiseptic Bar")?.name).toBe("Septex Antiseptic Bar");
    expect(suggestAtlCategory("Savlon Antiseptic Liquid")?.name).toBe("Savlon Antiseptic Liquid");
  });

  it("never suggests Others as a business: Mustard Oil, Rice and Spices give business null", () => {
    expect(suggestAtlCategory("ACI Pure Spice")).toEqual({ name: "ACI Pure Spices", business: null, ownBrand: null });
    expect(suggestAtlCategory("ACI Pure Mustard Oil")).toEqual({ name: "ACI Pure Mustard Oil", business: null, ownBrand: null });
    expect(suggestAtlCategory("ACI Pure Fortified Rice")).toEqual({ name: "ACI Pure Fortified Rice", business: null, ownBrand: null });
  });

  it("is null for an unknown or blank title", () => {
    expect(suggestAtlCategory("Mosquito Coil")).toBeNull();
    expect(suggestAtlCategory("")).toBeNull();
  });
});
