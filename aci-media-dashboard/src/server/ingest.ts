import { createHash } from "node:crypto";
import { checkXlsxBytes } from "@/lib/ingest/xlsx-check";
import { openWorkbook, type Workbook } from "@/lib/ingest/workbook";
import { detectFileType, type Detection } from "@/lib/ingest/detect";
import { FILE_TYPE_LABEL, isFileType, type FileType } from "@/lib/ingest/file-types";
import { READERS, READER_NEEDS_STYLES } from "@/lib/ingest/readers";
import { NeedsBusinessError, ReadError, type ReaderContext, type ReadResult } from "@/lib/ingest/read-result";
import { isDigitalBusiness, resolveDigitalBusiness, type BusinessSource, type DigitalBusiness } from "@/lib/ingest/brands";
import { readAtl, readAtlTitle } from "@/lib/ingest/readers/atl";
import { digitalBrands } from "@/lib/ingest/readers/digital";
import { matchAtlCategory, suggestOwnBrands } from "@/lib/ingest/suggestions";
import { makeSlug } from "@/store/catalog";
import { getActiveFileHashes, publishVersions, type PublishInput } from "@/store/datasets";
import type { Store } from "@/store/client";
import { ValidationError } from "./errors";

export const MAX_FILES = 30;

export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null; chosenBusiness?: DigitalBusiness | null };
export type FilePreview = {
  index: number; fileName: string; sizeBytes: number; sha256: string;
  detection: Detection | null; type: FileType | null;
  label: string | null; summary: string | null; datasetKey: string | null;
  rowCount: number; warnings: string[]; errors: string[];
  canPublish: boolean; blockReason: string | null;
  business: DigitalBusiness | null; businessSource: BusinessSource | null; needsBusiness: boolean;
};
type Prepared = { preview: FilePreview; result: ReadResult<unknown> | null };

const NOT_OPENABLE = "This file could not be opened as an Excel workbook.";

type OldBusiness = { name: DigitalBusiness; source: BusinessSource };

/**
 * Bridge until Task 4 reads the admin's lists: builds the reader's context from his old fixed lists,
 * so dataset keys, labels and data stay as they were (Digital keys now use the business slug).
 */
function oldListContext(type: FileType, wb: Workbook, fileName: string, chosen: DigitalBusiness | null): { ctx: ReaderContext; business: OldBusiness | null } {
  if (type === "digital") {
    const r = resolveDigitalBusiness({ brands: digitalBrands(wb), fileName, chosen });
    if (!r) return { ctx: { fileName, business: null }, business: null };
    return { ctx: { fileName, business: { slug: makeSlug(r.business, () => false, "business"), name: r.business } }, business: { name: r.business, source: r.source } };
  }
  if (type === "atl") {
    const title = readAtlTitle(wb);
    const c = matchAtlCategory(title);
    if (!c) throw new ReadError(`"${title}" doesn't match any ATL category on the dashboard (Savlon Soap, Septex, Hand Wash, Antiseptic Liquid, Baby Soft, Savlon/Twinkle Baby Wipes, Freedom, Diaper, Salt, Mustard Oil, Rice, Spices).`);
    const base = { slug: c[0], name: c[1], business: c[2] };
    const brands = readAtl(wb, { fileName, atlCategory: { ...base, ownBrands: [] } }).data.brands;
    return { ctx: { fileName, atlCategory: { ...base, ownBrands: suggestOwnBrands(title, brands) } }, business: null };
  }
  return { ctx: { fileName }, business: null };
}

