import { FILE_TYPE_LABEL, type FileType } from "./file-types";

// The Upload Data cards (spec 3.2): the one source for the cards, the safety messages and the tests.
// Relative imports only: the Playwright specs import this file too.

export type CardKey = "atl" | "digital" | "fy" | "channel" | "billing" | "calendar" | "billboard";
export type UploadCard = { key: CardKey; type: FileType; title: string; fileText: string; updates: string; multiple: boolean };

/** In the order of his app. The OOH master sheet has no card: it is uploaded on the OOH page (Phase 4). */
export const UPLOAD_CARDS: readonly UploadCard[] = [
  {
    key: "atl", type: "atl", title: "ATL (TV) performance", multiple: true,
    fileText: 'A "2026 Dash Board" file, one per TV category. The category is read from its "Brand Name:" line. You can choose several files at once.',
    updates: "ATL Media Performance, Home",
  },
  {
    key: "digital", type: "digital", title: "Digital performance", multiple: false,
    fileText: "The business's digital data file, with sheets Meta, YouTube and TikTok.",
    updates: "Digital Media Performance, Influencer, Activity Calendar, Home",
  },
  {
    key: "fy", type: "fy", title: "FY media spend", multiple: false,
    fileText: 'The CB Media Spent Report (its "Final Report" sheet).',
    updates: "Home, FY Media Spend, Activity Calendar, OOH",
  },
  {
    key: "channel", type: "channel", title: "Channel cost", multiple: false,
    fileText: "The Channel Cost file, with sheets Electronic, Digital and Press & Radio.",
    updates: "Channel Wise Spend",
  },
  {
    key: "billing", type: "billing", title: "Media billing", multiple: false,
    fileText: 'Dashboard Media Final, sheet "Master".',
    updates: "Billing Overview, Vendor Statement, Billing Data Sheet",
  },
  {
    key: "calendar", type: "calendar", title: "Monthly activity calendar", multiple: false,
    fileText: "The All Activity Calendar file, one sheet per month.",
    updates: "Monthly Activity Calendar",
  },
  {
    key: "billboard", type: "billboard", title: "OOH / billboard bill status", multiple: false,
    fileText: "The Billboard Billing Status file.",
    updates: "OOH Media Bill Details",
  },
];

export const OOH_MASTER_MESSAGE = "This is the OOH master sheet. It is uploaded on the OOH page.";

/** Each type's label with "a" or "an", for the safety messages. */
const A_TYPE: Record<FileType, string> = {
  atl: "an ATL (TV)",
  calendar: "an Activity Calendar",
  fy: "an FY spend",
  channel: "a Channel Cost",
  billing: "a Billing master",
  billboard: "a Billboard billing",
  digital: "a Digital",
  "ooh-sites": "an OOH master sheet",
};

export function cardForType(t: FileType): UploadCard | null {
  return UPLOAD_CARDS.find((c) => c.type === t) ?? null;
}

/** Spec 3.5: detection is sure the file is another type. Names the card to use (any Digital card for a Digital file). */
export function wrongCardMessage(card: UploadCard, detected: FileType): string {
  if (detected === "ooh-sites") return OOH_MASTER_MESSAGE;
  const right = cardForType(detected);
  const use = detected === "digital" || !right ? "a Digital card" : `the ${right.title} card`;
  return `This looks like ${A_TYPE[detected]} file, not ${FILE_TYPE_LABEL[card.type]}. Close this and use ${use}.`;
}

/** Spec 3.5: detection says the file is none of his files. */
export function notThisFileMessage(card: UploadCard): string {
  return `This is not ${A_TYPE[card.type]} file. Expected: ${card.fileText}`;
}
