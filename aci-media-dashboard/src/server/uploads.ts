import { and, desc, eq, inArray, like } from "drizzle-orm";
import { brands, historyLog, uploads } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { formatMonth } from "@/lib/month";
import { formatTaka } from "@/lib/money";
import { checkFileType, checkTotals, detectPeriods, fileHash } from "@/lib/upload/checks";
import { planMerge } from "@/lib/upload/merge";
import { parseSheet, type CellValue, type ParsedRow, type RowError } from "@/lib/upload/parse";
import { TEMPLATES, type UploadKind } from "@/lib/upload/templates";
import { ValidationError } from "./errors";
import { loadLookups } from "./lookups";
import { billsApplier } from "./appliers/bills";
import { competitorMediaApplier } from "./appliers/competitor-media";
import { digitalApplier } from "./appliers/digital";
import { performanceApplier } from "./appliers/performance";
import { planApplier } from "./appliers/plan";
import { spendApplier } from "./appliers/spend";
import type { Applier, BrandScope, Missing } from "./appliers/types";
import { isSampleUpload, SAMPLE_TAG } from "@/lib/sample";

const APPLIERS: Partial<Record<UploadKind, Applier>> = {
  spend: spendApplier as Applier,
  plan: planApplier as Applier,
  performance: performanceApplier as Applier,
  digital: digitalApplier as Applier,
  competitor_media: competitorMediaApplier as Applier,
  bills: billsApplier as Applier,
};

export function supportsUpload(kind: UploadKind): boolean {
  return Boolean(APPLIERS[kind]);
}

export type CheckStatus = "pass" | "review" | "fail";
export type UploadPreview = {
  fileName: string;
  kind: UploadKind;
  fileHash: string;
  ok: boolean;
  checks: { label: string; status: CheckStatus; detail?: string }[];
  rowCount: number;
  periods: string[];
  totals: { status: "no-control" | "match" | "mismatch"; rowsTotal: number; controlTotal: number | null; diff: number };
  errors: RowError[];
  missing: Missing;
  conflicts: number;
  sample: Record<string, CellValue>[];
};

function applierFor(kind: UploadKind): Applier {
  const a = APPLIERS[kind];
  if (!a) throw new ValidationError(`Uploads for "${TEMPLATES[kind].title}" are not available yet`);
  return a;
}

const MAX_ERRORS = 50;

export async function previewUpload(db: Db, input: { kind: UploadKind; fileName: string; data: Uint8Array }): Promise<UploadPreview> {
  const applier = applierFor(input.kind);
  const def = TEMPLATES[input.kind];
  const hash = fileHash(input.data);
  const checks: UploadPreview["checks"] = [];
  const empty = { status: "no-control" as const, rowsTotal: 0, controlTotal: null, diff: 0 };
  const result = (extra: Partial<UploadPreview>): UploadPreview => ({
    fileName: input.fileName, kind: input.kind, fileHash: hash, ok: !checks.some((c) => c.status === "fail"), checks,
    rowCount: 0, periods: [], totals: empty, errors: [], missing: { vendors: [], tvStations: [] }, conflicts: 0, sample: [], ...extra,
  });

  if (!checkFileType(input.fileName)) {
    checks.push({ label: "File type", status: "fail", detail: "Use an .xlsx, .xls or .csv file" });
    return result({});
  }
  checks.push({ label: "File type", status: "pass", detail: input.fileName.split(".").pop()?.toUpperCase() });

  let parsed;
  try {
    parsed = parseSheet(input.data, input.kind);
  } catch {
    checks.push({ label: "Read the file", status: "fail", detail: "The file could not be read as a spreadsheet" });
    return result({});
  }
  if (parsed.headerErrors.length) {
    checks.push({ label: "Columns match the template", status: "fail", detail: parsed.headerErrors.join("; ") });
    return result({});
  }
  checks.push({ label: "Columns match the template", status: "pass" });

  const rowCount = parsed.rows.length;
  const periods = detectPeriods(parsed.rows, def);
  checks.push(
    periods.length
      ? { label: "Month found", status: "pass", detail: periods.map(formatMonth).join(", ") }
      : { label: "Month found", status: "fail", detail: "No valid month in the file" },
  );

  const [dup] = await db
    .select({ id: uploads.id, fileName: uploads.fileName })
    .from(uploads)
    .where(and(eq(uploads.fileHash, hash), eq(uploads.kind, input.kind), eq(uploads.status, "confirmed")));
  checks.push(
    dup
      ? { label: "Not a copy of an earlier upload", status: "fail", detail: `Same file as version ${dup.id} (${dup.fileName})` }
      : { label: "Not a copy of an earlier upload", status: "pass" },
  );

  const lk = await loadLookups(db);
  const resolved = applier.resolve(parsed.rows, lk);
  const errors = [...parsed.errors, ...resolved.errors].sort((a, b) => a.row - b.row);
  checks.push(
    rowCount === 0
      ? { label: "Rows to import", status: "fail", detail: "The file has no data rows" }
      : errors.length
        ? { label: "Rows to import", status: "fail", detail: `${errors.length} problem(s) in ${rowCount} rows` }
        : { label: "Rows to import", status: "pass", detail: `${rowCount} rows` },
  );

  const t = checkTotals(parsed.rows, def.totalKey, parsed.controlTotal);
  const totals = { ...t, controlTotal: parsed.controlTotal };
  checks.push(
    t.status === "mismatch"
      ? { label: "Totals match", status: "review", detail: `Totals differ by ${formatTaka(Math.abs(t.diff))} BDT (rows ${formatTaka(t.rowsTotal)}, TOTAL row ${formatTaka(parsed.controlTotal ?? 0)})` }
      : t.status === "match"
        ? { label: "Totals match", status: "pass", detail: `${formatTaka(t.rowsTotal)} BDT` }
        : { label: "Totals match", status: "pass", detail: "No TOTAL row to compare" },
  );

  const newNames = [...resolved.missing.vendors, ...resolved.missing.tvStations];
  if (newNames.length) checks.push({ label: "New names will be added", status: "review", detail: newNames.join(", ") });

  const existing = await applier.existingKeys(db, periods);
  const conflicts = planMerge(existing, resolved.items).conflicts.length;
  if (conflicts) checks.push({ label: "Manual edits kept", status: "review", detail: `${conflicts} row(s) match a manual edit and will be skipped` });

  return result({
    rowCount, periods, totals, errors: errors.slice(0, MAX_ERRORS), missing: resolved.missing, conflicts,
    sample: parsed.rows.slice(0, 20).map((r) => r.values),
  });
}

