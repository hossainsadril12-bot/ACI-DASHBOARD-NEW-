import type { FileType } from "@/lib/ingest/file-types";
import { normName } from "@/lib/names-normal";
import type { Decisions, FilePreview } from "@/server/ingest";

// Pure helpers for the Data Entry page. Safe for the browser: types only from the server.

export type RowStatus = "ready" | "needs-type" | "needs-business" | "new-business" | "new-category" | "blocked";
export const NEEDS_TYPE = "Pick the file type.";

export function rowStatus(p: FilePreview): RowStatus {
  if (p.canPublish) return "ready";
  if (p.needsBusiness) return "needs-business";
  if (p.newCategory) return "new-category";
  if (p.newBusinesses.length > 0) return "new-business";
  return p.blockReason === NEEDS_TYPE ? "needs-type" : "blocked";
}

// ---- List decisions -------------------------------------------------------------------------------------------
// The server's DecisionsSchema limits. One entry out of range makes it ignore the file's whole decisions object.
const MAX_NAME = 120;
const MAX_SAME_SLUG = 124; // "new:" + a name
const MAX_BUSINESS_ENTRIES = 200;
const MAX_BRAND_ENTRIES = 500;
export const MAX_OWN_BRANDS = 50;
/** The longest name a "New business…" box takes: "new:<name>" must fit in 120 characters. */
export const MAX_NEW_BUSINESS_NAME = MAX_NAME - "new:".length;

/** The "New business…" option of a Business select. Slugs never contain "_". */
export const NEW_BUSINESS = "__new__";

export type BusinessOption = { slug: string; name: string };
export type BusinessDecision = Decisions["businesses"][number];
/** A Business select: "" (none), a business slug, or NEW_BUSINESS with the typed name. */
export type BusinessPick = { value: string; newName: string };
/** A brand from the preview with the admin's choices. business: the business name from the file, or null (pick: "" | slug | "new:<name>"). */
export type BrandDraft = { name: string; business: string | null; suggestion: string | null; ticked: boolean; fullName: string; pick: string };
/** Everything the admin decided for one row. Dropped when the row is removed, cleared or its type changes. */
export type RowDraft = {
  business: BusinessPick; // Digital
  bizNames: string[]; // every new business name seen in this row, in the file's order, decided or not
  businesses: BusinessDecision[];
  atl: { title: string; business: BusinessPick; ownBrands: string[] } | null; // set by Add category
  brands: BrandDraft[]; // every new brand seen, ticked or not
};

export const emptyDraft = (): RowDraft => ({ business: { value: "", newName: "" }, bizNames: [], businesses: [], atl: null, brands: [] });

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const same = (a: string, b: string) => normName(a) === normName(b);

/** A Business select's value to send: a slug, "new:<typed name>", or null. */
export function pickValue(p: BusinessPick): string | null {
  if (p.value === NEW_BUSINESS) {
    const name = tidy(p.newName);
    return name ? `new:${name}` : null;
  }
  return p.value || null;
}

/** Every name of `preview.newBusinesses` decided "new", after the decisions already made. */
export function addAllAsNew(preview: FilePreview, current: BusinessDecision[] = []): BusinessDecision[] {
  const out = [...current];
  for (const { name } of preview.newBusinesses) {
    if (!out.some((d) => same(d.name, name))) out.push({ name, action: "new" });
  }
  return out;
}

/** The names seen before, then the new ones from this preview. Decided names leave the preview but stay on screen. */
export function seenNames(prev: string[], preview: FilePreview): string[] {
  const out = [...prev];
  for (const { name } of preview.newBusinesses) if (!out.some((n) => same(n, name))) out.push(name);
  return out;
}

/** The brands seen before (with their choices), then the new ones, pre-filled with the suggestion or the name. */
export function seenBrands(prev: BrandDraft[], preview: FilePreview): BrandDraft[] {
  const out = [...prev];
  for (const b of preview.newBrands) {
    if (out.some((x) => same(x.name, b.name))) continue;
    out.push({ name: b.name, business: b.business, suggestion: b.suggestion, ticked: false, fullName: b.suggestion ?? b.name, pick: "" });
  }
  return out;
}

const decisionOf = (list: BusinessDecision[], name: string) => list.find((d) => same(d.name, name));

/**
 * The choices for one new business name. Values: "add", or "same:<slug>" for a visible business, or
 * "same:new:<name>" for another business this row adds (the file's own spelling; the server resolves it).
 */
export function sameAsOptions(name: string, draft: RowDraft, businesses: BusinessOption[]): { value: string; label: string }[] {
  const adding = draft.bizNames.filter((n) => !same(n, name) && decisionOf(draft.businesses, n)?.action !== "same");
  return [
    { value: "add", label: "Add as new" },
    ...businesses.map((b) => ({ value: `same:${b.slug}`, label: `Same as ${b.name}` })),
    ...adding.map((n) => ({ value: `same:new:${n}`, label: `Same as ${n}` })),
  ];
}

/** The select value showing a name's decision. */
export function decisionValue(list: BusinessDecision[], name: string): string {
  const d = decisionOf(list, name);
  if (!d) return "";
  return d.action === "new" ? "add" : `same:${d.slug ?? ""}`;
}

/**
 * Sets one name's decision ("" clears it). "Same as" another name this row adds also adds that name; a name that is
 * no longer added drops the decisions that pointed at it.
 */
