import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { BarList } from "@/components/data/bar-list";
import { SourceTag } from "@/components/data/source-tag";
import { UploadPanel } from "@/components/data/upload-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANNEL_COLORS } from "@/lib/channel-colors";
import { formatCount, formatMillion, formatRate, formatTaka } from "@/lib/money";
import { formatMonth, isMonth, todayDhaka } from "@/lib/month";
import { cn } from "@/lib/utils";
import { digitalSpendByBusiness, digitalSummary, listDigital, listDigitalPlatforms, type PlatformSummary } from "@/server/digital";
import { listBrandsWithRivals } from "@/server/master-data";
import { activeBrandId } from "@/server/filters";
import { RememberView } from "@/components/data/remember-view";
import { DigitalEntries } from "./digital-entries";
import { PageSkeleton } from "@/components/data/page-skeleton";

export const metadata: Metadata = { title: "Digital Data" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function DigitalPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Digital Data" subtitle="ACI's own Meta, YouTube and TikTok results" />
      <Suspense fallback={<PageSkeleton label="Loading digital data" />}>
        <DigitalContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function DigitalContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : todayDhaka().slice(0, 7);
  const askedBrand = typeof sp.brand === "string" && /^\d+$/.test(sp.brand) ? Number(sp.brand) : undefined;

  const db = getDb();
  const brandId = await activeBrandId(db, askedBrand);
  const [allBrands, platforms, summary, entries, byBusiness] = await Promise.all([
    listBrandsWithRivals(db), listDigitalPlatforms(db), digitalSummary(db, { month, brandId }),
    listDigital(db, { month, brandId }), digitalSpendByBusiness(db, { month, brandId }),
  ]);
  const brands = allBrands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  const latest = entries.reduce<string | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);
  const sources = new Set(entries.map((e) => e.source));
  const source = sources.size === 0 ? null : sources.size > 1 ? "mixed" : [...sources][0];
  const cheapestView = summary.filter((p) => p.costPerView !== null).sort((a, b) => a.costPerView! - b.costPerView!)[0];

  return (
    <div className="space-y-6">
      <FilterBar month={month} brands={brands} brandId={brandId} />
      <RememberView month={month} brandId={brandId} />

      <div className="grid gap-4 md:grid-cols-3">
        {summary.map((p) => <PlatformTile key={p.code} p={p} />)}
      </div>
      <SourceTag source={source as "upload" | "manual" | "mixed" | null} updatedAt={latest} label="All figures" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Reach by platform</CardTitle></CardHeader>
          <CardContent>
            <BarList testId="reach-by-platform" empty="No platforms."
              rows={summary.map((p) => ({ key: p.code, label: p.name, value: p.hasData && p.reach > 0 ? p.reach : null, display: formatCount(p.reach) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cost per view by platform</CardTitle>
            <p className="text-xs text-gray-500">BDT per ThruPlay. Shorter bar is better.</p>
          </CardHeader>
          <CardContent>
            <BarList testId="cost-per-view" empty="No platforms." color="bg-amber-500"
              rows={summary.map((p) => ({
                key: p.code, label: p.name, value: p.costPerView, display: p.costPerView === null ? "" : `${formatRate(p.costPerView)} BDT`,
                note: cheapestView?.code === p.code ? "Best value" : undefined, highlight: cheapestView?.code === p.code,
              }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Digital spend by business</CardTitle>
            <p className="text-xs text-gray-500">From the Spend page · million BDT</p>
          </CardHeader>
          <CardContent>
            <BarList testId="digital-by-business" empty={`No digital spend recorded for ${formatMonth(month)}.`} color="bg-rose-600"
              rows={byBusiness.map((b) => ({ key: b.name, label: b.name, value: b.amount, display: `${formatMillion(b.amount)}M` }))} />
          </CardContent>
        </Card>
      </div>

      <DigitalEntries month={month} rows={entries} brands={brands} brandId={brandId}
        platforms={platforms.map((p) => ({ id: p.id, name: p.name }))} />

      <UploadPanel kind="digital" viewMonth={month} />
    </div>
  );
}

function PlatformTile({ p }: { p: PlatformSummary }) {
  const stat = (label: string, value: string) => (
    <div><dt className="text-xs text-gray-500">{label}</dt><dd className="tabular-nums">{value}</dd></div>
  );
  return (
    <Card data-testid={`platform-${p.code}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <span className={cn("inline-block size-2.5 rounded-full", CHANNEL_COLORS[p.code]?.split(" ")[0])} aria-hidden />
          {p.name}
        </CardTitle>
        {!p.hasData && <span className="text-xs text-gray-400">No data</span>}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {stat("Spend (BDT)", p.hasData ? formatTaka(p.spend) : "–")}
          {stat("Reach", p.hasData ? formatCount(p.reach) : "–")}
          {stat("Impressions", p.hasData ? formatCount(p.impressions) : "–")}
          {stat("CPM (BDT)", p.cpm === null ? "–" : formatRate(p.cpm))}
          {stat("ThruPlays", p.hasData ? formatCount(p.thruplays) : "–")}
          {stat("Cost per view (BDT)", p.costPerView === null ? "–" : formatRate(p.costPerView))}
          {stat("Engagement", p.hasData ? formatCount(p.engagement) : "–")}
        </dl>
      </CardContent>
    </Card>
  );
}
