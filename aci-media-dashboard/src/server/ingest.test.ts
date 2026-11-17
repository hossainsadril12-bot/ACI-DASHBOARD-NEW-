import { describe, expect, it, vi } from "vitest";
import { READERS } from "@/lib/ingest/readers";
import { createTestStore } from "@/store/test-store";
import { getActiveData, listHistory } from "@/store/datasets";
import { makeXlsx, clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
import { NOT_USUAL_FILE } from "@/lib/ingest/detect";
import { DIGITAL_BUSINESSES } from "@/lib/ingest/brands";
import { previewUploads, publishUploads, type UploadInput } from "./ingest";

const u8 = (b: Buffer) => new Uint8Array(b);
const calendarBook = (sheet = "Nov'26", grandTotal = true) => makeXlsx([{ name: sheet, rows: [
  [`CB Media Activity ${sheet}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"],
  ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ...(grandTotal ? [["Grand Total", null, 1, 0.5, 0, 0, 1.5]] : []),
] }]);
const file = (name: string, b: Buffer, chosenType: UploadInput["chosenType"] = null): UploadInput => ({ name, bytes: u8(b), chosenType });

describe("previewUploads", () => {
  it("previews a sure, readable file as publishable", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", calendarBook())]);
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
    const store = await createTestStore();
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
    const [p] = await previewUploads(await createTestStore(), [file("a.xlsx", makeXlsx([{ name: "GRP", rows: [["Brand Name: Lux Soap"], ["Brand Name"]] }]), "atl")]);
    expect(p.canPublish).toBe(false);
    expect(p.blockReason).toBe("Fix the read error first.");
    expect(p.errors[0]).toMatch(/doesn't match any ATL category/);
  });
  it("blocks two files for the same dataset", async () => {
    const ps = await previewUploads(await createTestStore(), [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook("Dec'26"))]);
    expect(ps.map((p) => p.blockReason)).toEqual([expect.stringMatching(/^Two files are for Activity Calendar/), expect.stringMatching(/^Two files are for Activity Calendar/)]);
    expect(ps.every((p) => !p.canPublish)).toBe(true);
  });
  it("warns when the file is the one already in use", async () => {
    const store = await createTestStore();
    await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    const [p] = await previewUploads(store, [file("cal-again.xlsx", calendarBook())]);
    expect(p.warnings).toContain("This is the same file as the one in use.");
    expect(p.canPublish).toBe(true);
  });
  it("warns when the admin picks a type different from a sure detection", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", calendarBook(), "channel")]);
    expect(p.warnings).toContain("Detected as Activity Calendar, but you picked Channel Cost.");
    expect(p.canPublish).toBe(false);
  });
  it("ignores an unknown type override and falls back to detection", async () => {
    const store = await createTestStore();
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
  it("keeps a workbook that is none of his files blocked even when the admin picks a type", async () => {
    // Calendar layout, but no month in the sheet name or A1 alone, so detection says none; the calendar reader could still read it.
    const book = makeXlsx([{ name: "26", rows: [["CB Media Activity Nov"], ["Business", "Brand", "Media"], [null, null, "TV", "Total"], ["T", "Savlon Soap", 1, 1], ["Grand Total", null, 1, 1]] }]);
    const store = await createTestStore();
    const [p] = await previewUploads(store, [file("x.xlsx", book, "calendar")]);
    expect(p.detection?.status).toBe("none");
    expect(p).toMatchObject({ canPublish: false, blockReason: "This is not one of the usual Media Mind files.", errors: [NOT_USUAL_FILE] });
    await expect(publishUploads(store, [file("x.xlsx", book, "calendar")])).rejects.toThrow(/not one of the usual Media Mind files/);
  });
  it("only warns about the file in use on publishable previews", async () => {
    const store = await createTestStore();
    await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    const ps = await previewUploads(store, [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook())]);
    expect(ps.every((p) => !p.canPublish)).toBe(true);
    expect(ps.every((p) => !p.warnings.includes("This is the same file as the one in use."))).toBe(true);
  });
  it("keeps input order", async () => {
    const ps = await previewUploads(await createTestStore(), [file("z.xlsx", Buffer.from("x")), file("a.xlsx", calendarBook())]);
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
    const store = await createTestStore();
    const res = await publishUploads(store, [file("cal.xlsx", calendarBook())]);
    expect(res.published).toEqual([{ datasetKey: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", versionId: expect.any(Number) }]);
    expect((await getActiveData<{ months: unknown[] }>(store, "calendar"))?.data.months).toHaveLength(1);
    const [h] = await listHistory(store);
    expect(h).toMatchObject({ datasetKey: "calendar", kind: "calendar", source: "upload", fileName: "cal.xlsx", isActive: true });
  });
  it("publishes under the detected type when the override is junk", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, [file("cal.xlsx", calendarBook(), "toString" as UploadInput["chosenType"])]);
    expect(res.published).toEqual([{ datasetKey: "calendar", label: "Activity Calendar, Nov'26 to Nov'26", versionId: expect.any(Number) }]);
    const [h] = await listHistory(store);
    expect(h).toMatchObject({ kind: "calendar" });
  });
  it("publishes nothing when any file is blocked", async () => {
    const store = await createTestStore();
    await expect(publishUploads(store, [file("cal.xlsx", calendarBook()), file("bad.xlsx", Buffer.from("x"))])).rejects.toThrow(/^bad\.xlsx: This is not an Excel/);
    expect(await listHistory(store)).toEqual([]);
  });
  it("publishes nothing when two files share a dataset", async () => {
    const store = await createTestStore();
    await expect(publishUploads(store, [file("a.xlsx", calendarBook()), file("b.xlsx", calendarBook("Dec'26"))])).rejects.toThrow(/^a\.xlsx: Two files are for/);
    expect(await listHistory(store)).toEqual([]);
  });
  it.skipIf(!hasClientFiles)("publishes several real ATL files at once, each only its own category", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, [
      file("soap.xlsx", clientFile("atl/1._2026_Dash_Board_-_Savlon_Soap_-_Oct26.xlsx")),
      file("septex.xlsx", clientFile("atl/2._2026_Dash_Board_-_Septex_-_Oct26.xlsx")),
    ]);
    expect(res.published.map((p) => p.datasetKey).sort()).toEqual(["atl:septex", "atl:soap"]);
  });
});

const digitalBook = () => makeXlsx(["Meta", "YouTube", "TikTok"].map((p) => ({ name: p, rows: [
  ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"], [],
  ...(p === "Meta" ? [["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]] : []),
] })));

describe("Digital business in the service", () => {
  it("asks for the business when it can't be worked out", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ type: "digital", canPublish: false, needsBusiness: true, business: null, blockReason: "Pick the business.", errors: [] });
  });
  it("uses the admin's pick and publishes to that business only", async () => {
    const store = await createTestStore();
    const input = { ...file("digital.xlsx", digitalBook()), chosenBusiness: "Hygiene" as const };
    const [p] = await previewUploads(store, [input]);
    expect(p).toMatchObject({ canPublish: true, business: "Hygiene", businessSource: "admin", needsBusiness: false, datasetKey: "digital:Hygiene" });
    expect((await publishUploads(store, [input])).published[0].datasetKey).toBe("digital:Hygiene");
  });
  it("ignores a business value that isn't one of the three", async () => {
    const [p] = await previewUploads(await createTestStore(), [{ ...file("digital.xlsx", digitalBook()), chosenBusiness: "constructor" as never }]);
    expect(p.needsBusiness).toBe(true);
    expect(DIGITAL_BUSINESSES).not.toContain("constructor");
  });
  it("never hands the reader a business that isn't one of the three", async () => {
    const spy = vi.spyOn(READERS as Required<typeof READERS>, "digital");
    try {
      const store = await createTestStore();
      await previewUploads(store, [{ ...file("digital.xlsx", digitalBook()), chosenBusiness: "evil" as never }]);
      expect(spy.mock.calls.at(-1)?.[1].business).toBeNull(); // the server check, not only the reader's own
      await previewUploads(store, [{ ...file("digital.xlsx", digitalBook()), chosenBusiness: "Salt" }]);
      expect(spy.mock.calls.at(-1)?.[1].business).toBe("Salt"); // positive control
    } finally {
      spy.mockRestore();
    }
  });
  it("blocks two Digital files for the same business", async () => {
    const a = { ...file("a.xlsx", digitalBook()), chosenBusiness: "Salt" as const };
    const ps = await previewUploads(await createTestStore(), [a, { ...a, name: "b.xlsx" }]);
    expect(ps.map((x) => x.canPublish)).toEqual([false, false]);
    expect(ps.map((x) => x.blockReason)).toEqual([expect.stringMatching(/^Two files are for Digital, Salt/), expect.stringMatching(/^Two files are for Digital, Salt/)]);
  });
  it("warns when the business comes from the file name", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("Salt digital.xlsx", digitalBook())]);
    expect(p).toMatchObject({ canPublish: true, business: "Salt", businessSource: "file name", needsBusiness: false, datasetKey: "digital:Salt" });
    expect(p.warnings).toContain("Business taken from the file name.");
  });
  it("leaves the business fields empty for a file that isn't Digital", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("cal.xlsx", calendarBook())]);
    expect(p).toMatchObject({ business: null, businessSource: null, needsBusiness: false });
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
  it("previews the real Billboard file as Ready, its status colours read", async () => {
    const [p] = await previewUploads(await createTestStore(), [file("billboard.xlsx", clientFile("Billboard_Billing_Status_Updated_10th_Nov26.xlsx"))]);
    expect(p).toMatchObject({ type: "billboard", canPublish: true, label: "Billboard billing, 169 bills", errors: [] });
    expect(p.warnings.join(" ")).not.toMatch(/Unmarked|no status colour/);
  });
  it("publishes each of the 6 and Upload History shows its label", async () => {
    const store = await createTestStore();
    const res = await publishUploads(store, NEW_TYPE_FILES.map((f) => file(f, clientFile(f))));
    expect(res.published.map((p) => p.datasetKey.split(":")[0]).sort()).toEqual(["billboard", "billing", "channel", "digital", "fy", "ooh-sites"]);
    const history = await listHistory(store);
    for (const p of res.published) expect(history.map((h) => h.label), p.datasetKey).toContain(p.label);
  });
});
