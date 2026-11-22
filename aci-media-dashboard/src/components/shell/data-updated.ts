import { FILE_TYPES, type FileType } from "@/lib/ingest/file-types";
import type { ActiveVersion } from "@/store/datasets";

const SHORT: Record<FileType, string> = {
  atl: "ATL", calendar: "activity calendar", fy: "FY spend", channel: "channel cost",
  billing: "billing", billboard: "OOH bills", digital: "digital", "ooh-sites": "OOH sites",
};

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });

/** "Data updated: ATL 21 Oct 2026 · FY spend 27 Oct 2026", latest publish per file kind; null when nothing is published. */
export function dataUpdatedLine(active: ActiveVersion[]): string | null {
  const latest = new Map<FileType, Date>();
  for (const a of active) {
    if (!(FILE_TYPES as readonly string[]).includes(a.kind)) continue;
    const k = a.kind as FileType;
    const prev = latest.get(k);
    if (!prev || a.createdAt > prev) latest.set(k, a.createdAt);
  }
  const parts = FILE_TYPES.filter((k) => latest.has(k)).map((k) => `${SHORT[k]} ${day(latest.get(k)!)}`);
  return parts.length ? `Data updated: ${parts.join(" · ")}` : null;
}
