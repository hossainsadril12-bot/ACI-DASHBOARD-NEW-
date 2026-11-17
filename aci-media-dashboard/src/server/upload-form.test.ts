import { describe, expect, it } from "vitest";
import { parseDecisions, readUploadForm } from "./upload-form";

describe("parseDecisions", () => {
  it("reads valid decisions, with defaults", () => {
    expect(parseDecisions(JSON.stringify({ business: "new:Salt" }))).toEqual({ business: "new:Salt", businesses: [], brands: [] });
    expect(parseDecisions(JSON.stringify({ businesses: [{ name: "ACI Salt", action: "same", slug: "salt" }], extra: 1 }))).toEqual({
      businesses: [{ name: "ACI Salt", action: "same", slug: "salt" }], brands: [],
    });
  });
  it("ignores anything else: not a string, bad JSON, wrong shape, too long", () => {
    for (const v of [null, 5, new File(["{}"], "x"), "", "{bad", "[]", "null", JSON.stringify({ business: 1 }),
      JSON.stringify({ businesses: [{ name: "x", action: "merge" }] }),
      JSON.stringify({ atl: { business: "salt", ownBrands: [] } }),
      JSON.stringify({ brands: [{ name: "x".repeat(121), fullName: "x", business: "salt" }] }),
      JSON.stringify({ business: "salt", pad: "x".repeat(300_000) }),
    ]) expect(parseDecisions(v as FormDataEntryValue | null), String(v).slice(0, 40)).toBeNull();
  });
});

describe("readUploadForm", () => {
  it("takes decisions-<i> for file i only", async () => {
    const fd = new FormData();
    fd.append("files", new File(["a"], "a.xlsx"));
    fd.append("files", new File(["b"], "b.xlsx"));
    fd.set("decisions-1", JSON.stringify({ business: "salt" }));
    fd.set("business-0", "Salt"); // the old field is gone
    const inputs = await readUploadForm(fd);
    expect(inputs.map((i) => i.decisions)).toEqual([null, { business: "salt", businesses: [], brands: [] }]);
  });
});
