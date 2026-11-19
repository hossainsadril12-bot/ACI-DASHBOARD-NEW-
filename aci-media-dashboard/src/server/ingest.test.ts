import { afterAll, describe, expect, it, vi } from "vitest";
import { READERS } from "@/lib/ingest/readers";
import { createTestStore as openTestStore } from "@/store/test-store";
import * as datasets from "@/store/datasets";
import { getActiveData, listHistory } from "@/store/datasets";
import { applyCatalogChanges, createBrand, createBusiness, getCatalog, setAtlHidden, setBusinessHidden, type CatalogChange } from "@/store/catalog";
import { ValidationError } from "./errors";
import { ReadError } from "@/lib/ingest/read-result";
import { makeXlsx, clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { NOT_USUAL_FILE } from "@/lib/ingest/detect";
import { OOH_MASTER_MESSAGE, cardForType, notThisFileMessage, wrongCardMessage } from "@/lib/ingest/cards";
import type { FileType } from "@/lib/ingest/file-types";
import type { AtlCategory } from "@/lib/ingest/readers/atl";
import type { Store } from "@/store/client";
import { DecisionsSchema, previewUploads, publishUploads, type Decisions, type FilePreview, type UploadInput } from "./ingest";

/**
 * Every store this file opens, closed once its tests are done: libSQL clients left open for the worker's exit can
 * crash it on Windows (0xC0000005) after every test has passed.
 */
const opened: Store[] = [];
async function createTestStore(): Promise<Store> {
  const store = await openTestStore();
  opened.push(store);
  return store;
}
afterAll(() => { for (const s of opened.splice(0)) s.$client.close(); });

const u8 = (b: Buffer) => new Uint8Array(b);
const calendarBook = (sheet = "Nov'26", grandTotal = true) => makeXlsx([{ name: sheet, rows: [
  [`CB Media Activity ${sheet}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ...(grandTotal ? [["Grand Total", null, 1, 0.5, 0, 0, 1.5]] : []),
] }]);
/** A calendar with the given (business, brand) rows: a synthetic file with a business column. */
const calBook = (rows: [string | null, string][]) => makeXlsx([{ name: "Nov'26", rows: [
  ["CB Media Activity Nov'26"], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ...rows.map(([biz, b]) => [biz, b, 1, 0, 0, 0, 1]), ["Grand Total", null, 1, 0, 0, 0, 1],
] }]);
const file = (name: string, b: Buffer, chosenType: UploadInput["chosenType"] = null): UploadInput => ({ name, bytes: u8(b), chosenType });
const dec = (d: unknown): Decisions => DecisionsSchema.parse(d);
const decide = (f: UploadInput, d: unknown): UploadInput => ({ ...f, decisions: dec(d) });
/** A store whose business list already has these names (the calendar test file uses Toiletries). */
async function storeWith(...names: string[]): Promise<Store> {
  const store = await createTestStore();
  for (const n of names) await createBusiness(store, n);
  return store;
}
const calStore = () => storeWith("Toiletries");
const addAll = (store: Store, changes: CatalogChange[]) => store.transaction((tx) => applyCatalogChanges(tx, changes));
/** Decides every new business in a preview as "new". */
const allNew = (p: FilePreview) => p.newBusinesses.map((n) => ({ name: n.name, action: "new" as const }));
/** Runs `change` once, just before Publish opens its transaction: the lists change after Publish has re-read the files. */
function changeBeforePublish(store: Store, change: () => Promise<unknown>) {
  const original = store.transaction.bind(store);
  (store as { transaction: Store["transaction"] }).transaction = (async (fn: Parameters<Store["transaction"]>[0]) => {
    (store as { transaction: Store["transaction"] }).transaction = original;
    await change();
    return original(fn);
  }) as Store["transaction"];
}

describe("previewUploads", () => {
  it("previews a sure, readable file as publishable", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook())]);
    expect(p).toMatchObject({ fileName: "cal.xlsx", type: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", datasetKey: "calendar", canPublish: true, blockReason: null, errors: [] });
    expect(p.detection).toEqual({ status: "sure", type: "calendar" });
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("blocks a file that is not Excel", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("x.xlsx", Buffer.from("not excel"))]);
    expect(p).toMatchObject({ canPublish: false, detection: null, errors: ["This is not an Excel (.xlsx) file. Save it as Excel Workbook (.xlsx) and try again."] });
  });
  it("blocks a workbook that is none of his files", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("x.xlsx", makeXlsx([{ name: "S", rows: [["a"]] }]))]);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: "This is not one of the usual Media Mind files." });
    expect(p.errors[0]).toMatch(/^This is not one of the usual Media Mind files\. We look for/);
  });
  it("asks the admin to pick when unsure, then reads it as the picked type", async () => {
    const store = await calStore();
    const [unsure] = await previewUploads(store, [file("c.xlsx", calendarBook("Nov'26", false))]);
    expect(unsure).toMatchObject({ canPublish: false, type: null, blockReason: "Pick the file type.", errors: [] });
    expect(unsure.detection).toEqual({ status: "unsure", candidates: ["calendar"] });
    const [picked] = await previewUploads(store, [file("c.xlsx", calendarBook("Nov'26", false), "calendar")]);
    expect(picked).toMatchObject({ canPublish: true, type: "calendar" });
    expect(picked.warnings).toContain('Sheet "Nov\'26" has no Grand Total row; read to the last row.');
  });
  it("reads a recognised Channel Cost file with its reader and blocks on its read error", async () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"]] }, { name: "Digital", rows: [["SL", "Platform"]] }, { name: "Press & Radio", rows: [["SL", "Name"]] }]);
    const [p] = await previewUploads(await createTestStore(), [file("ch.xlsx", b)]);
    expect(p).toMatchObject({ type: "channel", canPublish: false, blockReason: "Fix the read error first." });
    expect(p.errors).toHaveLength(1);
  });
  it("shows read errors and blocks", async () => {
    const store = await storeWith("Toiletries");
    await addAll(store, [{ op: "addAtl", name: "Lux Soap", businessSlug: "toiletries", ownBrands: ["Lux"] }]);
    const [p] = await previewUploads(store, [file("a.xlsx", makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }]), "atl")]);
    expect(p.canPublish).toBe(false);
    expect(p.blockReason).toBe("Fix the read error first.");
    expect(p.errors).toEqual(["No months with TV activity were found for Lux Soap."]);
  });
  it("blocks two files for the same dataset", async () => {
    const ps = await previewUploads(await calStore(), [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook("Dec'26"))]);
    expect(ps.map((p) => p.blockReason)).toEqual([expect.stringMatching(/^Two files are for Activity Calendar/), expect.stringMatching(/^Two files are for Activity Calendar/)]);
    expect(ps.every((p) => !p.canPublish)).toBe(true);
  });
  it("warns when the file is the one already in use", async () => {
    const store = await calStore();
    await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    const [p] = await previewUploads(store, [file("cal-again.xlsx", calendarBook())]);
    expect(p.warnings).toContain("This is the same file as the one in use.");
    expect(p.canPublish).toBe(true);
  });
  it("blocks a file sent for another card when detection is sure, naming the card to use", async () => {
    const store = await calStore();
    const msg = wrongCardMessage(cardForType("channel")!, "calendar");
    expect(msg).toBe("This looks like an Activity Calendar file, not Channel Cost. Close this and use the Monthly activity calendar card.");
    const [p] = await previewUploads(store, [file("cal.xlsx", calendarBook(), "channel")]);
    expect(p).toMatchObject({ canPublish: false, type: null, label: null, datasetKey: null, blockReason: msg, errors: [msg] });
    expect(p.warnings.join(" ")).not.toMatch(/Detected as/);
    await expect(publishUploads(store, [file("cal.xlsx", calendarBook(), "channel")])).rejects.toThrow(new ValidationError(`cal.xlsx: ${msg}`));
    expect(await listHistory(store)).toEqual([]);
  });
  it("reads a file sent for its own card as usual, with no detection warning", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook(), "calendar")]);
    expect(p).toMatchObject({ type: "calendar", canPublish: true, errors: [] });
    expect(p.warnings.join(" ")).not.toMatch(/Detected as/);
  });
  it("reads an unsure file as the card's type, and the reader's own errors decide", async () => {
    const [p] = await previewUploads(await calStore(), [file("c.xlsx", calendarBook("Nov'26", false), "channel")]);
    expect(p.detection).toEqual({ status: "unsure", candidates: ["calendar"] });
    expect(p).toMatchObject({ type: "channel", canPublish: false });
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).not.toMatch(/looks like|This is not/);
  });
  it("blocks the OOH master sheet on any card, saying where it is uploaded", async () => {
    const ooh = makeXlsx([{ name: "Sites", rows: [["SL", "OOH Location", "Latitude", "Longitude"], [1, "Gulshan 1", 23.78, 90.41]] }]);
    for (const t of ["billboard", "calendar"] as const) {
      const [p] = await previewUploads(await createTestStore(), [file("ooh.xlsx", ooh, t)]);
      expect(p, t).toMatchObject({ canPublish: false, type: null, blockReason: OOH_MASTER_MESSAGE, errors: [OOH_MASTER_MESSAGE] });
    }
    const [noCard] = await previewUploads(await createTestStore(), [file("ooh.xlsx", ooh)]);
    expect(noCard.type).toBe("ooh-sites"); // with no card, the API reads it as before
  });
  it("still blocks a sure mismatch for a type with no card (the OOH master sheet, API only)", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook(), "ooh-sites")]);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: "This looks like Activity Calendar, not OOH master sheet." });
  });
  it("ignores an unknown type override and falls back to detection", async () => {
    const store = await calStore();
    for (const bad of ["constructor", "zzz", "toString"]) {
      const [p] = await previewUploads(store, [file("cal.xlsx", calendarBook(), bad as UploadInput["chosenType"])]);
      expect(p).toMatchObject({ type: "calendar", canPublish: true, datasetKey: "calendar" });
      expect(JSON.stringify(p)).not.toContain("undefined");
      expect([...p.warnings, ...p.errors, p.blockReason ?? ""].join(" ")).not.toContain("undefined");
    }
  });
  it("does not let an unknown override publish an unrecognised workbook", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("x.xlsx", makeXlsx([{ name: "S", rows: [["a"]] }]), "constructor" as UploadInput["chosenType"])]);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: "This is not one of the usual Media Mind files." });
  });
  it("blocks a workbook that is none of his files on any card, saying what the card expects", async () => {
    // Calendar layout, but no month in the sheet name or A1 alone, so detection says none; the calendar reader could still read it.
    const book = makeXlsx([{ name: "26", rows: [["CB Media Activity Nov"], ["Business", "Brand", "Media"], [null, null, "TV", "Total"], ["T", "Savlon Soap", 1, 1], ["Grand Total", null, 1, 1]] }]);
    const store = await createTestStore();
    const msg = notThisFileMessage(cardForType("calendar")!);
    const [p] = await previewUploads(store, [file("x.xlsx", book, "calendar")]);
    expect(p.detection?.status).toBe("none");
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: msg, errors: [msg] });
    await expect(publishUploads(store, [file("x.xlsx", book, "calendar")])).rejects.toThrow(new ValidationError(`x.xlsx: ${msg}`));
    // With no card (the API without type-<i>), the old message stays.
    const [noCard] = await previewUploads(store, [file("x.xlsx", book)]);
    expect(noCard).toMatchObject({ canPublish: false, blockReason: "This is not one of the usual Media Mind files.", errors: [NOT_USUAL_FILE] });
  });
  it("only warns about the file in use on publishable previews", async () => {
    const store = await calStore();
    await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    const ps = await previewUploads(store, [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook())]);
    expect(ps.every((p) => !p.canPublish)).toBe(true);
    expect(ps.every((p) => !p.warnings.includes("This is the same file as the one in use."))).toBe(true);
  });
  it("keeps input order", async () => {
    const ps = await previewUploads(await calStore(), [file("z.xlsx", Buffer.from("x")), file("a.xlsx", calendarBook())]);
    expect(ps.map((p) => [p.index, p.fileName])).toEqual([[0, "z.xlsx"], [1, "a.xlsx"]]);
  });
  it("limits the batch", async () => {
    const store = await createTestStore();
    await expect(previewUploads(store, [])).rejects.toThrow("Choose at least one Excel file.");
    const many = Array.from({ length: 31 }, (_, i) => file(`${i}.xlsx`, calendarBook()));
    await expect(previewUploads(store, many)).rejects.toThrow("Upload at most 30 files at a time.");
  });
});

describe("publishUploads", () => {
  it("publishes, keeps the original file and shows it in Upload History", async () => {
    const store = await calStore();
    const res = await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    expect(res.published).toEqual([{ datasetKey: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", versionId: expect.any(Number) }]);
    expect((await getActiveData<{ months: unknown[] }>(store, "calendar"))?.data.months).toHaveLength(1);
    const [h] = await listHistory(store);
    expect(h).toMatchObject({ datasetKey: "calendar", kind: "calendar", source: "upload", fileName: "cal.xlsx", isActive: true });
  });
  it("publishes under the detected type when the override is junk", async () => {
    const store = await calStore();
    const res = await publishUploads(store, [file("cal.xlsx", calendarBook(), "toString" as UploadInput["chosenType"])]);
    expect(res.published).toEqual([{ datasetKey: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", versionId: expect.any(Number) }]);
    const [h] = await listHistory(store);
    expect(h).toMatchObject({ kind: "calendar" });
  });
  it("publishes nothing when any file is blocked", async () => {
    const store = await calStore();
    await expect(publishUploads(store, [file("cal.xlsx", calendarBook()), file("bad.xlsx", Buffer.from("x"))])).rejects.toThrow(/^bad\.xlsx: This is not an Excel/);
    expect(await listHistory(store)).toEqual([]);
  });
  it("publishes nothing when two files share a dataset", async () => {
    const store = await calStore();
    await expect(publishUploads(store, [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook("Dec'26"))])).rejects.toThrow(/^a\.xlsx: Two files are for/);
    expect(await listHistory(store)).toEqual([]);
  });
  it.skipIf(!hasClientFiles)("publishes several real ATL files at once, each only its own category", async () => {
    const store = await createTestStore();
    const files = [
      file("soap.xlsx", clientFile("atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx")),
      file("septex.xlsx", clientFile("atl/2._2026_Dash_Board_-_Septex_-_Oct26.xlsx")),
    ];
    const ps = await previewUploads(store, files);
    expect(ps.map((p) => p.blockReason)).toEqual(["Add the new ATL category.", "Add the new ATL category."]);
    const decided = files.map((f, i) => decide(f, { atl: { business: "new:Toiletries", ownBrands: ps[i].newCategory!.suggestion.ownBrands } }));
    const res = await publishUploads(store, decided);
    const catalog = await getCatalog(store);
    expect(catalog.businesses.map((b) => b.slug)).toEqual(["toiletries"]);
    expect(res.published.map((p) => p.datasetKey).sort()).toEqual(catalog.atl.map((a) => `atl:${a.slug}`).sort());
    expect(res.published).toHaveLength(2);
  });
});

const digitalBook = (brand = "Mystery Brand") => makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
  ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
  ...(p === "Meta" ? [[brand, "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
] })));

describe("file business (Digital)", () => {
  it("asks for the business when the list can't settle it", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ type: "digital", canPublish: false, needsBusiness: true, business: null, blockReason: "Pick the business.", errors: [], pendingChanges: [] });
  });
  it("takes a new business from the admin, and the preview writes nothing", async () => {
    const store = await createTestStore();
    const [p] = await previewUploads(store, [decide(file("digital.xlsx", digitalBook()), { business: "new:Hygiene" })]);
    expect(p).toMatchObject({ canPublish: true, needsBusiness: false, business: { slug: null, name: "Hygiene" }, businessSource: "admin", datasetKey: "digital:hygiene" });
    expect(p.pendingChanges).toEqual([{ op: "addBusiness", name: "Hygiene" }]);
    expect((await getCatalog(store)).businesses).toEqual([]);
    expect(await listHistory(store)).toEqual([]);
  });
  it("publishes the new business and the version together", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, [decide(file("digital.xlsx", digitalBook()), { business: "new:Hygiene" })]);
    expect(res.published[0].datasetKey).toBe("digital:hygiene");
    expect((await getCatalog(store)).businesses.map((b) => [b.slug, b.name])).toEqual([["hygiene", "Hygiene"]]);
    expect((await listHistory(store)).map((h) => h.datasetKey)).toEqual(["digital:hygiene"]);
  });
  it("saves nothing when publishing the versions fails (one transaction)", async () => {
    const store = await createTestStore();
    const spy = vi.spyOn(datasets, "publishVersionsTx").mockRejectedValue(new Error("disk full"));
    try {
      await expect(publishUploads(store, [decide(file("digital.xlsx", digitalBook()), { business: "new:Hygiene" })])).rejects.toThrow("disk full");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await getCatalog(store)).businesses).toEqual([]);
    expect(await listHistory(store)).toEqual([]);
  });
  it("takes an existing business by slug, and ignores a hidden or unknown one", async () => {
    const store = await storeWith("Salt", "Hygiene");
    await setBusinessHidden(store, "hygiene", true);
    const [ok] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "salt" })]);
    expect(ok).toMatchObject({ canPublish: true, business: { slug: "salt", name: "Salt" }, businessSource: "admin", datasetKey: "digital:salt", pendingChanges: [] });
    for (const bad of ["hygiene", "constructor", "new:", "new:   ", "new:Hygiene"]) {
      const [p] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: bad })]);
      expect(p, bad).toMatchObject({ needsBusiness: true, business: null, pendingChanges: [] });
    }
  });
  it("uses an existing business when new:<name> matches it, case-insensitively", async () => {
    const [p] = await previewUploads(await storeWith("Salt"), [decide(file("d.xlsx", digitalBook()), { business: "new:  SALT " })]);
    expect(p).toMatchObject({ canPublish: true, business: { slug: "salt", name: "Salt" }, datasetKey: "digital:salt", pendingChanges: [] });
  });
  it("never hands the reader a business that isn't on the list", async () => {
    const spy = vi.spyOn(READERS as Required<typeof READERS>, "digital");
    try {
      const store = await storeWith("Salt");
      await previewUploads(store, [decide(file("digital.xlsx", digitalBook()), { business: "evil" })]);
      expect(spy.mock.calls.at(-1)?.[1].business).toBeNull(); // the server check, not only the reader's own
      await previewUploads(store, [decide(file("digital.xlsx", digitalBook()), { business: "salt" })]);
      expect(spy.mock.calls.at(-1)?.[1].business).toEqual({ slug: "salt", name: "Salt" }); // positive control
    } finally {
      spy.mockRestore();
    }
  });
  it("takes the business from the file's brands when they all belong to one", async () => {
    const store = await storeWith("Hygiene");
    await createBrand(store, "hygiene", "Mystery Brand");
    const [p] = await previewUploads(store, [file("digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ canPublish: true, business: { slug: "hygiene", name: "Hygiene" }, businessSource: "brands", datasetKey: "digital:hygiene" });
  });
  it("takes the business from the file name when exactly one of his businesses is in it", async () => {
    const [none] = await previewUploads(await createTestStore(), [file("Salt digital.xlsx", digitalBook())]);
    expect(none.needsBusiness).toBe(true);
    const [p] = await previewUploads(await storeWith("Salt", "Hygiene"), [file("Salt_digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ canPublish: true, business: { slug: "salt", name: "Salt" }, businessSource: "file name", datasetKey: "digital:salt" });
    expect(p.warnings).toContain("Business taken from the file name.");
    const [two] = await previewUploads(await storeWith("Salt", "Hygiene"), [file("Salt Hygiene.xlsx", digitalBook())]);
    expect(two.needsBusiness).toBe(true);
  });
  it("blocks two Digital files for the same business", async () => {
    const a = decide(file("a.xlsx", digitalBook()), { business: "new:Salt" });
    const ps = await previewUploads(await createTestStore(), [a, { ...a, name: "b.xlsx" }]);
    expect(ps.map((x) => x.canPublish)).toEqual([false, false]);
    expect(ps.map((x) => x.blockReason)).toEqual([expect.stringMatching(/^Two files are for Digital, Salt/), expect.stringMatching(/^Two files are for Digital, Salt/)]);
  });
  it("lets two files add the same new business, and adds it once", async () => {
    const store = await createTestStore();
    const inputs = [
      decide(file("d.xlsx", digitalBook()), { business: "new:Hygiene" }),
      decide(file("cal.xlsx", calBook([["hygiene", "Freedom"]])), { businesses: [{ name: "hygiene", action: "new" }] }),
    ];
    expect((await previewUploads(store, inputs)).map((p) => p.canPublish)).toEqual([true, true]);
    await publishUploads(store, inputs);
    expect((await getCatalog(store)).businesses.map((b) => b.slug)).toEqual(["hygiene"]);
  });
  it("predicts -2 for a second new name with the same slug, and publishes under it", async () => {
    const store = await createTestStore();
    const inputs = [
      decide(file("a.xlsx", digitalBook()), { business: "new:Hygiene" }),
      decide(file("b.xlsx", digitalBook()), { business: "new:Hygiene!" }),
    ];
    expect((await previewUploads(store, inputs)).map((p) => p.datasetKey)).toEqual(["digital:hygiene", "digital:hygiene-2"]);
    const res = await publishUploads(store, inputs);
    expect(res.published.map((p) => p.datasetKey)).toEqual(["digital:hygiene", "digital:hygiene-2"]);
    expect((await getCatalog(store)).businesses.map((b) => b.slug).sort()).toEqual(["hygiene", "hygiene-2"]);
  });
  describe("when the list changes between the re-read and the Publish transaction", () => {
    const hygieneFile = () => decide(file("d.xlsx", digitalBook("Mystery")), {
      business: "new:Hygiene", brands: [{ name: "Mystery", fullName: "Mystery", business: "new:Hygiene" }],
    });
    it("publishes under the real slug when another name took the predicted one", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, () => createBusiness(store, "Hygiene!"));
      const res = await publishUploads(store, [hygieneFile()]);
      expect(res.published.map((p) => p.datasetKey)).toEqual(["digital:hygiene-2"]);
      const c = await getCatalog(store);
      expect(c.businesses.map((b) => [b.slug, b.name]).sort()).toEqual([["hygiene", "Hygiene!"], ["hygiene-2", "Hygiene"]]);
      expect(c.brandOf("Mystery")?.businessSlug).toBe("hygiene-2");
      expect((await listHistory(store)).map((h) => h.datasetKey)).toEqual(["digital:hygiene-2"]);
    });
    it("uses the business that now has the name, with its own spelling, and adds no duplicate", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, () => createBusiness(store, "HYGIENE"));
      const res = await publishUploads(store, [hygieneFile()]);
      expect(res.published).toEqual([{ datasetKey: "digital:hygiene", label: "Digital, HYGIENE, Jul'26 to Jul'26", versionId: expect.any(Number) }]);
      const c = await getCatalog(store);
      expect(c.businesses.map((b) => [b.slug, b.name])).toEqual([["hygiene", "HYGIENE"]]);
      expect(c.brandOf("Mystery")?.businessSlug).toBe("hygiene");
      const data = (await getActiveData<{ dig: { bz: string }[] }>(store, "digital:hygiene"))?.data;
      expect(data?.dig.map((x) => x.bz)).toEqual(["HYGIENE"]);
    });
    it("refuses when the business it now lands on is hidden, and saves nothing", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, async () => { await createBusiness(store, "HYGIENE"); await setBusinessHidden(store, "hygiene", true); });
      await expect(publishUploads(store, [hygieneFile()])).rejects.toThrow(
        new ValidationError('d.xlsx: The business "HYGIENE" was hidden while you were uploading. Preview again.'),
      );
      const c = await getCatalog(store);
      expect(c.businesses.map((b) => b.slug)).toEqual(["hygiene"]);
      expect(c.brands).toEqual([]);
      expect(await listHistory(store)).toEqual([]);
    });
    it("refuses when two files now land on one dataset, and saves nothing", async () => {
      const store = await createTestStore();
      const inputs = [
        decide(file("a.xlsx", digitalBook()), { business: "new:Hygiene" }),
        decide(file("b.xlsx", digitalBook()), { business: "new:Hygiene!" }),
      ];
      expect((await previewUploads(store, inputs)).map((p) => p.datasetKey)).toEqual(["digital:hygiene", "digital:hygiene-2"]);
      changeBeforePublish(store, () => addAll(store, [{ op: "addBusiness", name: "HYGIENE" }, { op: "businessSameAs", name: "Hygiene!", slug: "hygiene" }]));
      await expect(publishUploads(store, inputs)).rejects.toThrow(new ValidationError("Two files are for Digital, HYGIENE, Jul'26 to Jul'26. Preview again."));
      expect((await getCatalog(store)).businesses.map((b) => b.slug)).toEqual(["hygiene"]);
      expect(await listHistory(store)).toEqual([]);
    });
    it("turns a read error in the second read into the file's own message", async () => {
      const store = await createTestStore();
      const real = READERS.digital!;
      const spy = vi.spyOn(READERS as Required<typeof READERS>, "digital")
        .mockImplementationOnce((wb, ctx) => real(wb, ctx))
        .mockImplementationOnce(() => { throw new ReadError("No ad rows were found in the Meta, YouTube or TikTok sheets."); });
      try {
        changeBeforePublish(store, () => createBusiness(store, "HYGIENE"));
        await expect(publishUploads(store, [hygieneFile()])).rejects.toThrow(
          new ValidationError("d.xlsx: No ad rows were found in the Meta, YouTube or TikTok sheets."),
        );
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
      }
      expect(await listHistory(store)).toEqual([]);
    });
  });
  describe("a business picked for a file whose brands belong to another (spec 3.5: the card decides, a wrong card is blocked)", () => {
    const wrongCard = "This file's brands belong to Salt, not Hygiene. Use the Digital · Salt card.";
    /** Salt and Hygiene on the list, Salt's brand Mystery Brand on it too. One store: every test here leaves it as it was. */
    let shared: Promise<Store> | null = null;
    const saltStore = () => (shared ??= (async () => {
      const store = await storeWith("Salt", "Hygiene");
      await createBrand(store, "salt", "Mystery Brand");
      return store;
    })());
    it("blocks Salt's file on Hygiene's card, naming the card to use, and adds nothing", async () => {
      const store = await saltStore();
      const [p] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "hygiene" })]);
      expect(p).toMatchObject({ type: "digital", canPublish: false, blockReason: wrongCard, errors: [wrongCard], datasetKey: null, pendingChanges: [] });
    });
    it("refuses to publish it too, and saves nothing", async () => {
      const store = await saltStore();
      await expect(publishUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "hygiene" })])).rejects.toThrow(new ValidationError(`d.xlsx: ${wrongCard}`));
      expect(await listHistory(store)).toEqual([]);
    });
    it("blocks a brand-new business name picked for it the same way, and adds no business", async () => {
      const store = await saltStore();
      const [p] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "new:Hygiene Two" })]);
      const msg = "This file's brands belong to Salt, not Hygiene Two. Use the Digital · Salt card.";
      expect(p).toMatchObject({ canPublish: false, blockReason: msg, errors: [msg], pendingChanges: [] });
      await expect(publishUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "new:Hygiene Two" })])).rejects.toThrow(new ValidationError(`d.xlsx: ${msg}`));
      expect((await getCatalog(store)).businesses.map((b) => b.slug).sort()).toEqual(["hygiene", "salt"]);
    });
    it("passes when the picked business is the brands' own", async () => {
      const store = await saltStore();
      for (const business of ["salt", "new:SALT"]) {
        const [p] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business })]);
        expect(p, business).toMatchObject({ canPublish: true, business: { slug: "salt", name: "Salt" }, businessSource: "admin", datasetKey: "digital:salt" });
      }
    });
    it("passes when the brands are on no list, or belong to a hidden business", async () => {
      const store = await storeWith("Salt", "Hygiene");
      const [none] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "hygiene" })]);
      expect(none).toMatchObject({ canPublish: true, datasetKey: "digital:hygiene" });
      await createBrand(store, "salt", "Mystery Brand");
      await setBusinessHidden(store, "salt", true);
      const [hidden] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), { business: "hygiene" })]);
      expect(hidden).toMatchObject({ canPublish: true, datasetKey: "digital:hygiene" });
    });
  });
  it("leaves the business fields empty for a file that has a business column", async () => {
    const [p] = await previewUploads(await calStore(), [file("cal.xlsx", calendarBook())]);
    expect(p).toMatchObject({ business: null, businessSource: null, needsBusiness: false, newCategory: null });
  });
});

describe("business names in a file", () => {
  const book = () => calBook([["Toiletries", "Savlon Soap"], ["ACI Salt", "ACI Pure Salt"], ["Foods", "Basic Spices"], ["CB Core", "Mosquito Coil"]]);

  it("puts every name not on the list into the preview, with suggestions, and blocks", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", book())]);
    expect(p.newBusinesses).toEqual([
      { name: "Toiletries", suggestion: "Toiletries" },
      { name: "ACI Salt", suggestion: "Salt" },
      { name: "Foods", suggestion: "Food & Beverage" },
      { name: "CB Core", suggestion: null },
    ]);
    expect(p).toMatchObject({ canPublish: false, blockReason: "Decide the new businesses.", errors: [], label: "Activity Calendar, Nov'26 to Nov'26" });
  });
  it("is Ready once every name is decided", async () => {
    const store = await createTestStore();
    const [first] = await previewUploads(store, [file("cal.xlsx", book())]);
    const [p] = await previewUploads(store, [decide(file("cal.xlsx", book()), { businesses: allNew(first) })]);
    expect(p).toMatchObject({ canPublish: true, newBusinesses: [] });
    expect(p.pendingChanges.filter((c) => c.op === "addBusiness")).toEqual(["Toiletries", "ACI Salt", "Foods", "CB Core"].map((name) => ({ op: "addBusiness", name })));
  });
  it("matches an existing business case-insensitively and adds no change", async () => {
    const [p] = await previewUploads(await storeWith("Toiletries"), [file("cal.xlsx", calBook([["  TOILETRIES ", "Savlon Soap"]]))]);
    expect(p).toMatchObject({ canPublish: true, newBusinesses: [], pendingChanges: [] });
  });
  it("takes 'same as' an existing business, after nothing else", async () => {
    const store = await storeWith("Salt");
    const [p] = await previewUploads(store, [decide(file("cal.xlsx", calBook([["ACI Salt", "ACI Pure Salt"]])), { businesses: [{ name: "aci  salt", action: "same", slug: "salt" }] })]);
    expect(p).toMatchObject({ canPublish: true, newBusinesses: [] });
    expect(p.pendingChanges).toEqual([{ op: "businessSameAs", name: "ACI Salt", slug: "salt" }]);
  });
  it("takes 'same as' a business decided new in the same file, ordered after it", async () => {
    const [p] = await previewUploads(await createTestStore(), [decide(file("cal.xlsx", calBook([["ACI Salt", "A"], ["Salt", "B"]])), {
      businesses: [{ name: "ACI Salt", action: "same", slug: "salt" }, { name: "Salt", action: "new" }],
    })]);
    expect(p.canPublish).toBe(true);
    expect(p.pendingChanges.filter((c) => c.op !== "addBrand")).toEqual([{ op: "addBusiness", name: "Salt" }, { op: "businessSameAs", name: "ACI Salt", slug: "salt" }]);
  });
  it("takes 'same as' new:<name>, the business this file adds as that name", async () => {
    const store = await createTestStore();
    const input = decide(file("billing.xlsx", calBook([["CB", "A"], ["CB Core", "B"]])), {
      businesses: [{ name: "CB", action: "new" }, { name: "CB Core", action: "same", slug: "new:CB" }],
    });
    const [p] = await previewUploads(store, [input]);
    expect(p).toMatchObject({ canPublish: true, newBusinesses: [] });
    expect(p.pendingChanges.filter((c) => c.op !== "addBrand")).toEqual([{ op: "addBusiness", name: "CB" }, { op: "businessSameAs", name: "CB Core", slug: "cb" }]);
    await publishUploads(store, [input]);
    expect((await getCatalog(store)).businesses.map((b) => [b.slug, b.name, b.names])).toEqual([["cb", "CB", ["CB", "CB Core"]]]);
  });
  it("lets a 'same as' slug carry new: and a full 120-character name, no more", () => {
    const same = (slug: string) => DecisionsSchema.safeParse({ businesses: [{ name: "CB Core", action: "same", slug }] }).success;
    expect(same(`new:${"x".repeat(120)}`)).toBe(true);
    expect(same(`new:${"x".repeat(121)}`)).toBe(false);
  });
  it("lets the file pick, the ATL business and a brand's business carry new: and a full 120-character name, no more", () => {
    const takes = (v: string) => [
      DecisionsSchema.safeParse({ business: v }).success,
      DecisionsSchema.safeParse({ atl: { business: v, ownBrands: ["Lux"] } }).success,
      DecisionsSchema.safeParse({ brands: [{ name: "Lux", fullName: "Lux", business: v }] }).success,
    ];
    expect(takes(`new:${"x".repeat(120)}`)).toEqual([true, true, true]);
    expect(takes(`new:${"x".repeat(121)}`)).toEqual([false, false, false]);
  });
  it("adds a business with a 120-character name from a Digital pick, an ATL category and a brand", async () => {
    const long = `B${"x".repeat(119)}`;
    const store = await createTestStore();
    const [digi] = await previewUploads(store, [decide(file("d.xlsx", digitalBook()), {
      business: `new:${long}`, brands: [{ name: "Mystery Brand", fullName: "Mystery Brand", business: `new:${long}` }],
    })]);
    expect(digi).toMatchObject({ canPublish: true, business: { slug: null, name: long }, newBrands: [] });
    expect(digi.pendingChanges.filter((c) => c.op === "addBusiness")).toEqual([{ op: "addBusiness", name: long }]);
    const [atl] = await previewUploads(store, [decide(luxFile(), { atl: { business: `new:${long}`, ownBrands: ["Lux"] } })]);
    expect(atl).toMatchObject({ canPublish: true, business: { slug: null, name: long }, newCategory: null });
  });
  it("takes 'same as' new:<name> alone as deciding both names", async () => {
    const [p] = await previewUploads(await createTestStore(), [decide(file("billing.xlsx", calBook([["CB", "A"], ["CB Core", "B"]])), {
      businesses: [{ name: "CB Core", action: "same", slug: "new:cb" }],
    })]);
    expect(p).toMatchObject({ canPublish: true, newBusinesses: [] });
    expect(p.pendingChanges.filter((c) => c.op !== "addBrand")).toEqual([{ op: "addBusiness", name: "CB" }, { op: "businessSameAs", name: "CB Core", slug: "cb" }]);
  });
  it("ignores 'same as' new:<name> for a name that is not one of this file's new businesses", async () => {
    const store = await storeWith("Salt");
    for (const slug of ["new:Not In File", "new:Salt"]) {
      const [p] = await previewUploads(store, [decide(file("cal.xlsx", calBook([["CB Core", "A"]])), { businesses: [{ name: "CB Core", action: "same", slug }] })]);
      expect(p, slug).toMatchObject({ canPublish: false, blockReason: "Decide the new businesses.", pendingChanges: [] });
      expect(p.newBusinesses.map((n) => n.name)).toEqual(["CB Core"]);
    }
  });
  it("shows a read error for a business name over 120 characters", async () => {
    const long = `${"B".repeat(60)} ${"C".repeat(70)}`;
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", calBook([[long, "A"], ["CB", "B"]]))]);
    expect(p).toMatchObject({ canPublish: false, blockReason: "Fix the read error first.", newBusinesses: [], pendingChanges: [] });
    expect(p.errors).toEqual([`The business name "${long.slice(0, 40)}…" is longer than 120 characters.`]);
  });
  it("ignores 'same as' new:<name> when that name is hidden on the list", async () => {
    const store = await storeWith("CB");
    await setBusinessHidden(store, "cb", true);
    const [p] = await previewUploads(store, [decide(file("cal.xlsx", calBook([["CB Core", "A"]])), { businesses: [{ name: "CB Core", action: "same", slug: "new:CB" }] })]);
    expect(p).toMatchObject({ canPublish: false, blockReason: "Decide the new businesses.", pendingChanges: [] });
  });
  it("ignores 'same as' a hidden or unknown business", async () => {
    const store = await storeWith("Salt");
    await setBusinessHidden(store, "salt", true);
    for (const slug of ["salt", "nope", null]) {
      const [p] = await previewUploads(store, [decide(file("cal.xlsx", calBook([["ACI Salt", "A"]])), { businesses: [{ name: "ACI Salt", action: "same", slug }] })]);
      expect(p, String(slug)).toMatchObject({ canPublish: false, blockReason: "Decide the new businesses.", pendingChanges: [] });
      expect(p.newBusinesses.map((n) => n.name)).toEqual(["ACI Salt"]);
    }
  });
  it("ignores a decision about a name the file doesn't have", async () => {
    const [p] = await previewUploads(await createTestStore(), [decide(file("cal.xlsx", calBook([["Hygiene", "Freedom"]])), {
      businesses: [{ name: "Hygiene", action: "new" }, { name: "Evil Corp", action: "new" }],
      brands: [{ name: "Not In File", fullName: "Not In File", business: "new:Evil Two" }],
    })]);
    expect(p.canPublish).toBe(true);
    expect(p.pendingChanges).toEqual([{ op: "addBusiness", name: "Hygiene" }]);
  });
  it("offers no business names for an FY file without its business table, and its brands have no business", async () => {
    const row = ["Savlon Soap", "TV", 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 5];
    const fy = makeXlsx([{ name: "2026-27 Final Report", rows: [["t"], ["Brand", "Media", "July'26"], row, ["Total"], ["Grand Total"]] }]);
    const [p] = await previewUploads(await createTestStore(), [file("fy.xlsx", fy, "fy")]);
    expect(p).toMatchObject({ type: "fy", canPublish: true, newBusinesses: [] });
    expect(p.newBrands).toEqual([{ name: "Savlon Soap", business: null, suggestion: "Savlon Soap" }]);
  });
  it("publishes the decisions with the version", async () => {
    const store = await storeWith("Salt");
    await publishUploads(store, [decide(file("cal.xlsx", calBook([["ACI Salt", "A"], ["CB Core", "B"]])), {
      businesses: [{ name: "ACI Salt", action: "same", slug: "salt" }, { name: "CB Core", action: "new" }],
    })]);
    const c = await getCatalog(store);
    expect(c.businessOf("ACI Salt")?.slug).toBe("salt");
    expect(c.businessOf("cb core")?.slug).toBe("cb-core");
    expect((await listHistory(store)).map((h) => h.datasetKey)).toEqual(["calendar"]);
  });
  it.skipIf(!hasClientFiles)("real Billing file: the 13 businesses, then Ready, then 'same as' Salt", async () => {
    const billing = () => file("billing.xlsx", clientFile("Dashboard_Media_Final_Fixed_26th_October_2026.xlsx"));
    const store = await createTestStore();
    const [p] = await previewUploads(store, [billing()]);
    expect(p.newBusinesses.map((n) => n.name).sort()).toEqual(
      ["Toiletries", "Hygiene", "Salt", "Foods", "SCJ", "IB", "Electrical", "Beverage", "Commodity", "Rice", "CB", "CB Core", "ACI Salt"].sort(),
    );
    expect(p).toMatchObject({ canPublish: false, blockReason: "Decide the new businesses." });
    const [ready] = await previewUploads(store, [decide(billing(), { businesses: allNew(p) })]);
    expect(ready.canPublish).toBe(true);
    expect(ready.warnings).toContainEqual(expect.stringMatching(/^\d+ brands not on your list\.$/));

    await createBusiness(store, "Salt");
    const [same] = await previewUploads(store, [decide(billing(), { businesses: [...allNew(p).filter((d) => d.name !== "ACI Salt" && d.name !== "Salt"), { name: "ACI Salt", action: "same", slug: "salt" }] })]);
    expect(same.canPublish).toBe(true);
    expect(same.pendingChanges).toContainEqual({ op: "businessSameAs", name: "ACI Salt", slug: "salt" });
  });
});

describe("brands not on the list", () => {
  it("warns, never blocks, with a full-name suggestion and the row's business", async () => {
    const [p] = await previewUploads(await storeWith("Toiletries"), [file("cal.xlsx", calBook([["Toiletries", "Savlon HW"], ["Toiletries", "Mystery"]]))]);
    expect(p.canPublish).toBe(true);
    expect(p.warnings).toContain("2 brands not on your list.");
    expect(p.newBrands).toEqual([
      { name: "Savlon HW", business: "Toiletries", suggestion: "Savlon Handwash" },
      { name: "Mystery", business: "Toiletries", suggestion: null },
    ]);
  });
  it("says 'brand' for one, and nothing when every brand is on the list", async () => {
    const store = await storeWith("Toiletries");
    const [one] = await previewUploads(store, [file("cal.xlsx", calBook([["Toiletries", "Mystery"]]))]);
    expect(one.warnings).toContain("1 brand not on your list.");
    await createBrand(store, "toiletries", "MYSTERY");
    const [none] = await previewUploads(store, [file("cal.xlsx", calBook([["Toiletries", "Mystery"]]))]);
    expect(none.newBrands).toEqual([]);
    expect(none.warnings.join(" ")).not.toMatch(/not on your list/);
  });
  it("offers the first spelling and its first real business", async () => {
    const [p] = await previewUploads(await storeWith("Toiletries"), [file("cal.xlsx", calBook([["Others", "Savlon HW"], ["Toiletries", "savlon  hw"]]))]);
    expect(p.newBrands).toEqual([{ name: "Savlon HW", business: "Toiletries", suggestion: "Savlon Handwash" }]);
  });
  it("adds a decided brand under its full name, matching the file's name too", async () => {
    const store = await storeWith("Toiletries");
    const input = decide(file("cal.xlsx", calBook([["Toiletries", "Savlon HW"], ["Toiletries", "Mystery"]])), {
      brands: [{ name: "savlon hw", fullName: "Savlon Handwash", business: "toiletries" }, { name: "Mystery", fullName: " Mystery ", business: "toiletries" }],
    });
    const [p] = await previewUploads(store, [input]);
    expect(p.pendingChanges).toEqual([
      { op: "addBrand", name: "Savlon Handwash", businessSlug: "toiletries", alsoMatches: ["Savlon HW"] },
      { op: "addBrand", name: "Mystery", businessSlug: "toiletries" },
    ]);
    expect(p.newBrands).toEqual([]);
    expect(p.warnings.join(" ")).not.toMatch(/not on your list/);
    await publishUploads(store, [input]);
    expect((await getCatalog(store)).brandOf("Savlon HW")?.name).toBe("Savlon Handwash");
  });
  it("adds a brand under a new business, or one added in the same file", async () => {
    const [p] = await previewUploads(await createTestStore(), [decide(file("cal.xlsx", calBook([["CB Core", "Coil"], ["CB Core", "Spray"]])), {
      businesses: [{ name: "CB Core", action: "new" }],
      brands: [{ name: "Coil", fullName: "Coil", business: "cb-core" }, { name: "Spray", fullName: "Spray", business: "new:Food & Beverage" }],
    })]);
    expect(p.pendingChanges).toEqual([
      { op: "addBusiness", name: "CB Core" },
      { op: "addBrand", name: "Coil", businessSlug: "cb-core" },
      { op: "addBusiness", name: "Food & Beverage" },
      { op: "addBrand", name: "Spray", businessSlug: "food-beverage" },
    ]);
  });
  it("ignores a brand decision under a hidden or unknown business", async () => {
    const store = await storeWith("Toiletries", "Salt");
    await setBusinessHidden(store, "salt", true);
    for (const business of ["salt", "nope", "new:Salt"]) {
      const [p] = await previewUploads(store, [decide(file("cal.xlsx", calBook([["Toiletries", "Mystery"]])), { brands: [{ name: "Mystery", fullName: "Mystery", business }] })]);
      expect(p.pendingChanges, business).toEqual([]);
      expect(p.newBrands.map((b) => b.name)).toEqual(["Mystery"]);
    }
  });
  it("gives a Digital file's new brands the file's business", async () => {
    const [p] = await previewUploads(await createTestStore(), [decide(file("d.xlsx", digitalBook("Freedom")), { business: "new:Hygiene" })]);
    expect(p.newBrands).toEqual([{ name: "Freedom", business: "Hygiene", suggestion: "Freedom Sanitary Napkin" }]);
  });
});

const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const atlBook = (title: string, brands: string[]) => makeXlsx([{ name: "GRP", rows: [
  [`Brand Name: ${title}`], ["Brand Name", d(2026, 7)], [null, "GRP", "Spend"], ...brands.map((b, i) => [b, 10 + i, 1000]),
] }]);
const luxFile = () => file("lux.xlsx", atlBook("Lux Soap", ["Lux", "Dove", "Sunsilk"]), "atl");

describe("ATL categories", () => {
  it("asks about a new category, with the file's brand rows to pick from", async () => {
    const [p] = await previewUploads(await createTestStore(), [luxFile()]);
    expect(p.newCategory).toEqual({ title: "Lux Soap", suggestion: { business: null, ownBrands: [] }, brands: ["Lux", "Dove", "Sunsilk"] });
    expect(p).toMatchObject({ canPublish: false, blockReason: "Add the new ATL category.", errors: [], needsBusiness: false });
  });
  it("suggests his category's business and own brands, else the row named like the title", async () => {
    const [soap] = await previewUploads(await createTestStore(), [file("s.xlsx", atlBook("ACI Savlon Soap", ["Savlon Soap", "Lux"]), "atl")]);
    expect(soap.newCategory?.suggestion).toEqual({ business: "Toiletries", ownBrands: ["Savlon Soap"] });
    const [lux] = await previewUploads(await createTestStore(), [file("l.xlsx", atlBook("Lux Soap", ["Dove", "LUX  soap"]), "atl")]);
    expect(lux.newCategory?.suggestion).toEqual({ business: null, ownBrands: ["LUX soap"] });
  });
  it("is Ready with a decided category, and publishes it with the version", async () => {
    const store = await createTestStore();
    const input = decide(luxFile(), { atl: { business: "new:Toiletries", ownBrands: ["lux", "Nope"] } });
    const [p] = await previewUploads(store, [input]);
    expect(p).toMatchObject({ canPublish: true, datasetKey: "atl:lux-soap", newCategory: null, business: { slug: null, name: "Toiletries" }, businessSource: "admin" });
    expect(p.pendingChanges).toEqual([
      { op: "addBusiness", name: "Toiletries" },
      { op: "addAtl", name: "Lux Soap", businessSlug: "toiletries", ownBrands: ["Lux"] },
    ]);
    const res = await publishUploads(store, [input]);
    expect(res.published[0].datasetKey).toBe("atl:lux-soap");
    expect((await getActiveData<AtlCategory>(store, "atl:lux-soap"))?.data).toMatchObject({ own: ["Lux"], biz: "Toiletries", name: "Lux Soap" });
    expect((await getCatalog(store)).atlOf("lux soap")).toMatchObject({ slug: "lux-soap", businessSlug: "toiletries", ownBrands: ["Lux"] });
  });
  it("ignores a category decision with none of the file's rows, or a hidden business", async () => {
    const store = await storeWith("Toiletries");
    await setBusinessHidden(store, "toiletries", true);
    for (const atl of [{ business: "new:Hygiene", ownBrands: ["Nope"] }, { business: "toiletries", ownBrands: ["Lux"] }, { business: "zzz", ownBrands: ["Lux"] }]) {
      const [p] = await previewUploads(store, [decide(luxFile(), { atl })]);
      expect(p, JSON.stringify(atl)).toMatchObject({ canPublish: false, blockReason: "Add the new ATL category.", pendingChanges: [] });
    }
  });
  it("shows a read error, not the category question, for no brand rows, no header row or a title over 120 characters", async () => {
    const store = await createTestStore();
    const noRows = makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }]);
    const noHeader = makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Something else"]] }]);
    const cases: [Buffer, string][] = [
      [noRows, "No brand rows were found under the header row."],
      [noHeader, 'The header row with "Brand Name" or "Brand" wasn\'t found.'],
      [atlBook("L".repeat(121), ["Lux", "Dove"]), "The ATL title is longer than 120 characters."],
    ];
    for (const [b, error] of cases) {
      for (const decisions of [null, { atl: { business: "new:Toiletries", ownBrands: ["Lux"] } }]) {
        const input = decisions ? decide(file("a.xlsx", b, "atl"), decisions) : file("a.xlsx", b, "atl");
        const [p] = await previewUploads(store, [input]);
        expect(p, error).toMatchObject({ canPublish: false, blockReason: "Fix the read error first.", errors: [error], newCategory: null, pendingChanges: [] });
      }
    }
  });
  describe("when the list changes between the re-read and the Publish transaction", () => {
    const decided = () => decide(luxFile(), { atl: { business: "new:Toiletries", ownBrands: ["Lux"] } });
    it("publishes a new category under its real slug when another category took the predicted one", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, () => addAll(store, [{ op: "addBusiness", name: "Salt" }, { op: "addAtl", name: "Lux Soap!", businessSlug: "salt", ownBrands: ["Dove"] }]));
      const res = await publishUploads(store, [decided()]);
      expect(res.published.map((p) => p.datasetKey)).toEqual(["atl:lux-soap-2"]);
      expect((await getCatalog(store)).atlOf("Lux Soap")).toMatchObject({ slug: "lux-soap-2", businessSlug: "toiletries", ownBrands: ["Lux"] });
      expect((await getActiveData<AtlCategory>(store, "atl:lux-soap-2"))?.data).toMatchObject({ name: "Lux Soap", biz: "Toiletries", own: ["Lux"] });
    });
    it("refuses when the category it now lands on is hidden, and saves nothing", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, async () => {
        await addAll(store, [{ op: "addBusiness", name: "Salt" }, { op: "addAtl", name: "LUX SOAP", businessSlug: "salt", ownBrands: ["Dove"] }]);
        await setAtlHidden(store, "lux-soap", true);
      });
      await expect(publishUploads(store, [decided()])).rejects.toThrow(
        new ValidationError('lux.xlsx: The ATL category "LUX SOAP" was hidden while you were uploading. Preview again.'),
      );
      expect((await getCatalog(store)).businesses.map((b) => b.slug)).toEqual(["salt"]);
      expect(await listHistory(store)).toEqual([]);
    });
    it("refuses when the category now on the list has another business or other own brands, and adds no business", async () => {
      const others: CatalogChange[][] = [
        [{ op: "addBusiness", name: "Salt" }, { op: "addAtl", name: "LUX SOAP", businessSlug: "salt", ownBrands: ["Lux"] }],
        [{ op: "addBusiness", name: "Toiletries" }, { op: "addAtl", name: "LUX SOAP", businessSlug: "toiletries", ownBrands: ["Dove"] }],
      ];
      for (const changes of others) {
        const store = await createTestStore();
        changeBeforePublish(store, () => addAll(store, changes));
        await expect(publishUploads(store, [decided()])).rejects.toThrow(
          new ValidationError('lux.xlsx: The ATL category "LUX SOAP" was added while you were uploading. Preview again.'),
        );
        expect((await getCatalog(store)).businesses.map((b) => b.slug)).toEqual([changes[0].name.toLowerCase()]);
        expect(await listHistory(store)).toEqual([]);
      }
    });
    it("refuses when the category now on the list belongs to a hidden business", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, async () => {
        await addAll(store, [{ op: "addBusiness", name: "Salt" }, { op: "addAtl", name: "LUX SOAP", businessSlug: "salt", ownBrands: ["Lux"] }]);
        await setBusinessHidden(store, "salt", true);
      });
      await expect(publishUploads(store, [decided()])).rejects.toThrow(
        new ValidationError('lux.xlsx: The business "Salt" was hidden while you were uploading. Preview again.'),
      );
      expect((await getCatalog(store)).businesses.map((b) => b.slug)).toEqual(["salt"]);
      expect(await listHistory(store)).toEqual([]);
    });
    it("publishes into the category now on the list when it matches the decision, under its spelling", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, () => addAll(store, [{ op: "addBusiness", name: "Toiletries" }, { op: "addAtl", name: "LUX SOAP", businessSlug: "toiletries", ownBrands: ["LUX"] }]));
      const res = await publishUploads(store, [decided()]);
      expect(res.published.map((p) => p.datasetKey)).toEqual(["atl:lux-soap"]);
      expect((await getCatalog(store)).atl.map((a) => a.slug)).toEqual(["lux-soap"]);
      expect((await getActiveData<AtlCategory>(store, "atl:lux-soap"))?.data).toMatchObject({ name: "LUX SOAP", biz: "Toiletries", own: ["Lux"] });
    });
    it("uses the business that now has the name, with its own spelling", async () => {
      const store = await createTestStore();
      changeBeforePublish(store, () => createBusiness(store, "TOILETRIES"));
      const res = await publishUploads(store, [decided()]);
      expect(res.published.map((p) => p.datasetKey)).toEqual(["atl:lux-soap"]);
      expect((await getCatalog(store)).businesses.map((b) => [b.slug, b.name])).toEqual([["toiletries", "TOILETRIES"]]);
      expect((await getActiveData<AtlCategory>(store, "atl:lux-soap"))?.data).toMatchObject({ name: "Lux Soap", biz: "TOILETRIES", own: ["Lux"] });
    });
  });
  it("reads a file for a category on the list with no decision", async () => {
    const store = await storeWith("Toiletries");
    await addAll(store, [{ op: "addAtl", name: "lux soap", businessSlug: "toiletries", ownBrands: ["Dove"] }]);
    const [p] = await previewUploads(store, [luxFile()]);
    expect(p).toMatchObject({ canPublish: true, datasetKey: "atl:lux-soap", business: { slug: "toiletries", name: "Toiletries" }, businessSource: "category", pendingChanges: [] });
    expect(p.newBrands).toEqual([{ name: "Dove", business: "Toiletries", suggestion: null }]);
  });
  it.skipIf(!hasClientFiles)("his real Spices file, once its category exists with his 4 own brands, publishes exactly those 4", async () => {
    const spices = () => file("spices.xlsx", clientFile("atl/13._2026_Dash_Board_-_Spices_-_Oct26.xlsx"));
    const store = await createTestStore();
    const [p] = await previewUploads(store, [spices()]);
    const own = ["ACI Pure Masala", "ACI Pure Halim Mix", "ACI Pure - Roast Masala", "ACI Pure Mixed Spice - Biriyani Masala"];
    expect(p.newCategory?.suggestion.ownBrands).toEqual(own);
    await addAll(store, [{ op: "addBusiness", name: "Food & Beverage" }, { op: "addAtl", name: p.newCategory!.title, businessSlug: "food-beverage", ownBrands: own }]);
    const res = await publishUploads(store, [spices()]);
    expect((await getActiveData<AtlCategory>(store, res.published[0].datasetKey))?.data.own).toEqual(own);
  });
});

describe.skipIf(!hasClientFiles)("the real new-type files in the service", () => {
  const NEW_TYPE_FILES = [
    "Billboard_Billing_Status_Updated_10th_Nov26.xlsx",
    "ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx",
    "CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx",
    "Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx",
    "Dashboard_Media_Final_Fixed_26th_October_2026.xlsx",
    "Toiletries_Business_Digital_Media_Data_FY_26-27.xlsx",
  ];
  it("previews the real Billboard file, its status colours read", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("billboard.xlsx", clientFile("Billboard_Billing_Status_Updated_10th_Nov26.xlsx"))]);
    expect(p).toMatchObject({ type: "billboard", label: "Billboard billing, 169 bills", errors: [] });
    expect(p.warnings.join(" ")).not.toMatch(/Unmarked|no status colour/);
  });
  it("publishes each of the 6 once their businesses are decided, and Upload History shows its label", async () => {
    const store = await createTestStore();
    const inputs = NEW_TYPE_FILES.map((f) => file(f, clientFile(f)));
    const ps = await previewUploads(store, inputs);
    const decided = inputs.map((f, i) => decide(f, { business: "new:Toiletries", businesses: allNew(ps[i]) }));
    const res = await publishUploads(store, decided);
    expect(res.published.map((p) => p.datasetKey.split(":")[0]).sort()).toEqual(["billboard", "billing", "channel", "digital", "fy", "ooh-sites"]);
    const history = await listHistory(store);
    for (const p of res.published) expect(history.map((h) => h.label), p.datasetKey).toContain(p.label);
  });
});

describe.skipIf(!hasClientFiles)("his real files on the wrong card", () => {
  // [file, the type detection is sure of, a card of another type]
  const CASES: [string, FileType, FileType][] = [
    ["atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx", "atl", "digital"],
    ["Hygiene_Business.xlsx", "digital", "atl"],
    ["CB_media_Spent_Report_2026-27_V4_-_Oct_26_Updated_27.10.26.xlsx", "fy", "channel"],
    ["Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx", "channel", "billing"],
    ["Dashboard_Media_Final_Fixed_26th_October_2026.xlsx", "billing", "calendar"],
    ["All_Activity_Calender_FY_26-27.xlsx", "calendar", "billboard"],
    ["Billboard_Billing_Status_Updated_10th_Nov26.xlsx", "billboard", "fy"],
    ["ACI_CB_Media_Billboard_Master_Sheet_02_Nov_Updated_2026.xlsx", "ooh-sites", "billboard"],
  ];
  it.each(CASES)("%s (%s) on the %s card is blocked, naming the card to use", async (rel, detected, cardType) => {
    const [p] = await previewUploads(await createTestStore(), [file("f.xlsx", clientFile(rel), cardType)]);
    expect(p.detection).toEqual({ status: "sure", type: detected });
    const msg = wrongCardMessage(cardForType(cardType)!, detected);
    expect(p).toMatchObject({ canPublish: false, type: null, blockReason: msg, errors: [msg] });
  });
  it.each(CASES.filter(([, detected]) => detected !== "ooh-sites"))("%s is read on its own (%s) card", async (rel, detected) => {
    const [p] = await previewUploads(await createTestStore(), [file("f.xlsx", clientFile(rel), detected)]);
    expect(p.type).toBe(detected);
    expect(p.errors).toEqual([]);
  });
});
