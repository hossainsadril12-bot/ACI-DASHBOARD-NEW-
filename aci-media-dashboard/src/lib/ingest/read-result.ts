import type { BusinessSource } from "./brands";
import type { FileType } from "./file-types";
import type { Workbook } from "./workbook";

/** The numbers cannot be trusted: blocks this file's publish. The message is shown to the admin as is. */
export class ReadError extends Error {
  constructor(message: string) { super(message); this.name = "ReadError"; }
}

/** A Digital file whose business can't be worked out: the admin must pick it. */
export class NeedsBusinessError extends Error {
  constructor(message: string) { super(message); this.name = "NeedsBusinessError"; }
}

/** An ATL file whose category the caller didn't give: the admin must pick or add it. `title` is the file's "Brand Name:" title. */
export class NeedsCategoryError extends Error {
  constructor(public title: string) { super("New ATL category."); this.name = "NeedsCategoryError"; }
}

export type ReadResult<T> = {
  type: FileType;
  datasetKey: string;   // e.g. "atl:soap", "calendar"
  label: string;        // e.g. "ATL, Savlon Soap, Jul'25 to Oct'26"
  summary: string;      // one line, like his app's summary
  months: string[];     // "YYYY-MM", sorted
  rowCount: number;
  data: T;              // stored as the version's data; same shape as his built-in data
  warnings: string[];   // never block
  business?: { name: string; source: BusinessSource };
};

export type ReaderContext = {
  fileName: string;
  /** Digital: required, else NeedsBusinessError. */
  business?: { slug: string; name: string } | null;
  /** ATL: required, else NeedsCategoryError. `ownBrands` are matched to the file's brand rows by normName. */
  atlCategory?: { slug: string; name: string; business: string; ownBrands: string[] } | null;
};
export type Reader = (wb: Workbook, ctx: ReaderContext) => ReadResult<unknown>;
