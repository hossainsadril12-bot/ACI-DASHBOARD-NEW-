import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardFace } from "./card-face";
import { cardStates } from "./cards-state";

const [atl] = cardStates([], []);

describe("CardFace", () => {
  it("shows the title, the file it expects, what it updates and what it shows now", () => {
    const html = renderToStaticMarkup(createElement(CardFace, { state: atl }));
    expect(html).toContain('data-testid="upload-card"');
    expect(html).toContain('data-card-id="atl"');
    expect(html).toContain("ATL (TV) performance");
    expect(html).toContain("one per TV category");
    expect(html).toContain("Updates: ");
    expect(html).toContain("ATL Media Performance, Home");
    expect(html).toContain("Now showing: ");
    expect(html).toContain("nothing uploaded yet");
  });
  it("has no button for a viewer, and shows the admin's button when given", () => {
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }))).not.toContain("<button");
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }, createElement("button", null, "Upload Excel")))).toContain("Upload Excel</button>");
  });
});
