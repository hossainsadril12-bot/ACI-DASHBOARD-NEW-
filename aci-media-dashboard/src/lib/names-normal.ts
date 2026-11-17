/** The one name normaliser: trim, collapse whitespace, lower-case. Pure, so client code can use it. */
export function normName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
