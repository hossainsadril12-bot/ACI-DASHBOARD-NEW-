import type { Metadata } from "next";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { buttonVariants } from "@/components/ui/button";
import { addMonths, formatMonth, isMonth, monthBounds, todayDhaka } from "@/lib/month";
import { listBrandsWithRivals } from "@/server/master-data";
import { listCampaigns, listChannels, planVsBudget } from "@/server/plan";
import { PlanBoard, type PlanView } from "./plan-board";
import { BudgetPanel } from "./budget-panel";
import { UploadPanel } from "@/components/data/upload-panel";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";

export const metadata: Metadata = { title: "Plan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const VIEWS: { key: PlanView; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "List" },
];

export default function PlanPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Plan" subtitle="Campaigns by date, with budget against plan and actual spend" />
      <Suspense fallback={<PageSkeleton label="Loading plan" />}>
        <PlanContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PlanContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const view: PlanView = VIEWS.some((v) => v.key === sp.view) ? (sp.view as PlanView) : "timeline";
  const brandId = typeof sp.brand === "string" && /^\d+$/.test(sp.brand) ? Number(sp.brand) : undefined;

  const db = getDb();
  const { start, end } = monthBounds(month);
  const [allBrands, channels, campaigns, budgetRows] = await Promise.all([
    listBrandsWithRivals(db),
    listChannels(db),
    listCampaigns(db, { from: start, to: end, brandId }),
    planVsBudget(db, month, brandId),
  ]);
  const activeBrands = allBrands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  const shownBrands = brandId ? activeBrands.filter((b) => b.id === brandId) : activeBrands;

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ month, view, ...(brandId ? { brand: String(brandId) } : {}), ...patch });
    return `/plan?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href({ month: addMonths(month, -1) })} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Previous month"><ChevronLeft aria-hidden /></Link>
          <h2 className="min-w-36 text-center text-lg font-semibold">{formatMonth(month)}</h2>
          <Link href={href({ month: addMonths(month, 1) })} className={buttonVariants({ variant: "secondary", size: "icon" })} aria-label="Next month"><ChevronRight aria-hidden /></Link>
        </div>
        <SegmentedLinks label="Plan views" value={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: href({ view: v.key }) }))} />
        <FilterBar month={month} brands={activeBrands} brandId={brandId} keep={{ view }} />
      </div>

      <PlanBoard
        autoOpen={sp.new === "campaign"}
        view={view}
        month={month}
        today={today}
        brands={shownBrands}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        campaigns={campaigns}
        brandId={brandId}
      />

      {shownBrands.length > 0 && <BudgetPanel month={month} rows={budgetRows} />}

      <UploadPanel kind="plan" viewMonth={month} />
    </div>
  );
}
