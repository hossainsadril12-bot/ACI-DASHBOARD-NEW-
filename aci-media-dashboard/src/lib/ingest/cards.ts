import { FILE_TYPE_LABEL, type FileType } from "./file-types";

// The Upload Data cards (spec 3.2): the one source for the cards, the safety messages and the tests.
// Relative imports only: the Playwright specs import this file too.

export type CardKey = "atl" | "digital" | "fy" | "channel" | "billing" | "calendar" | "billboard";
export type UploadCard = { key: CardKey; type: FileType; title: string; fileText: string; updates: string; multiple: boolean };

/**
 * In the order of his app. The OOH master sheet has no card: it is uploaded on the OOH page (Phase 4).
 * Short copy, like the import cards in HubSpot and Wix: fileText names the file in a few words, and the card reads
 * updates as "Updates <updates>.".
 */
export const UPLOAD_CARDS: readonly UploadCard[] = [
  {
    key: "atl", type: "atl", title: "ATL (TV) performance", multiple: true,
    fileText: "2026 Dash Board files, one per TV category.",
    updates: "ATL and Home",
  },
  {
    key: "digital", type: "digital", title: "Digital performance", multiple: false,
    fileText: "Digital file with Meta, YouTube and TikTok sheets.",
    updates: "Digital, Influencer, Activity Calendar and Home",
  },
  {
    key: "fy", type: "fy", title: "FY media spend", multiple: false,
    fileText: "CB Media Spent Report.",
    updates: "Home, FY Spend, Activity Calendar and OOH",
  },
  {
    key: "channel", type: "channel", title: "Channel cost", multiple: false,
    fileText: "Channel Cost file.",
    updates: "Channel Spend",
  },
  {
    key: "billing", type: "billing", title: "Media billing", multiple: false,
    fileText: "Dashboard Media Final file.",
    updates: "Billing and Vendor Statement",
  },
  {
    key: "calendar", type: "calendar", title: "Monthly activity calendar", multiple: false,
    fileText: "All Activity Calendar file.",
    updates: "Activity Calendar",
  },
  {
    key: "billboard", type: "billboard", title: "OOH / billboard bill status", multiple: false,
    fileText: "Billboard Billing Status file.",
    updates: "OOH Bills",
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

/** The Digital card of a business with Digital data (spec 3.3). */
export const digitalCardTitle = (business: string) => `Digital · ${business}`;
/** The Digital card for a business with no Digital data, once another business has its own card. */
export const ANOTHER_BUSINESS = "Digital · another business";

/**
 * Spec 3.5: a Digital file whose brands belong to another business than the one picked. Names the card the page
 * shows for that business: its own, else the card for another business, else the one Digital card.
 */
export function wrongBusinessMessage(owner: string, picked: string, cards: { ownerHasCard: boolean; anyHasCard: boolean }): string {
  const use = cards.ownerHasCard
    ? `Use the ${digitalCardTitle(owner)} card.`
    : `Use the ${cards.anyHasCard ? ANOTHER_BUSINESS : cardForType("digital")!.title} card and pick ${owner}.`;
  return `This file's brands belong to ${owner}, not ${picked}. ${use}`;
}

/** The slugs of the visible businesses with an active digital:<slug> key: the ones with their own Digital card (spec 3.3). */
export function digitalCardSlugs(activeKeys: string[], businesses: { slug: string; hidden?: boolean }[]): Set<string> {
  const visible = new Set(businesses.filter((b) => !b.hidden).map((b) => b.slug));
  const out = new Set<string>();
  for (const k of activeKeys) {
    if (!k.startsWith("digital:")) continue;
    const slug = k.slice("digital:".length);
    if (visible.has(slug)) out.add(slug);
  }
  return out;
}

/** Spec 3.5: detection says the file is none of his files. */
export function notThisFileMessage(card: UploadCard): string {
  return `This is not ${A_TYPE[card.type]} file. Expected: ${card.fileText}`;
}
