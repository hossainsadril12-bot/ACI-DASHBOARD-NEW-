import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoDataYet } from "./no-data-yet";

describe("NoDataYet", () => {
  it("names the file and gives the admin an Upload it link to the card", () => {
    const html = renderToStaticMarkup(<NoDataYet fileName="CB Media Spent Report" card="fy" admin />);
    expect(html).toContain("No data yet");
    expect(html).toContain("This page needs the CB Media Spent Report file.");
    expect(html).toContain('href="/data-entry#card-fy"');
    expect(html).toContain("Upload it");
  });
  it("tells a viewer it is not uploaded yet, with no link", () => {
    const html = renderToStaticMarkup(<NoDataYet fileName="CB Media Spent Report" card="fy" admin={false} />);
    expect(html).toContain("Not uploaded yet. The admin uploads it in Data Entry.");
    expect(html).not.toContain("Upload it");
  });
});
