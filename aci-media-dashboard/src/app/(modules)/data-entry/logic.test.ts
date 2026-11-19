import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionsSchema, type FilePreview } from "@/server/ingest";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  MAX_NEW_BUSINESS_NAME, NEW_BUSINESS, addAllAsNew, afterPreview, brandMatches, brandPickValue, brandWarning, canPublishAll, categoryDefaults, emptyDraft, greyReason, pickValue, postUploads,
  publishedMessage, rowStatus, sameAsOptions, seenBrands, seenNames, setBusinessDecision, takeFiles, takeThenReset, tickShown, toDecisions, uploadForm, whenDhaka,
  type RowDraft,
} from "./logic";

const preview = (over: Partial<FilePreview> = {}): FilePreview => ({
  index: 0, fileName: "atl.xlsx", sizeBytes: 10, sha256: "x",
  detection: { status: "sure", type: "atl" }, type: "atl",
  label: "ATL, Savlon Soap, Jul'26 to Oct'26", summary: "4 months", datasetKey: "atl:soap",
  rowCount: 12, warnings: [], errors: [], canPublish: true, blockReason: null,
  business: null, businessSource: null, needsBusiness: false,
  newBusinesses: [], newCategory: null, newBrands: [], pendingChanges: [], ...over,
});

describe("rowStatus", () => {
  it("is ready when the file can be published", () => {
    expect(rowStatus(preview())).toBe("ready");
  });
  it("is blocked when no type was found", () => {
    expect(rowStatus(preview({ canPublish: false, type: null, blockReason: "Pick the file type." }))).toBe("blocked");
  });
  it("needs a business when the Digital file's business can't be worked out", () => {
    expect(rowStatus(preview({ type: "digital", canPublish: false, blockReason: "Pick the business.", needsBusiness: true }))).toBe("needs-business");
  });
  it("is blocked for any other reason", () => {
    expect(rowStatus(preview({ canPublish: false, blockReason: "Fix the read error first.", errors: ["Bad sheet"] }))).toBe("blocked");
  });
  it("asks about new businesses", () => {
    expect(rowStatus(newBiz)).toBe("new-business");
  });
  it("asks about a new ATL category", () => {
    expect(rowStatus(newCat)).toBe("new-category");
  });
});

const newBiz = preview({
  type: "calendar", canPublish: false, blockReason: "Decide the new businesses.",
  newBusinesses: [{ name: "CB Core", suggestion: null }, { name: "ACI Salt", suggestion: "Salt" }],
});
const newCat = preview({
  canPublish: false, blockReason: "Add the new ATL category.", label: null, datasetKey: null,
  newCategory: { title: "Lux Soap", suggestion: { business: "Toiletries", ownBrands: ["Lux"] }, brands: ["Lux", "Dove", "Lifebuoy"] },
});
const SALT = { slug: "salt", name: "Salt" };
const TOILETRIES = { slug: "toiletries", name: "Toiletries" };
const draft = (over: Partial<RowDraft> = {}): RowDraft => ({ ...emptyDraft(), ...over });

