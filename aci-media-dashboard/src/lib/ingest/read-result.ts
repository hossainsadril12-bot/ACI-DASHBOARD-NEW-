import type { FileType } from "./file-types";
import type { Workbook } from "./workbook";

/** The numbers cannot be trusted: blocks this file's publish. The message is shown to the admin as is. */
export class ReadError extends Error {
  constructor(message: string) { super(message); this.name = "ReadError"; }
}

export type ReadResult<T> = {
  type: FileType;
  datasetKey: string;   // e.g. "atl:soap", "calendar"
  label: string;        // e.g. "ATL, Savlon Soap, Jul'26 to Oct'26"
  summary: string;      // one line, like his app's summary
  months: string[];     // "YYYY-MM", sorted
  rowCount: number;
  data: T;              // stored as the version's data; same shape as his built-in data
  warnings: string[];   // never block
};

export type Reader = (wb: Workbook) => ReadResult<unknown>;
