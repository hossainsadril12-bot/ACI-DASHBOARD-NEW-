import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prdPage } from "./nav-items";
import { BeingBuiltBody } from "./being-built";

describe("BeingBuiltBody", () => {
  it("names the file and links the admin to the card", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/calendar")!} admin />);
    expect(html).toContain("This page is being built.");
    expect(html).toContain("It will read: the All Activity Calendar file");
    expect(html).toContain('href="/data-entry#card-calendar"');
    const link = html.match(/<a [^>]*href="\/data-entry#card-calendar"[^>]*>/)?.[0] ?? "";
    expect(link).toMatch(/\bh-10\b/);
    expect(link).not.toMatch(/\bh-9\b/);
  });
  it("gives a viewer no link", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/calendar")!} admin={false} />);
    expect(html).not.toContain("/data-entry#card-calendar");
  });
  it("shows the note when the page reads no file", () => {
    const html = renderToStaticMarkup(<BeingBuiltBody page={prdPage("/settings/access")!} admin />);
    expect(html).toContain("Per-person access is switched off for now.");
    expect(html).not.toContain("It will read");
  });
});
