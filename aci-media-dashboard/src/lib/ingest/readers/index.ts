import type { FileType } from "../file-types";
import type { Reader } from "../read-result";
import { readAtl } from "./atl";
import { readBillboard } from "./billboard";
import { readBilling } from "./billing";
import { readCalendar } from "./calendar";
import { readChannel } from "./channel";
import { readDigital } from "./digital";
import { readFy } from "./fy";
import { readOohSites } from "./ooh-sites";

/** Readers that exist so far. A detected type without a reader can't be published yet (Part B adds the rest). */
export const READERS: Partial<Record<FileType, Reader>> = { atl: readAtl, billboard: readBillboard, billing: readBilling, calendar: readCalendar, channel: readChannel, digital: readDigital, fy: readFy, "ooh-sites": readOohSites };

/** Readers that need fill colours, so their file is opened with styles. */
export const READER_NEEDS_STYLES: ReadonlySet<FileType> = new Set<FileType>(["billboard"]);
