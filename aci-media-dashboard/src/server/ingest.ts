import { createHash } from "node:crypto";
import { z } from "zod";
import { checkXlsxBytes } from "@/lib/ingest/xlsx-check";
import { openWorkbook, type Workbook } from "@/lib/ingest/workbook";
import { detectFileType, type Detection } from "@/lib/ingest/detect";
import { FILE_TYPE_LABEL, isFileType, type FileType } from "@/lib/ingest/file-types";
import { READERS, READER_NEEDS_STYLES } from "@/lib/ingest/readers";
import { NeedsBusinessError, NeedsCategoryError, ReadError, type ReaderContext, type ReadResult } from "@/lib/ingest/read-result";
import type { BusinessSource } from "@/lib/ingest/brands";
import { namesIn } from "@/lib/ingest/names";
import { atlBrands, readAtlTitle } from "@/lib/ingest/readers/atl";
import { digitalBrands } from "@/lib/ingest/readers/digital";
import { FY_STANDARD_ORDER } from "@/lib/ingest/readers/fy";
import { suggestAtlCategory, suggestBusiness, suggestFullName, suggestOwnBrands } from "@/lib/ingest/suggestions";
import { applyCatalogChanges, getCatalog, makeSlug, normName, type Catalog, type CatalogChange } from "@/store/catalog";
import { getActiveFileHashes, publishVersionsTx, type PublishInput } from "@/store/datasets";
import type { Store, StoreTx } from "@/store/client";
import { ValidationError } from "./errors";

export const MAX_FILES = 30;

/** The admin's answers for one file. Untrusted: every value is checked against the lists and the re-read file before it counts. */
export const DecisionsSchema = z.object({
  business: z.string().max(120).nullish(), // file business pick (Digital): an existing slug, or "new:<name>"
  // slug for "same": an existing slug, or "new:<name>" for the business this file adds as <name>
  businesses: z.array(z.object({ name: z.string().max(120), action: z.enum(["new", "same"]), slug: z.string().max(124).nullish() })).max(200).default([]),
  atl: z.object({ business: z.string().max(120), ownBrands: z.array(z.string().max(120)).min(1).max(50) }).nullish(), // business: slug or "new:<name>"
  brands: z.array(z.object({ name: z.string().max(120), fullName: z.string().max(120), business: z.string().max(120) })).max(500).default([]), // business: slug or "new:<name>"
});
export type Decisions = z.infer<typeof DecisionsSchema>;

export type UploadInput = { name: string; bytes: Uint8Array; chosenType?: FileType | null; decisions?: Decisions | null };
export type NewName = { name: string; suggestion: string | null };
export type FilePreview = {
  index: number; fileName: string; sizeBytes: number; sha256: string;
  detection: Detection | null; type: FileType | null;
  label: string | null; summary: string | null; datasetKey: string | null;
  rowCount: number; warnings: string[]; errors: string[];
  canPublish: boolean; blockReason: string | null;
  /** The file's business when it has one (Digital, ATL). slug is null for a business Publish will add. */
  business: { slug: string | null; name: string } | null;
  businessSource: BusinessSource | null;
  /** Digital with no business yet. */
  needsBusiness: boolean;
  /** Undecided business names from the file. */
  newBusinesses: NewName[];
  /** ATL, undecided. brands = the file's rows to tick "Our brands" from. */
  newCategory: { title: string; suggestion: { business: string | null; ownBrands: string[] }; brands: string[] } | null;
  /** Brands not on the list. Never blocks. */
  newBrands: { name: string; business: string | null; suggestion: string | null }[];
  /**
   * What Publish will add to the lists for this file, after valid decisions. A blocked preview may list only part
   * of its changes (the check stopped early); Publish re-reads every file and works all of them out again.
   */
  pendingChanges: CatalogChange[];
};
/**
 * rekey: the file was read with a slug predicted for a business or category Publish adds. Publish looks up the real
 * one and, if it differs (or has another spelling), reads the file again with it through `reread`.
 */
type Prepared = {
  preview: FilePreview;
  result: ReadResult<unknown> | null;
  rekey: { kind: "business" | "atl"; slug: string } | null;
  ctx: ReaderContext | null;
  reread: ((ctx: ReaderContext) => ReadResult<unknown>) | null;
};

const NOT_OPENABLE = "This file could not be opened as an Excel workbook.";
const PICK_BUSINESS = "Pick the business.";
const ADD_CATEGORY = "Add the new ATL category.";
const DECIDE_BUSINESSES = "Decide the new businesses.";