/**
 * Sample and real records never replace each other: a file naming only sample brands replaces
 * sample rows only, any other file replaces everything except sample rows.
 */
async function brandScope(tx: Db, rows: ParsedRow[]): Promise<BrandScope> {
  const sampleIds = (await tx.select({ id: brands.id }).from(brands).where(like(brands.name, `%${SAMPLE_TAG}`))).map((b) => b.id);
  return { ids: sampleIds, only: isSampleUpload(rows.map((r) => r.values)) };
}

async function applySnapshot(tx: Db, applier: Applier, rows: ParsedRow[], periods: string[], uploadId: number) {
  const first = applier.resolve(rows, await loadLookups(tx));
  await applier.createMissing(tx, first.missing);
  const { items, errors } = applier.resolve(rows, await loadLookups(tx));
  if (errors.length) throw new ValidationError(`Row ${errors[0].row}: ${errors[0].message}`);
  const { toInsert, conflicts } = planMerge(await applier.existingKeys(tx, periods), items);
  const inserted = await applier.replace(tx, periods, toInsert, uploadId, await brandScope(tx, rows));
  return { inserted, skippedManual: conflicts.length };
}

async function supersedeOverlapping(tx: Db, kind: UploadKind, periods: string[], keepId: number, sample: boolean) {
  const confirmed = await tx.select({ id: uploads.id, periods: uploads.periods, rows: uploads.rows }).from(uploads)
    .where(and(eq(uploads.kind, kind), eq(uploads.status, "confirmed")));
  // A sample file only supersedes sample versions, and a real file only real ones.
  const ids = confirmed
    .filter((u) => u.id !== keepId && u.periods.some((p) => periods.includes(p)) && isSampleUpload(u.rows) === sample)
    .map((u) => u.id);
  if (ids.length) await tx.update(uploads).set({ status: "superseded" }).where(inArray(uploads.id, ids));
}

export async function confirmUpload(
  db: Db,
  input: { kind: UploadKind; fileName: string; data: Uint8Array; acceptMismatch: boolean },
): Promise<{ uploadId: number; inserted: number; skippedManual: number }> {
  const preview = await previewUpload(db, input);
  const failed = preview.checks.find((c) => c.status === "fail");
  if (failed) {
    const detail = failed.label === "Not a copy of an earlier upload" ? `This file was already uploaded. ${failed.detail}` : `${failed.label}: ${failed.detail ?? "failed"}`;
    throw new ValidationError(detail);
  }
  if (preview.totals.status === "mismatch" && !input.acceptMismatch) {
    throw new ValidationError(`Totals differ by ${formatTaka(Math.abs(preview.totals.diff))} BDT. Tick the box to confirm the rows are correct.`);
  }
  return saveUpload(db, {
    kind: input.kind, fileName: input.fileName, fileHash: preview.fileHash, periods: preview.periods,
    rowCount: preview.rowCount, totals: preview.totals, rows: parseSheet(input.data, input.kind).rows,
  });
}

