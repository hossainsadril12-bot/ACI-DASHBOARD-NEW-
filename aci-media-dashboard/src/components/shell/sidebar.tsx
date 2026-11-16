"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarRange, ChartColumn, History, House, MonitorSmartphone, ReceiptText, Settings, Target, Wallet, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_ITEMS } from "./nav-items";

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/plan": CalendarRange,
  "/spend": Wallet,
  "/billing": ReceiptText,
  "/performance": ChartColumn,
  "/digital": MonitorSmartphone,
  "/competitors": Target,
  "/uploads": History,
  "/settings": Settings,
};

/** Wix-style dark navigation: brand, the admin's quick actions (desktop), short grouped lists. */
export function Sidebar({ quickActionsSlot }: { quickActionsSlot?: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4" aria-label="ACI Media home">
        <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">A</span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-white">ACI Media</span>
          <span className="block text-xs text-sidebar-foreground/70">Consumer Brands</span>
        </span>
      </Link>

      {quickActionsSlot}

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:pb-0">
        {NAV_GROUPS.map((group) => (
          <div key={group || "top"} className="flex gap-1 md:mb-3 md:flex-col md:gap-0.5 md:border-t md:border-sidebar-border md:pt-3 md:first:border-t-0 md:first:pt-0">
            {group && <p className="hidden px-3 pb-1 text-[11px] font-medium tracking-wider text-sidebar-foreground/50 uppercase md:block">{group}</p>}
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const Icon = ICONS[item.href];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // Whole 40px row is the target (Fitts's law).
                    "relative flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap transition-colors hover:bg-sidebar-accent hover:text-white",
                    active && "bg-sidebar-accent font-medium text-white md:before:absolute md:before:inset-y-2 md:before:left-0 md:before:w-[3px] md:before:rounded-full md:before:bg-sidebar-primary",
                  )}
                >
                  {Icon && <Icon className={cn("size-[18px] shrink-0", active ? "text-white" : "text-sidebar-foreground/60")} aria-hidden />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
