export const FILE_TYPES = ["atl", "calendar", "fy", "channel", "billing", "billboard", "digital", "ooh-sites"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const FILE_TYPE_LABEL: Record<FileType, string> = {
  atl: "ATL (TV)",
  calendar: "Activity Calendar",
  fy: "FY spend",
  channel: "Channel Cost",
  billing: "Billing master",
  billboard: "Billboard billing",
  digital: "Digital",
  "ooh-sites": "OOH master sheet",
};

export const isFileType = (v: unknown): v is FileType => typeof v === "string" && (FILE_TYPES as readonly string[]).includes(v);
