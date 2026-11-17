import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionsSchema, type FilePreview } from "@/server/ingest";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  NEW_BUSINESS, addAllAsNew, canPublishAll, categoryDefaults, emptyDraft, greyReason, pickValue, postUploads, publishButtonLabel,
  publishedMessage, rowStatus, sameAsOptions, seenBrands, seenNames, setBusinessDecision, toDecisions, uploadForm, whenDhaka,
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
  it("needs a type when detection was unsure", () => {
    expect(rowStatus(preview({ canPublish: false, type: null, blockReason: "Pick the file type." }))).toBe("needs-type");
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
  it("keeps every payload inside the server's schema", () => {
    const long = "x".repeat(121);
    const d = draft({
      business: { value: NEW_BUSINESS, newName: "y".repeat(118) }, // new:<118> is over 120: left out
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
  it("counts the files on the publish button", () => {
    expect(publishButtonLabel(3)).toBe("Publish 3 files");
    expect(publishButtonLabel(1)).toBe("Publish 1 file");
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
  it("puts Data Entry in the Data group before Uploads & History", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/data-entry");
    expect(NAV_ITEMS[i]).toEqual({ href: "/data-entry", label: "Data Entry", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/uploads") - 1);
  });
});