type SaveInput = {
  kind: UploadKind; fileName: string; fileHash: string; periods: string[]; rowCount: number;
  totals: UploadPreview["totals"]; rows: ParsedRow[];
};

/** One transaction: record the version, supersede overlapping ones, apply the rows, log it. */
async function saveUpload(db: Db, input: SaveInput) {
  const applier = applierFor(input.kind);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [up] = await tx.insert(uploads).values({
      kind: input.kind, fileName: input.fileName, fileHash: input.fileHash, periods: input.periods, rowCount: input.rowCount,
      // Money columns hold whole taka; a TOTAL row with VAT decimals is rounded like the rows are.
      controlTotal: input.totals.controlTotal === null ? null : Math.round(input.totals.controlTotal),
      rowsTotal: Math.round(input.totals.rowsTotal), rows: input.rows.map((r) => r.values),
    }).returning({ id: uploads.id });
    await supersedeOverlapping(tx, input.kind, input.periods, up.id, isSampleUpload(input.rows.map((r) => r.values)));
    const res = await applySnapshot(tx, applier, input.rows, input.periods, up.id);
    await logChange(tx, {
      entity: "upload", entityId: up.id, action: "upload",
      after: { kind: input.kind, fileName: input.fileName, periods: input.periods, ...res, totals: input.totals },
      reason: input.totals.status === "mismatch" ? "Total mismatch accepted" : undefined,
    });
    return { uploadId: up.id, ...res };
  });
}

/**
 * Save a file the app generated itself (sample data) without the preview round trips.
 * The rows still go through the same appliers, so any bad row still fails the whole file.
 */
export async function importGeneratedFile(db: Db, input: { kind: UploadKind; fileName: string; data: Uint8Array }) {
  const def = TEMPLATES[input.kind];
  const parsed = parseSheet(input.data, input.kind);
  const problem = parsed.headerErrors[0] ?? (parsed.errors[0] && `Row ${parsed.errors[0].row}: ${parsed.errors[0].message}`);
  if (problem) throw new ValidationError(`${input.fileName}: ${problem}`);
  const t = checkTotals(parsed.rows, def.totalKey, parsed.controlTotal);
  return saveUpload(db, {
    kind: input.kind, fileName: input.fileName, fileHash: fileHash(input.data), periods: detectPeriods(parsed.rows, def),
    rowCount: parsed.rows.length, totals: { ...t, controlTotal: parsed.controlTotal }, rows: parsed.rows,
  });
}

export async function restoreUpload(db: Db, uploadId: number) {
  const [up] = await db.select().from(uploads).where(eq(uploads.id, uploadId));
  if (!up) throw new ValidationError("Upload not found");
  if (up.status === "confirmed") throw new ValidationError("This version is already the current one");
  const applier = applierFor(up.kind);
  const rows: ParsedRow[] = up.rows.map((values, i) => ({ rowNumber: i + 2, values }));
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await supersedeOverlapping(tx, up.kind, up.periods, up.id, isSampleUpload(up.rows));
    await tx.update(uploads).set({ status: "confirmed" }).where(eq(uploads.id, up.id));
    const res = await applySnapshot(tx, applier, rows, up.periods, up.id);
    await logChange(tx, { entity: "upload", entityId: up.id, action: "restore", after: { kind: up.kind, fileName: up.fileName, periods: up.periods, ...res } });
    return res;
  });
}

export async function listUploads(db: Db) {
  return db
    .select({
      id: uploads.id, kind: uploads.kind, fileName: uploads.fileName, periods: uploads.periods, rowCount: uploads.rowCount,
      controlTotal: uploads.controlTotal, rowsTotal: uploads.rowsTotal, status: uploads.status, createdAt: uploads.createdAt,
    })
    .from(uploads)
    .orderBy(desc(uploads.id));
}

export async function listHistory(db: Db, q: { entity?: string; limit?: number } = {}) {
  const base = db.select().from(historyLog);
  const filtered = q.entity ? base.where(eq(historyLog.entity, q.entity)) : base;
  return filtered.orderBy(desc(historyLog.id)).limit(q.limit ?? 200);
}