describe("new businesses", () => {
  it("addAllAsNew marks every new business name new", () => {
    expect(addAllAsNew(newBiz)).toEqual([{ name: "CB Core", action: "new" }, { name: "ACI Salt", action: "new" }]);
  });
  it("addAllAsNew keeps the decisions already made", () => {
    expect(addAllAsNew(preview({ newBusinesses: [{ name: "CB Core", suggestion: null }] }), [{ name: "ACI Salt", action: "same", slug: "salt" }]))
      .toEqual([{ name: "ACI Salt", action: "same", slug: "salt" }, { name: "CB Core", action: "new" }]);
  });
  it("keeps every name seen, in order, after it is decided", () => {
    const first = seenNames([], newBiz);
    expect(first).toEqual(["CB Core", "ACI Salt"]);
    expect(seenNames(first, preview({ newBusinesses: [{ name: "aci  salt", suggestion: null }, { name: "Hygiene", suggestion: null }] })))
      .toEqual(["CB Core", "ACI Salt", "Hygiene"]);
  });
  it("offers Add as new, the visible businesses and the other businesses this row adds", () => {
    const d = draft({ bizNames: ["CB Core", "ACI Salt", "Mosquito"], businesses: [{ name: "Mosquito", action: "same", slug: "salt" }] });
    expect(sameAsOptions("ACI Salt", d, [SALT])).toEqual([
      { value: "add", label: "Add as new" },
      { value: "same:salt", label: "Same as Salt" },
      { value: "same:new:CB Core", label: "Same as CB Core" }, // the file's own spelling, never a predicted slug
    ]);
  });
  it("sets, changes and clears a decision", () => {
    const names = ["CB Core", "ACI Salt"];
    let list = setBusinessDecision([], names, "CB Core", "add");
    expect(list).toEqual([{ name: "CB Core", action: "new" }]);
    list = setBusinessDecision(list, names, "ACI Salt", "same:salt");
    expect(list).toEqual([{ name: "CB Core", action: "new" }, { name: "ACI Salt", action: "same", slug: "salt" }]);
    expect(setBusinessDecision(list, names, "ACI Salt", "")).toEqual([{ name: "CB Core", action: "new" }]);
  });
  it("same as a business this row adds also adds that business", () => {
    expect(setBusinessDecision([], ["CB Core", "ACI Salt"], "ACI Salt", "same:new:CB Core")).toEqual([
      { name: "ACI Salt", action: "same", slug: "new:CB Core" },
      { name: "CB Core", action: "new" },
    ]);
  });
  it("drops decisions that point at a name no longer added", () => {
    const list = setBusinessDecision([], ["CB Core", "ACI Salt"], "ACI Salt", "same:new:CB Core");
    expect(setBusinessDecision(list, ["CB Core", "ACI Salt"], "CB Core", "same:salt")).toEqual([{ name: "CB Core", action: "same", slug: "salt" }]);
  });
});

describe("business picks", () => {
  it("sends a slug, or new:<typed name> for New business…", () => {
    expect(pickValue({ value: "salt", newName: "" })).toBe("salt");
    expect(pickValue({ value: NEW_BUSINESS, newName: "  Hygiene   Care " })).toBe("new:Hygiene Care");
    expect(pickValue({ value: NEW_BUSINESS, newName: "  " })).toBeNull();
    expect(pickValue({ value: "", newName: "x" })).toBeNull();
  });
  it("pre-fills a new category from the suggestion", () => {
    expect(categoryDefaults(newCat.newCategory!, [TOILETRIES])).toEqual({ business: { value: "toiletries", newName: "" }, ownBrands: ["Lux"] });
    expect(categoryDefaults(newCat.newCategory!, [SALT])).toEqual({ business: { value: NEW_BUSINESS, newName: "Toiletries" }, ownBrands: ["Lux"] });
    const none = { ...newCat.newCategory!, suggestion: { business: null, ownBrands: [] } };
    expect(categoryDefaults(none, [SALT])).toEqual({ business: { value: "", newName: "" }, ownBrands: [] });
  });
});

