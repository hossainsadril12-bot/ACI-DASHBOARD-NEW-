// Grouped so the sidebar shows a few short lists instead of one long one (Hick's law).
export const NAV_GROUPS = ["", "Results", "Plan and money", "Data"] as const;

export const NAV_ITEMS: { href: string; label: string; group: (typeof NAV_GROUPS)[number] }[] = [
  { href: "/", label: "Home", group: "" },
  { href: "/performance", label: "Performance", group: "Results" },
  { href: "/digital", label: "Digital Data", group: "Results" },
  { href: "/competitors", label: "Competitor Tracking", group: "Results" },
  { href: "/plan", label: "Plan", group: "Plan and money" },
  { href: "/spend", label: "Spend", group: "Plan and money" },
  { href: "/billing", label: "Billing", group: "Plan and money" },
  { href: "/data-entry", label: "Data Entry", group: "Data" },
  { href: "/businesses", label: "Businesses & Brands", group: "Data" },
  { href: "/settings", label: "Settings", group: "Data" },
];
