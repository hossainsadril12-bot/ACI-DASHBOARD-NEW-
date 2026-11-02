import type { Db } from "@/db/types";
import type { ParsedRow, RowError } from "@/lib/upload/parse";
import type { UploadKind } from "@/lib/upload/templates";
import type { Lookups } from "../lookups";

export type Missing = { vendors: string[]; tvStations: string[] };
export type Item = { key: string };

/**
 * Which brands an upload may replace: a sample file replaces only sample brands (`only`),
 * a real file replaces everything except sample brands (`only: false`).
 */
export type BrandScope = { ids: number[]; only: boolean };

export type Applier<T extends Item = Item> = {
  kind: UploadKind;
  /** Map parsed rows to DB-ready items. Unknown vendors / TV stations go to `missing` (created on confirm). */
  resolve(rows: ParsedRow[], lk: Lookups): { items: T[]; errors: RowError[]; missing: Missing };
  createMissing(db: Db, missing: Missing): Promise<void>;
  /** Keys of rows currently stored for these periods, with their source. */
  existingKeys(db: Db, periods: string[]): Promise<{ key: string; source: "upload" | "manual" }[]>;
  /** Delete upload-sourced rows for these periods within the brand scope, insert items, return inserted count. */
  replace(db: Db, periods: string[], items: T[], uploadId: number, scope: BrandScope): Promise<number>;
};

export function addMissing(list: string[], name: string | null | undefined) {
  if (name && !list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
}
