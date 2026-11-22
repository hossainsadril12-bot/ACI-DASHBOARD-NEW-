import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardFace } from "./card-face";
import { cardStates } from "./cards-state";

const [atl] = cardStates([], []);

describe("CardFace", () => {
  it("shows the title, one line with the file and the pages it updates, and what is in use", () => {
    const html = renderToStaticMarkup(createElement(CardFace, { state: atl }));
    expect(html).toContain('data-testid="upload-card"');
    expect(html).toContain('data-card-id="atl"');
    expect(html).toContain('id="card-atl"');
    expect(html).toContain("ATL (TV) performance");
    expect(html).toContain("2026 Dash Board files, one per TV category. Updates ATL and Home.");
    expect(html).toContain("In use: ");
    expect(html).toContain("nothing yet");
  });
  it("has no button for a viewer, and shows the admin's button when given", () => {
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }))).not.toContain("<button");
    expect(renderToStaticMarkup(createElement(CardFace, { state: atl }, createElement("button", null, "Upload Excel")))).toContain("Upload Excel</button>");
  });
});
