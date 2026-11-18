import { describe, expect, it } from "vitest";
import { NAV_GROUPS, NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("puts Businesses & Brands in the Data group right after Uploads & History", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/businesses");
    expect(NAV_ITEMS[i]).toEqual({ href: "/businesses", label: "Businesses & Brands", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/uploads") + 1);
  });

  it("shows the groups as Home, Results, Plan and money, then Data", () => {
    expect(NAV_GROUPS).toEqual(["", "Results", "Plan and money", "Data"]);
  });

  it("lists the items in the same order as their groups", () => {
    const order = NAV_ITEMS.map((n) => NAV_GROUPS.indexOf(n.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