/** Trimmed, inner spaces collapsed, 1 to 120 characters; else null. */
function tidy(s: string): string | null {
  const t = s.trim().replace(/\s+/g, " ");
  return t && t.length <= 120 ? t : null;
}

/** Lower-case words, for finding a business name in a file name. */
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Slugs Publish will give new businesses and ATL categories, keyed by normName, shared by the whole batch.
 * Predicted with the store's own rule against the catalog's slugs plus those already predicted, so two new names
 * with one slug base get "-2", and two files adding the same name share one slug.
 */
type SlugPlan = { business: Map<string, string>; atl: Map<string, string> };

function predict(plan: Map<string, string>, existing: string[], name: string, fallback: "business" | "atl"): string {
  const key = normName(name);
  const known = plan.get(key);
  if (known) return known;
  const taken = new Set([...existing, ...plan.values()]);
  const slug = makeSlug(name, (s) => taken.has(s), fallback);
  plan.set(key, slug);
  return slug;
}

type Biz = { slug: string; name: string; isNew: boolean };

/** One file's list decisions: the catalog snapshot, the batch's slug plan, and the changes this file adds. */
class FileChanges {
  readonly changes: CatalogChange[] = [];
  private readonly added = new Map<string, Biz>(); // businesses this file adds, by slug

  constructor(readonly catalog: Catalog, private readonly plan: SlugPlan) {}

  /** A business this file adds (once). A name already on the list gives that business, or null when it is hidden. */
  addBusiness(raw: string): Biz | null {
    const name = tidy(raw);
    if (!name) return null;
    const existing = this.catalog.businessOf(name);
    if (existing) return existing.hidden ? null : { slug: existing.slug, name: existing.name, isNew: false };
    const slug = predict(this.plan.business, this.catalog.businesses.map((b) => b.slug), name, "business");
    if (!this.added.has(slug)) {
      this.changes.push({ op: "addBusiness", name });
      this.added.set(slug, { slug, name, isNew: true });
    }
    return this.added.get(slug)!;
  }

  /** A business pick: "new:<name>", a slug on the list that is not hidden, or a slug this file adds. Anything else is null. */
  resolve(value: string | null | undefined): Biz | null {
    if (!value) return null;
    if (value.startsWith("new:")) return this.addBusiness(value.slice(4));
    const b = this.catalog.businesses.find((x) => x.slug === value && !x.hidden);
    if (b) return { slug: b.slug, name: b.name, isNew: false };
    return this.added.get(value) ?? null;
  }

  /** The slug Publish will give a new ATL category. */
  atlSlug(title: string): string {
    return predict(this.plan.atl, this.catalog.atl.map((a) => a.slug), title, "atl");
  }
}

/** Digital: the admin's valid pick, else the one business all known brands belong to, else exactly one business named in the file name. */
function digitalBusiness(fc: FileChanges, decisions: Decisions | null, brands: string[], fileName: string): { biz: Biz; source: BusinessSource } | null {
  const picked = fc.resolve(decisions?.business);
  if (picked) return { biz: picked, source: "admin" };
  const { catalog } = fc;
  const visible = (slug: string) => catalog.businesses.find((b) => b.slug === slug && !b.hidden);
  const owners = new Set(brands.map((b) => catalog.brandOf(b)?.businessSlug).filter((s): s is string => !!s));
  if (owners.size === 1) {
    const b = visible([...owners][0]);
    if (b) return { biz: { slug: b.slug, name: b.name, isNew: false }, source: "brands" };
  }
  const inName = ` ${words(fileName)} `;
  const hits = catalog.businesses.filter((b) => !b.hidden && b.names.some((n) => { const w = words(n); return !!w && inName.includes(` ${w} `); }));
  if (hits.length === 1) return { biz: { slug: hits[0].slug, name: hits[0].name, isNew: false }, source: "file name" };
  return null;
}

/** The suggestion for a new ATL category: his business for the title, his own-brand rule, else the row named like the title. */
function categorySuggestion(title: string, rows: string[]) {
  const ruled = suggestOwnBrands(title, rows);
  return {
    business: suggestAtlCategory(title)?.business ?? null,
    ownBrands: ruled.length ? ruled : rows.filter((r) => normName(r) === normName(title)),
  };
}

