import type { FileType } from "../file-types";
import type { Reader } from "../read-result";
import { readAtl } from "./atl";
import { readBilling } from "./billing";
import { readCalendar } from "./calendar";
import { readChannel } from "./channel";
import { readDigital } from "./digital";
import { readFy } from "./fy";

/** Readers that exist so far. A detected type without a reader can't be published yet (Part B adds the rest). */
export const READERS: Partial<Record<FileType, Reader>> = { atl: readAtl, billing: readBilling, calendar: readCalendar, channel: readChannel, digital: readDigital, fy: readFy };