describe("toDecisions", () => {
  it("is null when nothing is decided", () => {
    expect(toDecisions(draft(), [SALT])).toBeNull();
    expect(toDecisions(draft({ business: { value: NEW_BUSINESS, newName: " " } }), [SALT])).toBeNull();
  });
  it("sends the Digital business pick", () => {
    expect(toDecisions(draft({ business: { value: NEW_BUSINESS, newName: "Hygiene" } }), [])).toEqual({ business: "new:Hygiene", businesses: [], brands: [] });
  });
  it("sends an added ATL category, never with empty or too many our brands", () => {
    const atl = { title: "Lux Soap", business: { value: NEW_BUSINESS, newName: "Toiletries" }, ownBrands: ["Lux"] };
    expect(toDecisions(draft({ atl }), [])).toEqual({ businesses: [], brands: [], atl: { business: "new:Toiletries", ownBrands: ["Lux"] } });
    expect(toDecisions(draft({ atl: { ...atl, ownBrands: [] } }), [])).toBeNull();
    const many = Array.from({ length: 60 }, (_, i) => `Brand ${i}`);
    expect(toDecisions(draft({ atl: { ...atl, ownBrands: many } }), [])!.atl!.ownBrands).toHaveLength(50);
  });
  it("sends ticked brands with the business their row names, resolved through this row's decisions", () => {
    const d = draft({
      bizNames: ["Toiletries", "ACI Salt", "CB Core"],
      businesses: [{ name: "Toiletries", action: "new" }, { name: "ACI Salt", action: "same", slug: "salt" }],
      brands: [
        { name: "Savlon HW", business: "Toiletries", suggestion: "Savlon Handwash", ticked: true, fullName: "Savlon Handwash", pick: "" },
        { name: "Salt Lite", business: "ACI Salt", suggestion: null, ticked: true, fullName: "Salt Lite", pick: "" },
        { name: "Coil", business: "CB Core", suggestion: null, ticked: true, fullName: "Coil", pick: "" }, // CB Core undecided: not sent yet
        { name: "Pure", business: "salt", suggestion: null, ticked: true, fullName: " Pure  Salt ", pick: "" }, // a visible business by name
        { name: "Mum", business: "ACI Foods", suggestion: null, ticked: true, fullName: "Mum", pick: "" }, // known by another name: the server finds it
        { name: "Unticked", business: "Toiletries", suggestion: null, ticked: false, fullName: "Unticked", pick: "" },
        { name: "Billboard X", business: null, suggestion: null, ticked: true, fullName: "Billboard X", pick: "salt" },
        { name: "Billboard Y", business: null, suggestion: null, ticked: true, fullName: "Billboard Y", pick: "" }, // no business picked
        { name: "Billboard Z", business: null, suggestion: null, ticked: true, fullName: "Billboard Z", pick: "new:ACI Salt" },
        { name: "Blank", business: "Toiletries", suggestion: null, ticked: true, fullName: "  ", pick: "" },
      ],
    });
    expect(toDecisions(d, [SALT])!.brands).toEqual([
      { name: "Savlon HW", fullName: "Savlon Handwash", business: "new:Toiletries" },
      { name: "Salt Lite", fullName: "Salt Lite", business: "salt" },
      { name: "Pure", fullName: "Pure Salt", business: "salt" },
      { name: "Mum", fullName: "Mum", business: "new:ACI Foods" },
      { name: "Billboard X", fullName: "Billboard X", business: "salt" },
      { name: "Billboard Z", fullName: "Billboard Z", business: "salt" },
    ]);
  });
  it("sends a 120-character new business name in the file pick, the ATL business and a brand's business", () => {
    const name = "y".repeat(MAX_NEW_BUSINESS_NAME);
    expect(MAX_NEW_BUSINESS_NAME).toBe(120);
    const picked = toDecisions(draft({ business: { value: NEW_BUSINESS, newName: name } }), [])!;
    expect(picked.business).toBe(`new:${name}`);
    const atl = toDecisions(draft({ atl: { title: "Lux Soap", business: { value: NEW_BUSINESS, newName: name }, ownBrands: ["Lux"] } }), [])!;
    expect(atl.atl!.business).toBe(`new:${name}`);
    const brand = toDecisions(draft({ brands: [{ name: "Coil", business: name, suggestion: null, ticked: true, fullName: "Coil", pick: "" }] }), [])!;
    expect(brand.brands[0].business).toBe(`new:${name}`);
    for (const out of [picked, atl, brand]) expect(DecisionsSchema.safeParse(out).success).toBe(true);
  });
  it("keeps every payload inside the server's schema", () => {
    const long = "x".repeat(121);
    const d = draft({
      business: { value: NEW_BUSINESS, newName: "y".repeat(121) }, // new:<121> is over 124: left out
      bizNames: Array.from({ length: 250 }, (_, i) => `Biz ${i}`),
      businesses: [...Array.from({ length: 250 }, (_, i) => ({ name: `Biz ${i}`, action: "new" as const })), { name: long, action: "new" }],
      brands: [
        ...Array.from({ length: 520 }, (_, i) => ({ name: `B${i}`, business: "Salt", suggestion: null, ticked: true, fullName: `B${i}`, pick: "" })),
        { name: long, business: "Salt", suggestion: null, ticked: true, fullName: "ok", pick: "" },
        { name: "ok", business: "Salt", suggestion: null, ticked: true, fullName: long, pick: "" },
      ],
    });
    const out = toDecisions(d, [SALT])!;
    expect(out.business).toBeUndefined();
    expect(out.businesses).toHaveLength(200);
    expect(out.brands).toHaveLength(500);
    expect(DecisionsSchema.safeParse(out).success).toBe(true);
  });
  it("keeps every brand seen, pre-filled with the suggestion or the name", () => {
    const p = preview({ newBrands: [{ name: "Savlon HW", business: "Toiletries", suggestion: "Savlon Handwash" }, { name: "Coil", business: null, suggestion: null }] });
    const first = seenBrands([], p);
    expect(first).toEqual([
      { name: "Savlon HW", business: "Toiletries", suggestion: "Savlon Handwash", ticked: false, fullName: "Savlon Handwash", pick: "" },
      { name: "Coil", business: null, suggestion: null, ticked: false, fullName: "Coil", pick: "" },
    ]);
    const ticked = first.map((b) => ({ ...b, ticked: true }));
    expect(seenBrands(ticked, preview({ newBrands: [{ name: "coil", business: null, suggestion: null }] }))).toEqual(ticked);
  });
  it("takes the business and suggestion of a brand from the newest preview, keeping the admin's choices", () => {
    const first = seenBrands([], preview({ newBrands: [{ name: "Freedom", business: "Hygiene", suggestion: null }] }))
      .map((b) => ({ ...b, ticked: true, fullName: "Freedom Pads" }));
    expect(seenBrands(first, preview({ newBrands: [{ name: "freedom", business: "Toiletries", suggestion: "Freedom Sanitary" }] }))).toEqual([
      { name: "Freedom", business: "Toiletries", suggestion: "Freedom Sanitary", ticked: true, fullName: "Freedom Pads", pick: "" },
    ]);
  });
});

