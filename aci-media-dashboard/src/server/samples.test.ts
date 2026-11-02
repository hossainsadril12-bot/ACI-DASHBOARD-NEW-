import { describe, it, expect, beforeEach } from "vitest";
import { like } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { bills, brands, spendEntries, uploads, vendors } from "@/db/schema";
import * as XLSX from "xlsx";
import { TEMPLATES } from "@/lib/upload/templates";
import { addMonths } from "@/lib/month";
import { UPLOAD_KINDS } from "@/lib/upload/templates";
import { ValidationError } from "./errors";
import { createBrand, listBrandsWithRivals, listBusinesses } from "./master-data";
import { listBills, listOpenReminders } from "./billing";
import { planVsBudget } from "./plan";
import { spendMatrix } from "./spend";
import { confirmUpload, previewUpload } from "./uploads";
import { saveBill } from "./billing";
import { setSourceOwner } from "./competitors";
import { sourceOwners } from "@/db/schema";
import { loadSampleData, removeSampleData, sampleStatus, sampleUploadFile } from "./samples";

const TODAY = "2026-11-18";
const M = "2026-11";
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
});

const monthSpend = async (month: string) => (await spendMatrix(db, { months: [month] })).totals[month] ?? 0;

describe("loadSampleData", () => {
  it("fills every module with marked sample records", async () => {
    expect(await sampleStatus(db)).toEqual({ loaded: false, brands: 0 });
    const res = await loadSampleData(db, TODAY);
    expect(res.brands).toBe(4);
    expect(await sampleStatus(db)).toEqual({ loaded: true, brands: 4 });

    const all = await listBrandsWithRivals(db);
    expect(all.every((b) => b.name.endsWith("(Sample)") && b.rivals.length === 3)).toBe(true);
    expect(await monthSpend(addMonths(M, -1))).toBeGreaterThan(0);
    expect(await monthSpend(M)).toBeGreaterThan(0);
    expect((await planVsBudget(db, M)).every((b) => b.budget && b.planned > 0)).toBe(true);
    expect((await listBills(db, TODAY)).map((b) => b.billNo).every((n) => n.startsWith("SMP-"))).toBe(true);
    expect(await listOpenReminders(db, TODAY)).toHaveLength(1);
    const ups = await db.select().from(uploads);
    expect(ups.length).toBeGreaterThanOrEqual(10);
    expect(ups.every((u) => u.fileName.startsWith("sample-") && u.status === "confirmed")).toBe(true);
  });

  it("refuses to load twice", async () => {
    await loadSampleData(db, TODAY);
    await expect(loadSampleData(db, TODAY)).rejects.toThrow(ValidationError);
  });
});

describe("sample Excel files", () => {
  it("each file passes the upload checks once sample data is loaded", async () => {
    await loadSampleData(db, TODAY);
    for (const kind of UPLOAD_KINDS) {
      const f = sampleUploadFile(kind, TODAY);
      expect(f.fileName.startsWith("aci-sample-")).toBe(true);
      const p = await previewUpload(db, { kind, fileName: f.fileName, data: f.data });
      expect(p.checks.filter((c) => c.status === "fail"), `${kind}: ${JSON.stringify(p.checks)}`).toEqual([]);
      expect(p.errors).toEqual([]);
    }
  });

  it("uploading them changes what the dashboard shows", async () => {
    await loadSampleData(db, TODAY);
    const before = await monthSpend(M);
    const spend = sampleUploadFile("spend", TODAY);
    await confirmUpload(db, { kind: "spend", fileName: spend.fileName, data: spend.data, acceptMismatch: false });
    expect(await monthSpend(M)).toBeGreaterThan(before * 1.5);
    expect((await planVsBudget(db, M)).some((b) => b.level === "red")).toBe(true);

    const billFile = sampleUploadFile("bills", TODAY);
    await confirmUpload(db, { kind: "bills", fileName: billFile.fileName, data: billFile.data, acceptMismatch: false });
    const list = await listBills(db, TODAY);
    expect(list.find((b) => b.billNo === "SMP-004")?.status).toBe("payment_done");
    expect(list.some((b) => b.billNo === "SMP-101")).toBe(true);
    expect(list.some((b) => b.billNo === "SMP-002")).toBe(true);
  });
});

