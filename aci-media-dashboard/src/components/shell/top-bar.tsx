"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";
import { todayDhaka } from "@/lib/month";
import { OLD_PAGE_TITLES, activeHref, prdPage } from "./nav-items";

const noop = () => () => {};

/** A PRD page's label, else the title of an old page still in the app (longest matching path), else nothing. */
function pageTitle(pathname: string, tab: string | null): string | null {
  const prd = prdPage(activeHref(pathname, tab) ?? "")?.label;
  if (prd) return prd;
  const old = Object.keys(OLD_PAGE_TITLES)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  return old ? OLD_PAGE_TITLES[old] : null;
}

/** The only part that reads the path and the tab, so pages with a slug can prerender the rest of the bar. */
function CurrentPageCrumb() {
  const pathname = usePathname();
  const title = pageTitle(pathname, useSearchParams().get("tab"));
  if (!title) return null;
  return (
    <>
      <ChevronRight className="size-4 text-gray-300" aria-hidden />
      <span className="truncate font-medium text-gray-900">{title}</span>
    </>
  );
}

/**
 * White bar above every page: the phone Menu and where you are on the left; date, money rule, the admin's
 * quick actions (phone only) and the Login / Sign out slot on the right, Login last.
 */
export function TopBar({ adminSlot, quickActionsSlot, menuSlot }: { adminSlot?: ReactNode; quickActionsSlot?: ReactNode; menuSlot?: ReactNode }) {
  // The layout is prerendered, so the date is read on the client only (null on the server).
  const today = useSyncExternalStore(noop, todayDhaka, () => null);

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-10">
        <div className="flex min-w-0 items-center gap-2">
          {menuSlot}
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link href="/" className="truncate text-gray-500 hover:text-gray-900">ACI Media</Link>
            <Suspense fallback={null}>
              <CurrentPageCrumb />
            </Suspense>
          </nav>
        </div>
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
