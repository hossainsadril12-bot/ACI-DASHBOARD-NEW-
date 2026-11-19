import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FilePreview } from "@/server/ingest";
import { FileBlock, SkeletonBlock, type FileBlockProps } from "./file-block";
import { emptyDraft } from "./logic";

const preview = (over: Partial<FilePreview> = {}): FilePreview => ({
  index: 0, fileName: "digital.xlsx", sizeBytes: 10, sha256: "x",
  detection: { status: "sure", type: "digital" }, type: "digital",
  label: "Digital, Salt", summary: "3 platforms", datasetKey: "digital:salt",
  rowCount: 12, warnings: [], errors: [], canPublish: true, blockReason: null,
  business: { slug: "salt", name: "Salt" }, businessSource: "admin", needsBusiness: false,
  newBusinesses: [], newCategory: null, newBrands: [], pendingChanges: [], ...over,
});
const render = (over: Partial<FileBlockProps> = {}) => renderToStaticMarkup(createElement(FileBlock, {
  name: "digital.xlsx", cardType: "digital", fixedBusiness: false, preview: preview(), draft: emptyDraft(),
  businesses: [{ slug: "salt", name: "Salt" }], disabled: false,
  onDraft: () => {}, onTyping: () => {}, onCommit: () => {}, onRemove: null, ...over,
}));

describe("FileBlock", () => {
  it("asks for the business on the Digital card for another business", () => {
    expect(render()).toContain('aria-label="Business for digital.xlsx"');
  });
  it("offers only pickBusinesses for the file's business when given", () => {
    const html = render({
      businesses: [{ slug: "salt", name: "Salt" }, { slug: "hygiene", name: "Hygiene" }], pickBusinesses: [{ slug: "salt", name: "Salt" }],
      preview: preview({ business: null, needsBusiness: true, canPublish: false }),
    });
    const select = html.slice(html.indexOf('aria-label="Business for digital.xlsx"'), html.indexOf("</select>"));
    expect(select).toContain('value="salt"');
    expect(select).not.toContain('value="hygiene"');
  });
  it("still shows the business the server took from the brands, even one left out of pickBusinesses", () => {
    const html = render({
      businesses: [{ slug: "salt", name: "Salt" }, { slug: "hygiene", name: "Hygiene" }], pickBusinesses: [{ slug: "hygiene", name: "Hygiene" }],
      preview: preview({ businessSource: "brands" }),
    });
    const select = html.slice(html.indexOf('aria-label="Business for digital.xlsx"'), html.indexOf("</select>"));
    expect(select).toContain('<option value="salt" selected="">Salt</option>');
  });
  it("never asks for the business on a business's own Digital card", () => {
    expect(render({ fixedBusiness: true })).not.toContain("Business for digital.xlsx");
  });
  it("has no file type select: the card decides the type", () => {
    expect(render()).not.toContain("File type for");
    expect(render({ cardType: "atl", name: "atl.xlsx" })).not.toContain("Pick the file type");
  });
  it("shows what was read and the warnings to check", () => {
    const html = render({ cardType: "atl", name: "atl.xlsx", preview: preview({ type: "atl", label: "ATL, Lux Soap", summary: "4 months", warnings: ["Sheet GRP has no total."] }) });
    expect(html).toContain("What was read");
    expect(html).toContain("ATL, Lux Soap");
    expect(html).toContain("4 months");
    expect(html).toContain("Please check");
    expect(html).toContain("Sheet GRP has no total.");
  });
  it("shows a wrong-card error in red, with nothing read", () => {
    const msg = "This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.";
    const html = render({ cardType: "channel", name: "cal.xlsx", preview: preview({ type: null, label: null, summary: null, canPublish: false, blockReason: msg, errors: [msg] }) });
    expect(html).toContain(msg);
    expect(html).toContain("text-red-700");
    expect(html).not.toContain("What was read");
  });
  it("offers Remove only when the card takes several files", () => {
    expect(render({ onRemove: () => {} })).toContain('aria-label="Remove digital.xlsx"');
    expect(render()).not.toContain("Remove digital.xlsx");
  });
  it("keeps the preview-row test id", () => {
    expect(render()).toContain('data-testid="preview-row"');
  });
});

describe("SkeletonBlock", () => {
  it("says which file is being read", () => {
    expect(renderToStaticMarkup(createElement(SkeletonBlock, { name: "lux.xlsx" }))).toContain("Reading lux.xlsx…");
  });
});