describe("brands under the file's business (Digital, ATL)", () => {
  const brand = (name: string, business: string) => ({ name, business, suggestion: null });
  const tickAll = (d: RowDraft): RowDraft => ({ ...d, brands: d.brands.map((b) => ({ ...b, ticked: true })) });
  const sentBusinesses = (d: RowDraft) => JSON.stringify(toDecisions(d, [TOILETRIES]));

  it("sends a Digital file's brands under the business picked now, never an earlier pick", () => {
    const digital = preview({ type: "digital", business: { slug: null, name: "Hygiene" }, businessSource: "admin", newBrands: [brand("Freedom", "Hygiene")] });
    const d = tickAll(afterPreview(draft({ business: { value: NEW_BUSINESS, newName: "Hygiene" } }), digital));
    expect(toDecisions(d, [TOILETRIES])!.brands).toEqual([{ name: "Freedom", fullName: "Freedom", business: "new:Hygiene" }]);

    const toToiletries = { ...d, business: { value: "toiletries", newName: "" } };
    expect(toDecisions(toToiletries, [TOILETRIES])).toEqual({ business: "toiletries", businesses: [], brands: [{ name: "Freedom", fullName: "Freedom", business: "toiletries" }] });
    const renamed = { ...d, business: { value: NEW_BUSINESS, newName: "Personal Care" } };
    expect(toDecisions(renamed, [TOILETRIES])!.brands[0].business).toBe("new:Personal Care");
    const cleared = { ...d, business: { value: "", newName: "" } };
    expect(toDecisions(cleared, [TOILETRIES])).toBeNull();
    for (const x of [toToiletries, renamed, cleared]) expect(sentBusinesses(x)).not.toContain("Hygiene");
  });
  it("sends a Digital file's brands under the business the server found itself while nothing is picked", () => {
    const found = preview({ type: "digital", business: { slug: "toiletries", name: "Toiletries" }, businessSource: "brands", newBrands: [brand("Freedom", "Toiletries")] });
    let d = tickAll(afterPreview(draft(), found));
    expect(toDecisions(d, [TOILETRIES])!.brands[0].business).toBe("toiletries");
    // A later pick wins; clearing it again goes back to what the server found.
    d = afterPreview({ ...d, business: { value: NEW_BUSINESS, newName: "Hygiene" } },
      preview({ type: "digital", business: { slug: null, name: "Hygiene" }, businessSource: "admin", newBrands: [] }));
    expect(toDecisions(d, [TOILETRIES])!.brands[0].business).toBe("new:Hygiene");
    expect(toDecisions({ ...d, business: { value: "", newName: "" } }, [TOILETRIES])!.brands[0].business).toBe("toiletries");
  });
  it("sends a new ATL category's brands under the category's business now, and none after Change", () => {
    const atl = { title: "Lux Soap", business: { value: NEW_BUSINESS, newName: "Hygiene" }, ownBrands: ["Lux"] };
    const added = preview({ type: "atl", business: { slug: null, name: "Hygiene" }, businessSource: "admin", newBrands: [brand("Lux", "Hygiene")] });
    const d = tickAll(afterPreview(draft({ atl }), added));
    expect(toDecisions(d, [TOILETRIES])!.brands).toEqual([{ name: "Lux", fullName: "Lux", business: "new:Hygiene" }]);

    const moved = { ...d, atl: { ...atl, business: { value: "toiletries", newName: "" } } };
    expect(toDecisions(moved, [TOILETRIES])!.brands).toEqual([{ name: "Lux", fullName: "Lux", business: "toiletries" }]);
    const changed = { ...d, atl: null };
    expect(toDecisions(changed, [TOILETRIES])).toBeNull();
    for (const x of [moved, changed]) expect(sentBusinesses(x)).not.toContain("Hygiene");
  });
  it("sends a known ATL category's brands under that category's business", () => {
    const known = preview({ type: "atl", business: { slug: "toiletries", name: "Toiletries" }, businessSource: "category", newBrands: [brand("Lux", "Toiletries")] });
    expect(toDecisions(tickAll(afterPreview(draft(), known)), [TOILETRIES])!.brands[0].business).toBe("toiletries");
  });
  it("keeps the names and brands seen, as before", () => {
    const d = afterPreview(draft({ bizNames: ["CB Core"] }), preview({ type: "calendar", newBusinesses: [{ name: "Hygiene", suggestion: null }], newBrands: [brand("Coil", "CB Core")] }));
    expect(d.bizNames).toEqual(["CB Core", "Hygiene"]);
    expect(d.brands.map((b) => b.name)).toEqual(["Coil"]);
  });
});

