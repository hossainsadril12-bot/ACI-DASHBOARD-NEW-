// Sample data lives beside real data without mixing: every sample brand name ends with this tag.
export const SAMPLE_TAG = "(Sample)";
/** SQL ILIKE pattern for names carrying the tag, in any letter case. */
export const SAMPLE_NAME_PATTERN = `%${SAMPLE_TAG}`;

export const isSampleName = (name: string) => name.trim().toLowerCase().endsWith(SAMPLE_TAG.toLowerCase());

const brandOf = (r: Record<string, unknown>) => (typeof r.brand === "string" ? r.brand : "");

/** An upload belongs to the sample set when every row names a sample brand. */
export function isSampleUpload(rows: Record<string, unknown>[]): boolean {
  return rows.length > 0 && rows.every((r) => isSampleName(brandOf(r)));
}

/** True when a file names both sample and real (or no) brands, which the app refuses. */
export function mixesSampleAndReal(rows: Record<string, unknown>[]): boolean {
  const sample = rows.filter((r) => isSampleName(brandOf(r))).length;
  return sample > 0 && sample < rows.length;
}
