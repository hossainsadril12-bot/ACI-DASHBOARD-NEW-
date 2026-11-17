import { describe, expect, it } from "vitest";
import { suggestAtlCategory, suggestBusiness, suggestBusinessForBrand, suggestFullName, suggestOwnBrands } from "./suggestions";

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
  it("gives his category name and business; his own brands come from suggestOwnBrands", () => {
    expect(suggestAtlCategory("Savlon Soap")).toEqual({ name: "Savlon Soap", business: "Toiletries" });
    expect(suggestAtlCategory("Freedom Sanitary Napkin")).toEqual({ name: "Freedom Sanitary Napkin", business: "Hygiene" });
  });

  it("keeps his Septex rule: a Septex antiseptic title is Septex, not Antiseptic Liquid", () => {
    expect(suggestAtlCategory("Septex Antiseptic Bar")?.name).toBe("Septex Antiseptic Bar");
    expect(suggestAtlCategory("Savlon Antiseptic Liquid")?.name).toBe("Savlon Antiseptic Liquid");
  });

  it("never suggests Others as a business: Mustard Oil, Rice and Spices give business null", () => {
    expect(suggestAtlCategory("ACI Pure Spice")).toEqual({ name: "ACI Pure Spices", business: null });
    expect(suggestAtlCategory("ACI Pure Mustard Oil")).toEqual({ name: "ACI Pure Mustard Oil", business: null });
    expect(suggestAtlCategory("ACI Pure Fortified Rice")).toEqual({ name: "ACI Pure Fortified Rice", business: null });
  });

  it("is null for an unknown or blank title", () => {
    expect(suggestAtlCategory("Mosquito Coil")).toBeNull();
    expect(suggestAtlCategory("")).toBeNull();
  });
});

describe("suggestBusiness", () => {
  it("maps his file names to the 4 demo businesses", () => {
    expect(suggestBusiness("ACI Salt")).toBe("Salt");
    expect(suggestBusiness("aci  salt")).toBe("Salt");
    for (const n of ["Foods", "Food", "beverage"]) expect(suggestBusiness(n), n).toBe("Food & Beverage");
  });
  it("gives a demo business back in its own spelling", () => {
    expect(suggestBusiness(" toiletries ")).toBe("Toiletries");
    expect(suggestBusiness("HYGIENE")).toBe("Hygiene");
    expect(suggestBusiness("food & beverage")).toBe("Food & Beverage");
  });
  it("is null for anything else", () => {
    for (const n of ["CB Core", "SCJ", "", "constructor", "__proto__"]) expect(suggestBusiness(n), n).toBeNull();
  });
});

describe("suggestOwnBrands", () => {
  it("applies his own-brand rule to the file's brand rows, in row order", () => {
    const rows = ["Radhuni Masala", "ACI Pure Masala", "Pran Spice", "ACI Pure Halim Mix"];
    expect(suggestOwnBrands("ACI Pure Spice", rows)).toEqual(["ACI Pure Masala", "ACI Pure Halim Mix"]);
    expect(suggestOwnBrands("Twinkle Baby Diaper", ["MamyPoko", "Savlon Twinkle Baby Diaper"])).toEqual(["Savlon Twinkle Baby Diaper"]);
  });
  it("is empty for an unknown title", () => {
    expect(suggestOwnBrands("Lux Soap", ["Lux"])).toEqual([]);
  });
});