describe("a brand's business pick (no business on its row)", () => {
  const d = draft({ bizNames: ["CB Core", "ACI Salt", "Mosquito"] });
  it("shows a slug as it is", () => {
    expect(brandPickValue("salt", d)).toBe("salt");
    expect(brandPickValue("", d)).toBe("");
  });
  it("shows the business a name of this row now goes to", () => {
    expect(brandPickValue("new:CB Core", { ...d, businesses: [{ name: "CB Core", action: "new" }] })).toBe("new:CB Core");
    expect(brandPickValue("new:ACI Salt", { ...d, businesses: [{ name: "ACI Salt", action: "same", slug: "salt" }] })).toBe("salt");
    const both = setBusinessDecision([], d.bizNames, "ACI Salt", "same:new:CB Core");
    expect(brandPickValue("new:ACI Salt", { ...d, businesses: both })).toBe("new:CB Core");
    expect(brandPickValue("new:aci salt", { ...d, businesses: both })).toBe("new:CB Core");
  });
  it("shows nothing picked when that name is undecided", () => {
    expect(brandPickValue("new:Mosquito", d)).toBe("");
  });
});

describe("brandWarning", () => {
  const b = (name: string) => ({ name, business: null, suggestion: null });
  it("is the server's warning line for the brands not on the list, or null when there are none", () => {
    expect(brandWarning(preview({ newBrands: [b("Neem")] }))).toBe("1 brand not on your list.");
    expect(brandWarning(preview({ newBrands: [b("Neem"), b("Coil")] }))).toBe("2 brands not on your list.");
    expect(brandWarning(preview())).toBeNull();
  });
});

