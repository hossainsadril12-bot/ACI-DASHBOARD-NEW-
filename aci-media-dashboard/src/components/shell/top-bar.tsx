"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";
import { todayDhaka } from "@/lib/month";
import { NAV_ITEMS } from "./nav-items";

const noop = () => () => {};

/** Pages with no menu entry that still have a title. */
const EXTRA_TITLES: Record<string, string> = { "/uploads": "Uploads & History" };

/** The only part that reads the path, so pages with a slug can prerender the rest of the bar. */
function CurrentPageCrumb() {
  const pathname = usePathname();
  const page = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  const extra = Object.entries(EXTRA_TITLES).find(([href]) => pathname.startsWith(href))?.[1];
  const title = page ? (page.href === "/" ? null : page.label) : (extra ?? null);
  if (!title) return null;
  return (
    <>
      <ChevronRight className="size-4 text-gray-300" aria-hidden />
      <span className="truncate font-medium text-gray-900">{title}</span>
    </>
  );
}

/**
 * White bar above every page: where you are on the left; date, money rule, the admin's
 * quick actions (phone only) and the Login / Sign out slot on the right, Login last.
 */
export function TopBar({ adminSlot, quickActionsSlot }: { adminSlot?: ReactNode; quickActionsSlot?: ReactNode }) {
  // The layout is prerendered, so the date is read on the client only (null on the server).
  const today = useSyncExternalStore(noop, todayDhaka, () => null);

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-10">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link href="/" className="truncate text-gray-500 hover:text-gray-900">ACI Media</Link>
          <Suspense fallback={null}>
            <CurrentPageCrumb />
          </Suspense>
        </nav>
        <div data-testid="topbar-actions" className="flex shrink-0 items-center gap-2">
          {/* Date and money pills hide below md so the Login / Sign out buttons fit on phones and small tablets. */}
          {today && (
            <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 md:flex">
              <CalendarDays className="size-3.5" aria-hidden />
              {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
            </span>
          )}
          <span className="hidden rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground md:inline">BDT · with VAT</span>
          {quickActionsSlot}
          {adminSlot}
        </div>
      </div>
    </div>
  );
}
