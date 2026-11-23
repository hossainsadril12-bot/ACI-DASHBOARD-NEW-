import { describe, expect, it } from "vitest";
import { PRD_PAGES, PRD_SECTIONS, activeHref, prdPage } from "./nav-items";

describe("PRD_SECTIONS", () => {
  it("follows the PRD numbering, 1 to 7, without 7.1", () => {
    expect(PRD_SECTIONS.map((s) => `${s.code} ${s.label}`)).toEqual([
      "1 Home", "2 Campaign Performance", "3 Media Spend", "4 Channel Wise Spend",
      "5 Billing & Statement", "6 Data Entry", "7 Settings",
    ]);
    expect(PRD_PAGES.map((p) => p.code)).toEqual([
      "1", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "4.1", "4.2", "4.3",
      "5.1", "5.2", "5.3", "5.4", "6.1", "6.2", "6.3", "6.4", "7.2", "7.3",
    ]);
  });

  it("gives every page a unique route", () => {
    const hrefs = PRD_PAGES.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(prdPage("/atl")?.label).toBe("ATL Media Performance");
    expect(prdPage("/data-entry?tab=manual")?.label).toBe("Manual Entry");
    expect(prdPage("/businesses")?.code).toBe("6.4");
  });

  it("names a file or a note on every unbuilt page", () => {
    for (const p of PRD_PAGES.filter((x) => !x.built)) expect(p.files ?? p.note, p.code).toBeTruthy();
  });

  it("marks only FY Media Spend, Data Entry, Businesses & Brands and Settings 7.2 as built", () => {
    expect(PRD_PAGES.filter((p) => p.built).map((p) => p.code)).toEqual(["3.2", "6.1", "6.2", "6.3", "6.4", "7.2"]);
  });

  it("hides the Business filter on Channel Wise, Data Entry and Settings", () => {
    expect(PRD_PAGES.filter((p) => !p.businessFilter).map((p) => p.code)).toEqual([
      "4.1", "4.2", "4.3", "6.1", "6.2", "6.3", "6.4", "7.2", "7.3",
    ]);
  });

  it("does not list the old sample pages", () => {
    const hrefs = PRD_PAGES.map((p) => p.href);
    for (const old of ["/performance", "/digital", "/competitors", "/plan", "/spend", "/billing", "/uploads"]) expect(hrefs).not.toContain(old);
  });
});

describe("activeHref", () => {
  it("matches Home only on /", () => {
    expect(activeHref("/", null)).toBe("/");
    expect(activeHref("/atl", null)).toBe("/atl");
  });
  it("uses the tab on Data Entry", () => {
    expect(activeHref("/data-entry", null)).toBe("/data-entry");
    expect(activeHref("/data-entry", "manual")).toBe("/data-entry?tab=manual");
    expect(activeHref("/data-entry", "history")).toBe("/data-entry?tab=history");
    expect(activeHref("/data-entry", "nonsense")).toBe("/data-entry");
  });
  it("keeps a sub page under its parent and prefers the longest match", () => {
    expect(activeHref("/businesses/salt", null)).toBe("/businesses");
    expect(activeHref("/settings/access", null)).toBe("/settings/access");
    expect(activeHref("/settings", null)).toBe("/settings");
    expect(activeHref("/billing/overview", null)).toBe("/billing/overview");
  });
  it("highlights nothing on an old page", () => {
    for (const p of ["/billing", "/spend", "/old-home", "/digital"]) expect(activeHref(p, null), p).toBeNull();
  });
});