/** Reads one file: byte check, detection, reader. Pure: no store, no network. */
function prepareFile(input: UploadInput, index: number): Prepared {
  const preview: FilePreview = {
    index,
    fileName: input.name.trim().slice(0, 255) || "upload.xlsx",
    sizeBytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    detection: null, type: null, label: null, summary: null, datasetKey: null,
    rowCount: 0, warnings: [], errors: [], canPublish: false, blockReason: null,
    business: null, businessSource: null, needsBusiness: false,
  };
  const block = (reason: string, error: string | null = reason): Prepared => {
    if (error !== null) preview.errors = [error];
    preview.blockReason = reason;
    preview.canPublish = false;
    return { preview, result: null };
  };

  const check = checkXlsxBytes(input.bytes);
  if (!check.ok) return block(check.reason);

  let wb: Workbook;
  try {
    wb = openWorkbook(input.bytes);
  } catch (e) {
    console.error("openWorkbook failed", e instanceof Error ? e.name : "error");
    return block(NOT_OPENABLE);
  }

  let detection: Detection;
  try {
    detection = detectFileType(wb);
  } catch (e) {
    console.error("detectFileType failed", e instanceof Error ? e.name : "error");
    return block(NOT_OPENABLE);
  }
  preview.detection = detection;

  // Spec p2-04: a file that matches none of his usual files is refused, whatever type the admin picks.
  if (detection.status === "none") return block("This is not one of the usual Media Mind files.", detection.lookedFor);
  const chosen = isFileType(input.chosenType) ? input.chosenType : null; // an unknown override is ignored
  const type: FileType | null = chosen ?? (detection.status === "sure" ? detection.type : null);
  if (!type) return block("Pick the file type.", null);
  preview.type = type;
  if (detection.status === "sure" && detection.type !== type) {
    preview.warnings.push(`Detected as ${FILE_TYPE_LABEL[detection.type]}, but you picked ${FILE_TYPE_LABEL[type]}.`);
  }

  const reader = Object.hasOwn(READERS, type) ? READERS[type] : undefined;
  if (!reader) {
    preview.label = FILE_TYPE_LABEL[type];
    return block(`Recognised as ${FILE_TYPE_LABEL[type]}. Its reader comes in the next update.`, null);
  }

  if (READER_NEEDS_STYLES.has(type)) {
    try {
      wb = openWorkbook(input.bytes, { styles: true }); // fill colours carry data (Billboard statuses)
    } catch (e) {
      console.error("openWorkbook failed", e instanceof Error ? e.name : "error");
      return block(NOT_OPENABLE);
    }
  }

  let result: ReadResult<unknown>;
  let business: OldBusiness | null = null;
  try {
    // An unknown business override is ignored, the same as an unknown type.
    const chosen = isDigitalBusiness(input.chosenBusiness) ? input.chosenBusiness : null;
    const old = oldListContext(type, wb, preview.fileName, chosen);
    business = old.business;
    result = reader(wb, old.ctx);
  } catch (e) {
    if (e instanceof NeedsBusinessError) {
      preview.needsBusiness = true;
      return block("Pick the business.", null);
    }
    if (e instanceof ReadError) return block("Fix the read error first.", e.message);
    console.error("reader failed", e);
    const msg = `This file could not be read as ${FILE_TYPE_LABEL[type]}.`;
    return block(msg);
  }

  preview.label = result.label;
  preview.summary = result.summary;
  preview.datasetKey = result.datasetKey;
  preview.rowCount = result.rowCount;
  preview.warnings.push(...result.warnings);
  if (business) {
    preview.business = business.name;
    preview.businessSource = business.source;
    if (business.source === "file name") preview.warnings.push("Business taken from the file name.");
  }
  preview.canPublish = true;
  return { preview, result };
}

function checkBatch(inputs: UploadInput[]) {
  if (inputs.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (inputs.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
}

/** Batch rules that need every file: two files for one dataset, same file as the one in use. */
async function prepareAll(store: Store, inputs: UploadInput[]): Promise<Prepared[]> {
  const prepared = inputs.map((input, i) => prepareFile(input, i));

  const counts = new Map<string, number>();
  for (const p of prepared) {
    if (p.preview.canPublish && p.preview.datasetKey) counts.set(p.preview.datasetKey, (counts.get(p.preview.datasetKey) ?? 0) + 1);
  }
  for (const p of prepared) {
    const key = p.preview.datasetKey;
    if (p.preview.canPublish && key && (counts.get(key) ?? 0) > 1) {
      p.preview.canPublish = false;
      p.preview.blockReason = `Two files are for ${p.preview.label}. Remove one.`;
    }
  }

  const keys = [...new Set(prepared.map((p) => p.preview.datasetKey).filter((k): k is string => !!k))];
  if (keys.length) {
    const active = await getActiveFileHashes(store, keys);
    for (const p of prepared) {
      const key = p.preview.datasetKey;
      if (p.preview.canPublish && key && active.get(key) === p.preview.sha256) p.preview.warnings.push("This is the same file as the one in use.");
    }
  }
  return prepared;
}

export async function previewUploads(store: Store, inputs: UploadInput[]): Promise<FilePreview[]> {
  checkBatch(inputs);
  return (await prepareAll(store, inputs)).map((p) => p.preview);
}

export async function publishUploads(store: Store, inputs: UploadInput[]) {
  checkBatch(inputs);
  const prepared = await prepareAll(store, inputs); // re-read from the bytes; a preview is never trusted
  const blocked = prepared.find((p) => !p.preview.canPublish || !p.result);
  if (blocked) throw new ValidationError(`${blocked.preview.fileName}: ${blocked.preview.blockReason}`);

  const publishInputs: PublishInput[] = prepared.map(({ preview, result }, i) => {
    if (!result) throw new ValidationError(`${preview.fileName}: ${preview.blockReason}`);
    const r = result;
    return {
      datasetKey: r.datasetKey,
      kind: r.type,
      label: r.label,
      source: "upload",
      summary: { summary: r.summary, months: r.months, rowCount: r.rowCount, warnings: preview.warnings, sha256: preview.sha256, fileName: preview.fileName },
      data: r.data,
      file: { name: preview.fileName, bytes: Buffer.from(inputs[i].bytes) },
    };
  });
  const { versionIds } = await publishVersions(store, publishInputs);
  return { published: publishInputs.map((p, i) => ({ datasetKey: p.datasetKey, label: p.label, versionId: versionIds[i] })) };
}
