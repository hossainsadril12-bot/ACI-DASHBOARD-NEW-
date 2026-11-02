// Sample data lives beside real data without mixing: every sample brand name ends with this tag.
export const SAMPLE_TAG = "(Sample)";

export const isSampleName = (name: string) => name.trim().endsWith(SAMPLE_TAG);

/** An upload belongs to the sample set when every row names a sample brand. */
export function isSampleUpload(rows: Record<string, unknown>[]): boolean {
  return rows.length > 0 && rows.every((r) => typeof r.brand === "string" && isSampleName(r.brand));
}
