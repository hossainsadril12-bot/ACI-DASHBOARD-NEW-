"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";
import { todayDhaka } from "@/lib/month";
import { NAV_ITEMS } from "./nav-items";
import { QuickActions } from "./quick-actions";

const noop = () => () => {};

/** White bar above every page: where you are on the left, today's date and the money rule on the right. */
export function TopBar({ adminSlot }: { adminSlot?: ReactNode }) {
  const pathname = usePathname();
  const page = NAV_ITEMS.find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  // The layout is prerendered, so the date is read on the client only (null on the server).
  const today = useSyncExternalStore(noop, todayDhaka, () => null);

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-10">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-900">ACI Media</Link>
          {page && page.href !== "/" && (
            <>
              <ChevronRight className="size-4 text-gray-300" aria-hidden />
              <span className="truncate font-medium text-gray-900">{page.label}</span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {adminSlot}
          {today && (
            <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 sm:flex">
              <CalendarDays className="size-3.5" aria-hidden />
              {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
            </span>
          )}
          <span className="hidden rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground sm:inline">BDT · with VAT</span>
          <div className="w-44 md:hidden"><QuickActions /></div>
        </div>
      </div>
    </div>
  );
}