describe("Review and add search", () => {
  const rows = ["Savlon Soap", "Savlon HW", "Neem", "Freedom"].map((name) => ({ name, business: null, suggestion: null, ticked: false, fullName: name, pick: "" }));
  it("finds brands by any part of the name, ignoring case and spaces", () => {
    expect(rows.filter((b) => brandMatches(b, "savlon")).map((b) => b.name)).toEqual(["Savlon Soap", "Savlon HW"]);
    expect(rows.filter((b) => brandMatches(b, "  SAVLON   hw ")).map((b) => b.name)).toEqual(["Savlon HW"]);
    expect(rows.filter((b) => brandMatches(b, " ")).length).toBe(4);
  });
  it("Tick all ticks only the brands the search shows", () => {
    expect(tickShown(rows, "savlon").map((b) => b.ticked)).toEqual([true, true, false, false]);
    expect(tickShown(rows, "").every((b) => b.ticked)).toBe(true);
  });
});

describe("greyReason", () => {
  it("shows the block reason when it is not already an error", () => {
    expect(greyReason(preview({ canPublish: false, blockReason: "Fix the read error first.", errors: ["Bad sheet"] }))).toBe("Fix the read error first.");
  });
  it("hides the block reason when it is already listed as an error", () => {
    const r = "This file could not be opened as an Excel workbook.";
    expect(greyReason(preview({ canPublish: false, blockReason: r, errors: [r] }))).toBeNull();
  });
  it("shows 'Pick the business.' in grey, not in the red list", () => {
    const p = preview({ type: "digital", canPublish: false, blockReason: "Pick the business.", needsBusiness: true });
    expect(greyReason(p)).toBe("Pick the business.");
    expect(p.errors).toEqual([]);
  });
  it("is empty for a ready row", () => {
    expect(greyReason(preview())).toBeNull();
  });
});

describe("canPublishAll", () => {
  it("needs every row ready", () => {
    expect(canPublishAll([preview(), preview({ index: 1 })], 2)).toBe(true);
    expect(canPublishAll([preview(), preview({ index: 1, canPublish: false, blockReason: "Pick the file type." })], 2)).toBe(false);
  });
  it("stays false while any row needs a business", () => {
    const stuck = preview({ index: 1, type: "digital", canPublish: false, blockReason: "Pick the business.", needsBusiness: true });
    expect(canPublishAll([preview(), stuck], 2)).toBe(false);
  });
  it("stays false while any row has new businesses or a new ATL category", () => {
    expect(canPublishAll([preview(), { ...newBiz, index: 1 }], 2)).toBe(false);
    expect(canPublishAll([preview(), { ...newCat, index: 1 }], 2)).toBe(false);
  });
  it("needs at least one row and previews for every file", () => {
    expect(canPublishAll([], 0)).toBe(false);
    expect(canPublishAll(null, 1)).toBe(false);
    expect(canPublishAll([preview()], 2)).toBe(false);
  });
});

describe("texts", () => {
  it("names the files that were published", () => {
    expect(publishedMessage([{ label: "ATL, Savlon Soap" }, { label: "Activity Calendar" }])).toBe("Published 2 files: ATL, Savlon Soap; Activity Calendar");
    expect(publishedMessage([{ label: "Activity Calendar" }])).toBe("Published 1 file: Activity Calendar");
  });
  it("shows the time in Dhaka", () => {
    expect(whenDhaka(new Date("2026-11-16T08:05:00Z"))).toBe("16 Nov 2026, 14:05");
  });
});

