import { describe, expect, it } from "vitest";
import { businessFilterView } from "./business-filter";

const biz = (n: number, hiddenAt: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ slug: `b${i}`, name: `Business ${i}`, hidden: hiddenAt.includes(i) }));

describe("businessFilterView", () => {
  it("is none when there are no visible businesses", () => {
    expect(businessFilterView([], undefined).mode).toBe("none");
    expect(businessFilterView(biz(2, [0, 1]), undefined).mode).toBe("none");
  });
  it("uses buttons up to 4 and a dropdown from 5", () => {
    expect(businessFilterView(biz(4), undefined).mode).toBe("buttons");
    expect(businessFilterView(biz(5), undefined).mode).toBe("dropdown");
    expect(businessFilterView(biz(5, [4]), undefined).mode).toBe("buttons"); // counts visible only
  });
  it("leaves hidden businesses out, keeping list order", () => {
    expect(businessFilterView(biz(3, [1]), undefined).options.map((o) => o.slug)).toEqual(["b0", "b2"]);
  });
  it("keeps a saved choice that is still visible, else falls back to All", () => {
    expect(businessFilterView(biz(3), "b2").value).toBe("b2");
    expect(businessFilterView(biz(3, [2]), "b2").value).toBe("");
    expect(businessFilterView(biz(3), "gone").value).toBe("");
    expect(businessFilterView(biz(3), undefined).value).toBe("");
  });
});
