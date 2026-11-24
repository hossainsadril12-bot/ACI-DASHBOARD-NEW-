import type { CardKey } from "@/lib/ingest/cards";

// The PRD v2.1 sidebar (sections 1 to 7). One registry for the sidebar, the breadcrumb,
// the being-built pages and the tests. 7.1 User Settings is left out: per-person access is off.

export type PrdPage = {
  code: string;
  label: string;
  href: string;
  files: string | null;
  card: CardKey | null;
  businessFilter: boolean;
  built: boolean;
  note?: string;
};
export type PrdSection = { code: string; label: string; pages: PrdPage[] };

const page = (code: string, label: string, href: string, files: string | null, card: CardKey | null, businessFilter: boolean, built = false, note?: string): PrdPage =>
  ({ code, label, href, files, card, businessFilter, built, ...(note ? { note } : {}) });

const CHANNEL = "the Channel Cost file, or Manual Entry";
const BILLING = "the Dashboard Media Final file";

export const PRD_SECTIONS: readonly PrdSection[] = [
  { code: "1", label: "Home", pages: [page("1", "Home", "/", "the CB Media Spent Report, the ATL files and the Digital files", null, true)] },
  { code: "2", label: "Campaign Performance", pages: [
    page("2.1", "ATL Media Performance", "/atl", "the 13 ATL files (2026 Dash Board)", "atl", true),
    page("2.2", "Digital Media Performance", "/digital-performance", "the Digital files", "digital", true),
    page("2.3", "OOH Media Performance", "/ooh", "the Billboard master sheet", null, true),
    page("2.4", "Influencer Campaign Performance", "/influencer", "the Digital files", "digital", true),
  ] },
  { code: "3", label: "Media Spend", pages: [
    page("3.1", "Monthly Activity Calendar", "/calendar", "the All Activity Calendar file", "calendar", true, true),
    page("3.2", "FY Media Spend", "/fy-spend", "the CB Media Spent Report, or Manual Entry", "fy", true, true),
  ] },
  { code: "4", label: "Channel Wise Spend", pages: [
    page("4.1", "Electronic Media", "/channel/electronic", CHANNEL, "channel", false),
    page("4.2", "Digital Media", "/channel/digital", CHANNEL, "channel", false),
    page("4.3", "Press & Radio", "/channel/press-radio", CHANNEL, "channel", false),
  ] },
  { code: "5", label: "Billing & Statement", pages: [
    page("5.1", "Billing Overview", "/billing/overview", BILLING, "billing", true),
    page("5.2", "Vendor Statement", "/billing/vendors", BILLING, "billing", true),
    page("5.3", "Media Billing Data Sheet", "/billing/sheet", BILLING, "billing", true),
    page("5.4", "OOH Media Bill Details", "/billing/ooh", "the Billboard Billing Status file, or Manual Entry", "billboard", true),
  ] },
  { code: "6", label: "Data Entry", pages: [
    page("6.1", "Upload Data", "/data-entry", null, null, false, true),
    page("6.2", "Manual Entry", "/data-entry?tab=manual", null, null, false, true),
    page("6.3", "Upload History", "/data-entry?tab=history", null, null, false, true),
    page("6.4", "Businesses & Brands", "/businesses", null, null, false, true),
  ] },
  { code: "7", label: "Settings", pages: [
    page("7.2", "Data Sources and USD rate", "/settings", null, null, false, true),
    page("7.3", "My Access", "/settings/access", null, null, false, false, "Shows who can see what. Per-person access is switched off for now."),
  ] },
];

export const PRD_PAGES: readonly PrdPage[] = PRD_SECTIONS.flatMap((s) => s.pages);

export function prdPage(href: string): PrdPage | undefined {
  return PRD_PAGES.find((p) => p.href === href);
}

const DATA_ENTRY_TABS = new Set(["manual", "history"]);

export function activeHref(pathname: string, tab: string | null): string | null {
  if (pathname === "/") return "/";
  if (pathname === "/data-entry") return tab && DATA_ENTRY_TABS.has(tab) ? `/data-entry?tab=${tab}` : "/data-entry";
  let best: string | null = null;
  for (const p of PRD_PAGES) {
    if (p.href === "/" || p.href.includes("?")) continue;
    const hit = pathname === p.href || pathname.startsWith(`${p.href}/`);
    if (hit && (!best || p.href.length > best.length)) best = p.href;
  }
  return best;
}

export const OLD_PAGE_TITLES: Readonly<Record<string, string>> = {
  "/old-home": "Old Home",
  "/performance": "Performance",
  "/digital": "Digital Data",
  "/competitors": "Competitor Tracking",
  "/plan": "Plan",
  "/spend": "Spend",
  "/billing": "Billing (old)",
  "/uploads": "Uploads & History",
};
