import { BRANDLIST, businessOfBrand, fullB } from "./brands";
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

/** His ATL category for a file's title, matched the way his reader matches it. The own brand is picked from the file's rows by the caller. */
export function suggestAtlCategory(title: string): { name: string; business: string; ownBrand: string | null } | null {
  if (!title.trim()) return null;
  const c = ATL_CATEGORIES.find((c) => c[3].test(title) && !(c[0] === "antiseptic" && /septex/i.test(title)));
  return c ? { name: c[1], business: c[2], ownBrand: null } : null;
}