export function setBusinessDecision(list: BusinessDecision[], names: string[], name: string, value: string): BusinessDecision[] {
  let out = list.filter((d) => !same(d.name, name));
  if (value !== "add") out = out.filter((d) => !(d.action === "same" && d.slug?.startsWith("new:") && same(d.slug.slice(4), name)));
  if (value === "add") out.push({ name, action: "new" });
  else if (value.startsWith("same:")) {
    const slug = value.slice(5);
    out.push({ name, action: "same", slug });
    const target = slug.startsWith("new:") ? names.find((n) => same(n, slug.slice(4))) : undefined;
    if (target && !decisionOf(out, target)) out.push({ name: target, action: "new" });
  }
  return out;
}

/** The New category block's starting values: the suggested business when it is visible, else New business… with its name. */
export function categoryDefaults(cat: NonNullable<FilePreview["newCategory"]>, businesses: BusinessOption[]): { business: BusinessPick; ownBrands: string[] } {
  const suggested = cat.suggestion.business;
  const visible = suggested ? businesses.find((b) => same(b.name, suggested)) : undefined;
  const business = visible ? { value: visible.slug, newName: "" } : suggested ? { value: NEW_BUSINESS, newName: suggested } : { value: "", newName: "" };
  return { business, ownBrands: cat.brands.filter((r) => cat.suggestion.ownBrands.some((o) => same(o, r))) };
}

/**
 * The business to send for a brand whose row names `name`: this row's decision about that name, a visible business
 * of that name, else "new:<name>" (the server matches it to a business on the list by any of its names). Null while
 * the name is a new business still undecided.
 */
function brandBusiness(name: string, draft: RowDraft, businesses: BusinessOption[]): string | null {
  const d = decisionOf(draft.businesses, name);
  if (d) return d.action === "new" ? `new:${tidy(d.name)}` : (d.slug ?? null);
  if (draft.bizNames.some((n) => same(n, name))) return null;
  const visible = businesses.find((b) => same(b.name, name));
  return visible ? visible.slug : `new:${tidy(name)}`;
}

const fits = (s: string | null | undefined, max = MAX_NAME): s is string => !!s && s.length <= max;

/** The row's decisions as the server's DecisionsSchema takes them, or null when there is nothing to send. */
export function toDecisions(draft: RowDraft, businesses: BusinessOption[]): Decisions | null {
  const out: Decisions = { businesses: [], brands: [] };
  const business = pickValue(draft.business);
  if (fits(business)) out.business = business;

  out.businesses = draft.businesses
    .filter((d) => fits(d.name) && (d.slug == null || fits(d.slug, MAX_SAME_SLUG)))
    .slice(0, MAX_BUSINESS_ENTRIES);

  if (draft.atl) {
    const biz = pickValue(draft.atl.business);
    const own = draft.atl.ownBrands.filter((b) => fits(b)).slice(0, MAX_OWN_BRANDS);
    if (fits(biz) && own.length) out.atl = { business: biz, ownBrands: own };
  }

  for (const b of draft.brands) {
    if (!b.ticked || out.brands.length >= MAX_BRAND_ENTRIES) continue;
    const fullName = tidy(b.fullName);
    const biz = b.business !== null ? brandBusiness(b.business, draft, businesses)
      : b.pick.startsWith("new:") ? brandBusiness(b.pick.slice(4), draft, businesses) : b.pick || null;
    if (fits(b.name) && fits(fullName) && fits(biz)) out.brands.push({ name: b.name, fullName, business: biz });
  }

  return out.business || out.businesses.length || out.atl || out.brands.length ? out : null;
}

/** The block reason in grey, unless it is already shown in the red error list. */
export function greyReason(p: FilePreview): string | null {
  return p.blockReason && !p.errors.includes(p.blockReason) ? p.blockReason : null;
}

/** Publish only when every chosen file has a preview and every one is ready. */
export function canPublishAll(previews: FilePreview[] | null, fileCount: number): boolean {
  return previews !== null && fileCount > 0 && previews.length === fileCount && previews.every((p) => p.canPublish);
}

const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
export const publishButtonLabel = (n: number) => `Publish ${files(n)}`;
export const publishedMessage = (published: { label: string }[]) =>
  `Published ${files(published.length)}: ${published.map((p) => p.label).join("; ")}`;

export const whenDhaka = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" });

const hasContent = (d: Decisions | null | undefined): d is Decisions =>
  !!d && (!!d.business || d.businesses.length > 0 || !!d.atl || d.brands.length > 0);

/**
 * Repeated `files`, plus `type-<i>` only where the admin picked a type and `decisions-<i>` (JSON) only where the
 * row's decisions have content. The server re-checks both.
 */
export function uploadForm(list: File[], types: (FileType | "")[], decisions: (Decisions | null)[]): FormData {
  const fd = new FormData();
  list.forEach((f, i) => {
    fd.append("files", f);
    if (types[i]) fd.set(`type-${i}`, types[i]);
    const d = decisions[i];
    if (hasContent(d)) fd.set(`decisions-${i}`, JSON.stringify(d));
  });
  return fd;
}

const FAILED = "Something went wrong. Please try again.";
const NOT_SENT = "The files could not be sent. Check the connection and try again.";

/** POSTs to an upload route. A refusal's `error` is returned as is; anything else becomes a plain message. */
export async function postUploads<T extends object>(url: string, body: FormData): Promise<Partial<T> & { error: string | null }> {
  type Reply = Partial<T> & { error: string | null };
  const fail = (error: string) => ({ error }) as Reply;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body });
  } catch {
    return fail(NOT_SENT);
  }
  const json = (await res.json().catch(() => null)) as (Partial<T> & { error?: unknown }) | null;
  if (!json || typeof json !== "object") return fail(FAILED);
  if (!res.ok) return fail(typeof json.error === "string" && json.error ? json.error : FAILED);
  return { ...json, error: typeof json.error === "string" ? json.error : null };
}
