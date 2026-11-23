"use client";

import Link from "next/link";
import { Suspense, useId, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChartColumn, ChevronDown, FileUp, House, RadioTower, ReceiptText, Settings, Wallet, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRD_SECTIONS, activeHref, type PrdPage, type PrdSection } from "./nav-items";

const ICONS: Record<string, LucideIcon> = {
  "1": House,
  "2": ChartColumn,
  "3": Wallet,
  "4": RadioTower,
  "5": ReceiptText,
  "6": FileUp,
  "7": Settings,
};

// Whole 40px row is the target (Fitts's law).
const ROW = "relative flex min-h-10 shrink-0 items-center rounded-md px-3 py-2 text-sm leading-5 transition-colors hover:bg-sidebar-accent hover:text-white";
const ACTIVE = "bg-sidebar-accent font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary";

const sectionOf = (href: string | null) => (href ? PRD_SECTIONS.find((s) => s.pages.some((p) => p.href === href))?.code : undefined);

function SectionIcon({ code, active }: { code: string; active: boolean }) {
  const Icon = ICONS[code];
  return Icon ? <Icon className={cn("size-[18px] shrink-0", active ? "text-white" : "text-sidebar-foreground/60")} aria-hidden /> : null;
}

/** "2  Campaign Performance": the code in a narrow muted column, then the label. `hideCode` keeps it out of a link's name. */
function CodeLabel({ code, label, codeWidth, hideCode }: { code: string; label: string; codeWidth: string; hideCode: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 gap-1.5">
      <span aria-hidden={hideCode || undefined} className={cn(codeWidth, "shrink-0 text-xs leading-5 tabular-nums opacity-60")}>{code}</span>
      <span className="min-w-0">{label}</span>
    </span>
  );
}

/** A one-page section (Home): a plain row with the section icon. The name is the label only. */
function TopLink({ section, page, active }: { section: PrdSection; page: PrdPage; active: boolean }) {
  return (
    <Link href={page.href} aria-current={active ? "page" : undefined} className={cn(ROW, "gap-2.5", active && ACTIVE)}>
      <SectionIcon code={section.code} active={active} />
      <CodeLabel code={page.code} label={page.label} codeWidth="w-2.5" hideCode />
    </Link>
  );
}

/** A page under its group, indented past the group icon. The code is hidden from the accessible name. */
function PageLink({ page, active }: { page: PrdPage; active: boolean }) {
  return (
    <Link href={page.href} aria-current={active ? "page" : undefined} className={cn(ROW, "pl-10", active && ACTIVE)}>
      <CodeLabel code={page.code} label={page.label} codeWidth="w-6" hideCode />
    </Link>
  );
}

/**
 * The PRD sections. A group starts open when it holds the active page; the person opens and
 * closes groups freely. When the active page moves into a closed group, that group opens.
 */
function NavList({ active }: { active: string | null }) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(sectionOf(active) ? [sectionOf(active)!] : []));
  const [seenActive, setSeenActive] = useState(active);
  if (active !== seenActive) {
    // Adjust state during render (no effect): open the group the active page moved into.
    setSeenActive(active);
    const s = sectionOf(active);
    if (s && !open.has(s)) setOpen(new Set(open).add(s));
  }

  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <ul className="flex flex-col gap-0.5">
      {PRD_SECTIONS.map((section) => {
        if (section.pages.length === 1) {
          const page = section.pages[0];
          return (
            <li key={section.code}>
              <TopLink section={section} page={page} active={active === page.href} />
            </li>
          );
        }
        const isOpen = open.has(section.code);
        const holdsActive = section.pages.some((p) => p.href === active);
        const listId = `${baseId}-section-${section.code}`;
        return (
          <li key={section.code}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={listId}
              onClick={() => toggle(section.code)}
              className={cn(ROW, "w-full gap-2.5 pr-2 text-left", holdsActive && "text-white")}
            >
              <SectionIcon code={section.code} active={holdsActive} />
              <CodeLabel code={section.code} label={section.label} codeWidth="w-2.5" hideCode={false} />
              <ChevronDown
                className={cn("size-3.5 shrink-0 text-sidebar-foreground/50 transition-transform", !isOpen && "-rotate-90")}
                aria-hidden
              />
            </button>
            <ul id={listId} hidden={!isOpen} className="flex flex-col gap-0.5 pt-0.5">
              {section.pages.map((page) => (
                <li key={page.href}>
                  <PageLink page={page} active={active === page.href} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** The only part that reads the path and the tab, so the layout around it still prerenders. */
function CurrentNavList() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  return <NavList active={activeHref(pathname, tab)} />;
}

/** Wix-style dark navigation: brand, the admin's quick actions, the PRD sections, a footer. */
export function Sidebar({ quickActionsSlot, footerSlot }: { quickActionsSlot?: ReactNode; footerSlot?: ReactNode }) {
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

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-1.5 pb-3">
        <Suspense fallback={<NavList active={null} />}>
          <CurrentNavList />
        </Suspense>
      </nav>

      {footerSlot && <div className="mt-auto">{footerSlot}</div>}
    </div>
  );
}