/** Reads one file and checks its names against the catalog snapshot. No store, no network; only the batch's slug plan is shared. */
function prepareFile(input: UploadInput, index: number, catalog: Catalog, plan: SlugPlan): Prepared {
  const fc = new FileChanges(catalog, plan);
  const preview: FilePreview = {
    index,
    fileName: input.name.trim().slice(0, 255) || "upload.xlsx",
    sizeBytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    detection: null, type: null, label: null, summary: null, datasetKey: null,
    rowCount: 0, warnings: [], errors: [], canPublish: false, blockReason: null,
    business: null, businessSource: null, needsBusiness: false,
    newBusinesses: [], newCategory: null, newBrands: [], pendingChanges: fc.changes,
  };
  const block = (reason: string, error: string | null = reason): Prepared => {
    if (error !== null) preview.errors = [error];
    preview.blockReason = reason;
    preview.canPublish = false;
    return { preview, result: null, rekey: null, ctx: null, reread: null };
  };
  // Re-checked here too: the service never trusts its caller's decisions.
  const parsed = input.decisions ? DecisionsSchema.safeParse(input.decisions) : null;
  const decisions = parsed?.success ? parsed.data : null;

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
  let rekey: Prepared["rekey"] = null;
  let atlRows: string[] = [];
  const ctx: ReaderContext = { fileName: preview.fileName };
  try {
    if (type === "digital") {
      const found = digitalBusiness(fc, decisions, digitalBrands(wb), preview.fileName);
      ctx.business = found ? { slug: found.biz.slug, name: found.biz.name } : null; // never a business that isn't on the list or decided
      if (found) {
        preview.business = { slug: found.biz.isNew ? null : found.biz.slug, name: found.biz.name };
        preview.businessSource = found.source;
        if (found.source === "file name") preview.warnings.push("Business taken from the file name.");
        if (found.biz.isNew) rekey = { kind: "business", slug: found.biz.slug };
      }
    } else if (type === "atl") {
      const title = readAtlTitle(wb);
      const known = catalog.atlOf(title);
      if (known) {
        const bizName = catalog.businesses.find((b) => b.slug === known.businessSlug)?.name ?? known.businessSlug;
        ctx.atlCategory = { slug: known.slug, name: known.name, business: bizName, ownBrands: known.ownBrands };
        preview.business = { slug: known.businessSlug, name: bizName };
        preview.businessSource = "category";
      } else {
        atlRows = atlBrands(wb); // a missing header row is a read error, before any category question
        if (!atlRows.length) throw new ReadError("No brand rows were found under the header row.");
        const name = tidy(title);
        // Our brands must be rows of this file; the business is checked only once the brands are valid, so an ignored decision adds nothing.
        const wanted = new Set((decisions?.atl?.ownBrands ?? []).map(normName));
        const own = atlRows.filter((r) => wanted.has(normName(r)));
        const biz = name && own.length ? fc.resolve(decisions?.atl?.business) : null;
        if (name && biz) {
          const slug = fc.atlSlug(name);
          fc.changes.push({ op: "addAtl", name, businessSlug: biz.slug, ownBrands: own });
          ctx.atlCategory = { slug, name, business: biz.name, ownBrands: own };
          preview.business = { slug: biz.isNew ? null : biz.slug, name: biz.name };
          preview.businessSource = "admin";
          rekey = { kind: "atl", slug };
        } else {
          ctx.atlCategory = null; // the reader asks for the category
        }
      }
    }
    result = reader(wb, ctx);
  } catch (e) {
    if (e instanceof NeedsBusinessError) {
      preview.needsBusiness = true;
      return block(PICK_BUSINESS, null);
    }
    if (e instanceof NeedsCategoryError) {
      preview.newCategory = { title: e.title, suggestion: categorySuggestion(e.title, atlRows), brands: atlRows };
      return block(ADD_CATEGORY, null);
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

  const names = namesIn(result);
  // FY without its business table: the reader filled his standard order, which is not the file's own names.
  const noBusinessColumn = result.type === "fy" && result.warnings.includes(FY_STANDARD_ORDER);
  const fileBusinesses = noBusinessColumn ? [] : names.businesses;
  const fileBrands = noBusinessColumn ? names.brands.map((b) => ({ ...b, business: null })) : names.brands;

  // Business names: "new" first, so a "same as" a business added here comes after it.
  const unknownBiz = new Map(fileBusinesses.filter((n) => !catalog.businessOf(n)).map((n) => [normName(n), n] as const));
  const bizDecisions = new Map<string, Decisions["businesses"][number]>();
  for (const d of decisions?.businesses ?? []) {
    const found = unknownBiz.get(normName(d.name));
    if (!found) continue; // a decision about a name the server did not find in this file is ignored
    if (!bizDecisions.has(normName(found))) bizDecisions.set(normName(found), d);
  }
  const decidedBiz = new Set<string>();
  for (const [key, d] of bizDecisions) {
    if (d.action === "new" && fc.addBusiness(unknownBiz.get(key)!)) decidedBiz.add(key);
  }
  for (const [key, d] of bizDecisions) {
    if (d.action !== "same") continue;
    // A visible slug, a business this file adds, or "new:<name>" (added first, once). Hidden or unknown: ignored.
    const target = fc.resolve(d.slug);
    if (!target) continue;
    fc.changes.push({ op: "businessSameAs", name: unknownBiz.get(key)!, slug: target.slug });
    decidedBiz.add(key);
  }
  preview.newBusinesses = [...unknownBiz].filter(([key]) => !decidedBiz.has(key)).map(([, name]) => ({ name, suggestion: suggestBusiness(name) }));

  // Brands: never block. A decided brand is added under its full name, matching the file's name too.
  const unknownBrands = new Map(fileBrands.filter((b) => !catalog.brandOf(b.name)).map((b) => [normName(b.name), b] as const));
  const decidedBrands = new Set<string>();
  for (const d of decisions?.brands ?? []) {
    const key = normName(d.name);
    const found = unknownBrands.get(key);
    if (!found || decidedBrands.has(key)) continue; // only names the server found in this file, once each
    const fullName = tidy(d.fullName);
    const biz = fullName ? fc.resolve(d.business) : null;
    if (!fullName || !biz) continue;
    fc.changes.push({ op: "addBrand", name: fullName, businessSlug: biz.slug, ...(normName(fullName) !== key ? { alsoMatches: [found.name] } : {}) });
    decidedBrands.add(key);
  }
  const fileBizName = preview.business?.name ?? null;
  preview.newBrands = [...unknownBrands]
    .filter(([key]) => !decidedBrands.has(key))
    .map(([, b]) => ({ name: b.name, business: b.business ?? fileBizName, suggestion: suggestFullName(b.name) }));
  const n = preview.newBrands.length;
  if (n) preview.warnings.push(`${n} ${n === 1 ? "brand" : "brands"} not on your list.`);

  if (preview.newBusinesses.length) return block(DECIDE_BUSINESSES, null);
  preview.canPublish = true;
  const book = wb;
  return { preview, result, rekey, ctx, reread: (c) => reader(book, c) };
}

function checkBatch(inputs: UploadInput[]) {
  if (inputs.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (inputs.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
}

/** Batch rules that need every file: one catalog snapshot and slug plan, two files for one dataset, same file as the one in use. */
async function prepareAll(store: Store, inputs: UploadInput[]): Promise<{ prepared: Prepared[]; plan: SlugPlan }> {
  const catalog = await getCatalog(store);
  const plan: SlugPlan = { business: new Map(), atl: new Map() };
  const prepared = inputs.map((input, i) => prepareFile(input, i, catalog, plan));

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
  return { prepared, plan };
}

export async function previewUploads(store: Store, inputs: UploadInput[]): Promise<FilePreview[]> {
  checkBatch(inputs);
  return (await prepareAll(store, inputs)).prepared.map((p) => p.preview);
}

const changedWhileUploading = (fileName: string, what: string) => new ValidationError(`${fileName}: ${what} while you were uploading. Preview again.`);

/**
 * Applies each file's list changes in order, inside the publish transaction, and returns predicted slug -> real slug.
 * They differ only if the lists changed after the snapshot; later changes then use the real slug. A name that now
 * matches a hidden business or ATL category refuses the whole Publish.
 */
async function applyChanges(tx: StoreTx, prepared: Prepared[], plan: SlugPlan) {
  const real = { business: new Map<string, string>(), atl: new Map<string, string>() };
  const biz = (slug: string) => real.business.get(slug) ?? slug;
  for (const { preview } of prepared) {
    for (const change of preview.pendingChanges) {
      switch (change.op) {
        case "addBusiness": {
          const key = normName(change.name);
          const predicted = plan.business.get(key);
          const made = await applyCatalogChanges(tx, [change]);
          if (predicted && !real.business.has(predicted)) {
            let slug = made.businessSlugs[key];
            if (!slug) {
              const found = (await getCatalog(tx)).businessOf(change.name); // the name matched a business added since the snapshot
              if (found?.hidden) throw changedWhileUploading(preview.fileName, `the business "${found.name}" was hidden`);
              slug = found?.slug ?? predicted;
            }
            real.business.set(predicted, slug);
          }
          break;
        }
        case "businessSameAs":
          await applyCatalogChanges(tx, [{ ...change, slug: biz(change.slug) }]);
          break;
        case "addBrand":
          await applyCatalogChanges(tx, [{ ...change, businessSlug: biz(change.businessSlug) }]);
          break;
        case "addAtl": {
          const key = normName(change.name);
          const predicted = plan.atl.get(key);
          const made = await applyCatalogChanges(tx, [{ ...change, businessSlug: biz(change.businessSlug) }]);
          if (predicted && !real.atl.has(predicted)) {
            let slug = made.atlSlugs[key];
            if (!slug) {
              const found = (await getCatalog(tx)).atlOf(change.name);
              if (found?.hidden) throw changedWhileUploading(preview.fileName, `the ATL category "${found.name}" was hidden`);
              slug = found?.slug ?? predicted;
            }
            real.atl.set(predicted, slug);
          }
          break;
        }
      }
    }
  }
  return real;
}

/**
 * A file read with a predicted business or category: read it again with the one now on the list (real slug, its own
 * spelling, and for a category its business and our brands) when that differs from what the preview used.
 */
function readWithReal(p: Prepared, result: ReadResult<unknown>, real: Awaited<ReturnType<typeof applyChanges>>, after: Catalog): { result: ReadResult<unknown>; warnings: string[] } {
  const { rekey, ctx, reread, preview } = p;
  if (!rekey || !ctx || !reread) return { result, warnings: preview.warnings };
  const next: ReaderContext = { ...ctx };
  if (rekey.kind === "business") {
    const slug = real.business.get(rekey.slug) ?? rekey.slug;
    const b = after.businesses.find((x) => x.slug === slug);
    if (!b) throw changedWhileUploading(preview.fileName, "the lists changed");
    next.business = { slug: b.slug, name: b.name };
  } else {
    const slug = real.atl.get(rekey.slug) ?? rekey.slug;
    const a = after.atl.find((x) => x.slug === slug);
    const b = a && after.businesses.find((x) => x.slug === a.businessSlug);
    if (!a || !b) throw changedWhileUploading(preview.fileName, "the lists changed");
    next.atlCategory = { slug: a.slug, name: a.name, business: b.name, ownBrands: a.ownBrands };
  }
  if (JSON.stringify(next) === JSON.stringify(ctx)) return { result, warnings: preview.warnings };
  const again = reread(next);
  return { result: again, warnings: [...preview.warnings.filter((w) => !result.warnings.includes(w)), ...again.warnings] };
}

export async function publishUploads(store: Store, inputs: UploadInput[]) {
  checkBatch(inputs);
  const { prepared, plan } = await prepareAll(store, inputs); // re-read from the bytes; a preview is never trusted
  const blocked = prepared.find((p) => !p.preview.canPublish || !p.result);
  if (blocked) throw new ValidationError(`${blocked.preview.fileName}: ${blocked.preview.blockReason}`);

  // The list changes and the versions commit together, or neither does.
  return store.transaction(async (tx) => {
    const real = await applyChanges(tx, prepared, plan);
    const after = prepared.some((p) => p.rekey) ? await getCatalog(tx) : null;
    const publishInputs: PublishInput[] = prepared.map((p, i) => {
      const { preview } = p;
      if (!p.result) throw new ValidationError(`${preview.fileName}: ${preview.blockReason}`);
      const { result: r, warnings } = after ? readWithReal(p, p.result, real, after) : { result: p.result, warnings: preview.warnings };
      return {
        datasetKey: r.datasetKey,
        kind: r.type,
        label: r.label,
        source: "upload",
        summary: { summary: r.summary, months: r.months, rowCount: r.rowCount, warnings, sha256: preview.sha256, fileName: preview.fileName },
        data: r.data,
        file: { name: preview.fileName, bytes: Buffer.from(inputs[i].bytes) },
      };
    });
    const versionIds = await publishVersionsTx(tx, publishInputs);
    return { published: publishInputs.map((p, i) => ({ datasetKey: p.datasetKey, label: p.label, versionId: versionIds[i] })) };
  });
}