describe("removeSampleData", () => {
  it("removes only sample records", async () => {
    const real = await createBrand(db, { name: "Real Brand", businessId: (await listBusinesses(db))[0].id });
    await loadSampleData(db, TODAY);
    const spend = sampleUploadFile("spend", TODAY);
    await confirmUpload(db, { kind: "spend", fileName: spend.fileName, data: spend.data, acceptMismatch: false });

    await removeSampleData(db);
    expect((await db.select().from(brands)).map((b) => b.id)).toEqual([real.id]);
    expect(await db.select().from(bills).where(like(bills.billNo, "SMP-%"))).toEqual([]);
    expect(await db.select().from(uploads)).toEqual([]);
    expect(await db.select().from(vendors).where(like(vendors.name, "%(Sample)"))).toEqual([]);
    expect(await sampleStatus(db)).toEqual({ loaded: false, brands: 0 });
    await expect(loadSampleData(db, TODAY)).resolves.toMatchObject({ brands: 4 });
  });
});

describe("sample and real data stay apart", () => {
  const realSpendFile = (amount: number) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      TEMPLATES.spend.columns.map((c) => c.header),
      [M, null, "Real Brand", "TV", null, null, amount, null],
    ]), "S");
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  };
  const realRows = async () => {
    const [real] = await db.select().from(brands).where(like(brands.name, "Real Brand"));
    return (await db.select().from(spendEntries)).filter((r) => r.brandId === real.id);
  };

  it("loading samples and uploading sample files never replaces real uploaded rows, and the reverse", async () => {
    await createBrand(db, { name: "Real Brand", businessId: (await listBusinesses(db))[0].id });
    const real = await confirmUpload(db, { kind: "spend", fileName: "real-nov.xlsx", data: realSpendFile(1_000_000), acceptMismatch: false });

    await loadSampleData(db, TODAY);
    const sample = sampleUploadFile("spend", TODAY);
    await confirmUpload(db, { kind: "spend", fileName: sample.fileName, data: sample.data, acceptMismatch: false });
    expect((await realRows()).map((r) => r.amount)).toEqual([1_000_000]);
    const ups = await db.select().from(uploads);
    expect(ups.find((u) => u.id === real.uploadId)?.status).toBe("confirmed");

    const sampleTotal = await monthSpend(M);
    await confirmUpload(db, { kind: "spend", fileName: "real-nov-v2.xlsx", data: realSpendFile(2_000_000), acceptMismatch: false });
    expect((await realRows()).map((r) => r.amount)).toEqual([2_000_000]);
    expect(await monthSpend(M)).toBe(sampleTotal + 1_000_000);
    expect((await db.select().from(uploads)).find((u) => u.fileName === sample.fileName)?.status).toBe("confirmed");
  });
});

describe("removal and loading leave real data alone", () => {
  it("keeps real look-alikes, real source owners, and refuses the reserved tag and mixed files", async () => {
    const biz = (await listBusinesses(db))[0].id;
    await expect(createBrand(db, { name: "My Brand (sample)", businessId: biz })).rejects.toThrow(/kept for sample data/);
    await createBrand(db, { name: "Real Brand", businessId: biz });
    await saveBill(db, null, { billNo: "SMP-900", month: M, billDate: "2026-11-01", amount: 10 });
    await confirmUpload(db, { kind: "spend", fileName: "sample-looking-real.xlsx", acceptMismatch: false, data: (() => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATES.spend.columns.map((c) => c.header), [M, null, "Real Brand", "TV", null, null, 5, null]]), "S");
      return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    })() });
    await setSourceOwner(db, "meta_ads", "Real owner");
    await db.update(sourceOwners).set({ lastUpdatedAt: "2026-09-01T00:00:00Z" }).where(like(sourceOwners.sourceKey, "meta_ads"));

    await loadSampleData(db, TODAY);
    const [meta] = await db.select().from(sourceOwners).where(like(sourceOwners.sourceKey, "meta_ads"));
    expect(meta.ownerName).toBe("Real owner");
    expect(new Date(meta.lastUpdatedAt!).toISOString().slice(0, 10)).toBe("2026-09-01");

    const mixed = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(mixed, XLSX.utils.aoa_to_sheet([TEMPLATES.spend.columns.map((c) => c.header),
      [M, null, "Real Brand", "TV", null, null, 5, null], [M, null, "crystal salt (sample)", "TV", null, null, 5, null]]), "S");
    const p = await previewUpload(db, { kind: "spend", fileName: "mixed.xlsx", data: new Uint8Array(XLSX.write(mixed, { type: "array", bookType: "xlsx" })) });
    expect(p.checks.find((c) => c.label === "Sample and real brands kept apart")?.status).toBe("fail");

    await removeSampleData(db);
    expect((await db.select().from(bills)).map((b) => b.billNo)).toEqual(["SMP-900"]);
    expect((await db.select().from(uploads)).map((u) => u.fileName)).toEqual(["sample-looking-real.xlsx"]);
    expect((await db.select().from(brands)).map((b) => b.name)).toEqual(["Real Brand"]);
  });
});
