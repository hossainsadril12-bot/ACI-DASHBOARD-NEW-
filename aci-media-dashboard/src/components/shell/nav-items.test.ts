import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("puts Businesses & Brands in the Data group right after Uploads & History", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/businesses");
    expect(NAV_ITEMS[i]).toEqual({ href: "/businesses", label: "Businesses & Brands", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/uploads") + 1);
  });
});
