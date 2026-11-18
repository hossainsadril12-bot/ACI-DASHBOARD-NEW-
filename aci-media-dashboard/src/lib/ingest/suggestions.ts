import { BRANDLIST, businessOfBrand, fullB } from "./brands";
import { normName } from "@/lib/names-normal";
import { ATL_CATEGORIES } from "./readers/atl";

/** One-click suggestions from his old built-in lists. They only pre-fill a field; they never decide. */

const OFFICIAL = new Set(Object.values(BRANDLIST).flat());

/** His official name for a brand: when fullB changes the name, or the name already is an official one. */
export function suggestFullName(brand: string): string | null {
  const tidy = brand.replace(/\s+/g, " ").trim();
  if (!tidy) return null;
  const full = fullB(tidy);
  return full !== tidy || OFFICIAL.has(full) ? full : null;
}

/** His BRANDLIST business for a brand, or null when unknown. */
export function suggestBusinessForBrand(brand: string): string | null {
  return businessOfBrand(brand);
}

/** The 4 demo businesses (his BRANDLIST), by normalised name, plus the names his files use for them. */
const DEMO_BUSINESS = new Map<string, string>([
  ...Object.keys(BRANDLIST).map((b) => [normName(b), b] as const),
  ["aci salt", "Salt"], ["foods", "Food & Beverage"], ["food", "Food & Beverage"], ["beverage", "Food & Beverage"],
]);

/** One of the 4 demo businesses for a business name in a file, or null. */
export function suggestBusiness(name: string): string | null {
  return DEMO_BUSINESS.get(normName(name)) ?? null;
}

/**
 * His ATL category for a file's title, matched the way his reader matches it. His own brands come from suggestOwnBrands.
 * "Others" is never suggested as a business (the admin decides): those categories give business null.
 */
export function suggestAtlCategory(title: string): { name: string; business: string | null } | null {
  const c = matchAtlCategory(title);
  if (!c) return null;
  return { name: c[1], business: normName(c[2]) === "others" ? null : c[2] };
}

/** His whole ATLCATS row for a title (his key and his business, "Others" included), matched the way his reader matched it. */
function matchAtlCategory(title: string): (typeof ATL_CATEGORIES)[number] | null {
  if (!title.trim()) return null;
  return ATL_CATEGORIES.find((c) => c[3].test(title) && !(c[0] === "antiseptic" && /septex/i.test(title))) ?? null;
}

/** His own-brand rule for the title's category, applied to the file's brand rows, in row order. Empty for an unknown title. */
export function suggestOwnBrands(title: string, brands: string[]): string[] {
  const c = matchAtlCategory(title);
  return c ? brands.filter((b) => c[4].test(b)) : [];
}
