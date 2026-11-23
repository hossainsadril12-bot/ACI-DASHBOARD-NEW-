import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRD_PAGES, prdPage } from "./nav-items";

const root = path.join(process.cwd(), "src", "app", "(modules)");
const routeFile = (href: string) => path.join(root, ...href.split("/").filter(Boolean), "page.tsx");

describe("PRD pages not built yet", () => {
  const unbuilt = PRD_PAGES.filter((p) => !p.built);
  it("has some", () => expect(unbuilt.length).toBeGreaterThan(0));
  for (const p of unbuilt) {
    it(`${p.href} has one route file that calls BeingBuilt with its own href`, () => {
      const file = routeFile(p.href);
      expect(fs.existsSync(file), file).toBe(true);
      const src = fs.readFileSync(file, "utf8");
      expect(src).toContain(`<BeingBuilt href="${p.href}" />`);
      expect(src.match(/<BeingBuilt\b/g)).toHaveLength(1);
    });
  }
});

describe("sidebar names", () => {
  it("names 7.2 as the spec does", () => expect(prdPage("/settings")?.label).toBe("Data Sources and USD rate"));
});