describe("uploadForm", () => {
  it("sends every file in order and only the chosen types", () => {
    const a = new File(["a"], "a.xlsx");
    const b = new File(["b"], "b.xlsx");
    const fd = uploadForm([a, b], ["", "calendar"], [null, null]);
    expect(fd.getAll("files").map((f) => (f as File).name)).toEqual(["a.xlsx", "b.xlsx"]);
    expect(fd.get("type-0")).toBeNull();
    expect(fd.get("type-1")).toBe("calendar");
  });
  it("sends decisions-<i> only for rows whose decisions have content", () => {
    const a = new File(["a"], "a.xlsx");
    const b = new File(["b"], "b.xlsx");
    const c = new File(["c"], "c.xlsx");
    const one = { businesses: [{ name: "CB Core", action: "new" as const }], brands: [] };
    const fd = uploadForm([a, b, c], ["", "", "digital"], [null, one, { businesses: [], brands: [] }]);
    expect(fd.get("decisions-0")).toBeNull();
    expect(JSON.parse(fd.get("decisions-1") as string)).toEqual(one);
    expect(fd.get("decisions-2")).toBeNull();
    expect([...fd.keys()].filter((k) => k.startsWith("decisions-"))).toEqual(["decisions-1"]);
    expect([...fd.keys()].some((k) => k.startsWith("business-"))).toBe(false);
  });
  it("sends a Digital business pick", () => {
    const fd = uploadForm([new File(["a"], "a.xlsx")], ["digital"], [{ business: "new:Hygiene", businesses: [], brands: [] }]);
    expect(JSON.parse(fd.get("decisions-0") as string)).toEqual({ business: "new:Hygiene", businesses: [], brands: [] });
  });
});

describe("postUploads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the JSON body on success", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: null, ok: true, previews: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const fd = new FormData();
    expect(await postUploads("/api/uploads/preview", fd)).toEqual({ error: null, ok: true, previews: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/preview", { method: "POST", body: fd });
  });
  it("shows the server's refusal as is", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Only the admin can do this." }, { status: 403 })));
    expect(await postUploads("/api/uploads/publish", new FormData())).toEqual({ error: "Only the admin can do this." });
  });
  it("gives a plain message when the reply is not JSON or the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502 })));
    expect((await postUploads("/api/uploads/publish", new FormData())).error).toBe("Something went wrong. Please try again.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect((await postUploads("/api/uploads/publish", new FormData())).error).toBe("The files could not be sent. Check the connection and try again.");
  });
});

describe("menu", () => {
  it("puts Data Entry first in the Data group, before Businesses & Brands", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/data-entry");
    expect(NAV_ITEMS[i]).toEqual({ href: "/data-entry", label: "Data Entry", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/businesses") - 1);
  });
});

describe("takeFiles", () => {
  const f = (name: string, size = 10) => ({ name, size });
  it("takes one file on a single-file card and says which extra files are left out", () => {
    expect(takeFiles([f("a.xlsx"), f("b.xlsx"), f("c.xlsx")], false)).toEqual({
      taken: [f("a.xlsx")], leftOut: ["b.xlsx, c.xlsx left out: this card takes one file."],
    });
  });
  it("takes every non-empty file on the ATL card", () => {
    expect(takeFiles([f("a.xlsx"), f("b.xlsx")], true)).toEqual({ taken: [f("a.xlsx"), f("b.xlsx")], leftOut: [] });
  });
  it("leaves out empty files, saying so", () => {
    expect(takeFiles([f("e.xlsx", 0), f("a.xlsx")], true)).toEqual({ taken: [f("a.xlsx")], leftOut: ["e.xlsx is empty and left out."] });
    expect(takeFiles([f("e.xlsx", 0), f("z.xlsx", 0)], false)).toEqual({ taken: [], leftOut: ["e.xlsx, z.xlsx are empty and left out."] });
  });
  it("gives both messages when there are extra and empty files", () => {
    expect(takeFiles([f("e.xlsx", 0), f("a.xlsx"), f("b.xlsx")], false).leftOut).toEqual([
      "b.xlsx left out: this card takes one file.", "e.xlsx is empty and left out.",
    ]);
  });
});

describe("takeThenReset", () => {
  it("copies the files out before the reset empties a live list (Chromium's input.files)", () => {
    const a = { name: "a.xlsx", size: 10 };
    const b = { name: "b.xlsx", size: 20 };
    const live = [a, b]; // stands in for input.files: clearing the input empties the same object
    const order: string[] = [];
    const got = takeThenReset(live, () => { order.push("reset"); live.length = 0; });
    expect(got).toEqual([a, b]);
    expect(order).toEqual(["reset"]);
    expect(live).toHaveLength(0);
  });
  it("gives no files for no list, and still resets", () => {
    const reset = vi.fn();
    expect(takeThenReset(null, reset)).toEqual([]);
    expect(reset).toHaveBeenCalledOnce();
  });
});
