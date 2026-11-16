import { describe, expect, it } from "vitest";
import { createTestStore } from "@/store/test-store";
import { getActiveData, listHistory } from "@/store/datasets";
import { makeXlsx, clientFile, hasClientFiles } from "@/lib/ingest/test-workbooks";
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
  it("blocks a recognised type whose reader is not built yet", async () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"]] }, { name: "Digital", rows: [["SL", "Platform"]] }, { name: "Press & Radio", rows: [["SL", "Name"]] }]);
    const [p] = await previewUploads(await createTestStore(), [file("ch.xlsx", b)]);
    expect(p).toMatchObject({ type: "channel", canPublish: false, blockReason: "Recognised as Channel Cost. Its reader comes in the next update." });
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
