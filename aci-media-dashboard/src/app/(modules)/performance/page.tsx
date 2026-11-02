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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTaka } from "@/lib/money";
import { formatMonth, isMonth, todayDhaka } from "@/lib/month";
import { listBrandsWithRivals } from "@/server/master-data";
import { activeBrandId } from "@/server/filters";
import { RememberView } from "@/components/data/remember-view";
import { listChannels } from "@/server/plan";
import { listPerformance, reachCost, type ReachView } from "@/server/performance";
import { CHANNEL_GROUPS } from "@/server/spend";
import { PerformanceResults } from "./performance-results";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";

export const metadata: Metadata = { title: "Performance" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const VIEW_TABS: { key: ReachView; label: string }[] = [
  { key: "all", label: "Both" },
  { key: "TV", label: "TV" },
  { key: "DIGITAL", label: "Digital" },
];

export default function PerformancePage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Performance" subtitle="Which channel reaches 1,000 people for the least money" />
      <Suspense fallback={<PageSkeleton label="Loading performance" />}>
        <PerformanceContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const pct = (v: number | null) => (v === null ? "–" : `${v}%`);
const plain = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-IN"));

async function PerformanceContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : todayDhaka().slice(0, 7);
  const askedBrand = typeof sp.brand === "string" && /^\d+$/.test(sp.brand) ? Number(sp.brand) : undefined;
  const view: ReachView = VIEW_TABS.some((t) => t.key === sp.view) ? (sp.view as ReachView) : "all";

  const db = getDb();
  const brandId = await activeBrandId(db, askedBrand);
  const [allBrands, channels, costs, entries] = await Promise.all([
    listBrandsWithRivals(db), listChannels(db), reachCost(db, { month, brandId, view }), listPerformance(db, { month, brandId }),
  ]);
  const brands = allBrands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));

  // Every channel in the chosen view gets a bar; channels without numbers show "No data".
  const inView = channels.filter((c) => view === "all" || CHANNEL_GROUPS[view].includes(c.code));
  const best = costs.find((c) => c.costPer1000 !== null);
  const bars = [
    ...costs,
    ...inView.filter((c) => !costs.some((x) => x.channelId === c.id)).map((c) => ({ channelId: c.id, code: c.code, name: c.name, spend: 0, peopleReached: 0, costPer1000: null })),
  ].map((c) => ({
    key: c.code, label: c.name, value: c.costPer1000, display: c.costPer1000 === null ? "" : `${formatTaka(c.costPer1000)} BDT`,
    note: best && c.channelId === best.channelId ? "Best value" : undefined, highlight: best?.channelId === c.channelId,
  }));
  const tvRows = entries.filter((e) => e.channelCode === "TV");
  const latest = entries.reduce<string | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);
  const sources = new Set(entries.map((e) => e.source));
  const source = sources.size === 0 ? null : sources.size > 1 ? "mixed" : [...sources][0];
  const tabHref = (v: ReachView) => {
    const q = new URLSearchParams({ month, ...(brandId ? { brand: String(brandId) } : {}), ...(v !== "all" ? { view: v } : {}) });
    return `/performance?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <FilterBar month={month} brands={brands} brandId={brandId} keep={view !== "all" ? { view } : {}} />
      <RememberView month={month} brandId={brandId} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Cost to reach 1,000 people · {formatMonth(month)}</CardTitle>
              <p className="text-xs text-gray-500">BDT with VAT. Shorter bar is better.</p>
            </div>
            <SegmentedLinks label="Channels" value={view} items={VIEW_TABS.map((t) => ({ key: t.key, label: t.label, href: tabHref(t.key) }))} />
          </CardHeader>
          <CardContent>
            <BarList rows={bars} testId="reach-chart" empty="No channels in this view." />
            <div className="mt-3"><SourceTag source={source as "upload" | "manual" | "mixed" | null} updatedAt={latest} label="All figures" /></div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>What this means</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {best ? (
              <p data-testid="best-channel"><span className="font-medium">{best.name}</span> reached 1,000 people for {formatTaka(best.costPer1000!)} BDT, the lowest cost this month.</p>
            ) : (
              <p>No channel has both spend and people reached yet for {formatMonth(month)}.</p>
            )}
            <p className="text-gray-500">Cost per 1,000 reached = spend ÷ people reached × 1,000. Channels without a people reached number show &quot;No data&quot;.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>TV numbers · {formatMonth(month)}</CardTitle></CardHeader>
        <CardContent>
          {tvRows.length === 0 ? (
            <p className="text-sm text-gray-500">No TV numbers this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="tv-numbers">
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead><TableHead className="text-right">GRP</TableHead><TableHead className="text-right">Share of voice</TableHead>
                    <TableHead className="text-right">Share of spend</TableHead><TableHead className="text-right">1+ reach</TableHead>
                    <TableHead className="text-right">Cost per rating point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tvRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.brandName}</TableCell>
                      <TableCell className="text-right tabular-nums">{plain(r.grp)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.shareOfVoice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.shareOfSpend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.reach1Plus)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cprp === null ? "–" : formatTaka(r.cprp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PerformanceResults month={month} rows={entries} brands={brands} brandId={brandId}
        channels={channels.map((c) => ({ id: c.id, name: c.name, code: c.code }))} />

      <UploadPanel kind="performance" viewMonth={month} />
    </div>
  );
}
