import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { SourceTag } from "@/components/data/source-tag";
import { UploadPanel } from "@/components/data/upload-panel";
import { StatCard, StatGrid } from "@/components/data/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMillion } from "@/lib/money";
import { addMonths, formatMonth, todayDhaka } from "@/lib/month";
import { listBrandsWithRivals, listTvStations, listVendors } from "@/server/master-data";
import { listChannels } from "@/server/plan";
import { activeBrandId, parseSpendQuery } from "@/server/filters";
import { RememberView } from "@/components/data/remember-view";
import { listSpendEntries, spendBreakdown, spendMatrix, type ChannelGroup } from "@/server/spend";
import { SpendEntries } from "./spend-entries";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";

export const metadata: Metadata = { title: "Spend" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const GROUP_TABS: { key: ChannelGroup | ""; label: string }[] = [
  { key: "", label: "All media" },
  { key: "TV", label: "TV" },
  { key: "DIGITAL", label: "Digital" },
  { key: "PRESS", label: "Press" },
  { key: "OOH", label: "OOH" },
  { key: "RADIO", label: "Radio" },
];

export default function SpendPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Spend" subtitle="What was spent, by brand, month and media" />
      <Suspense fallback={<PageSkeleton label="Loading spend" />}>
        <SpendContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SpendContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const { month, brandId: askedBrand, group } = parseSpendQuery(sp, todayDhaka());
  const months = [-3, -2, -1, 0].map((n) => addMonths(month, n));

  const db = getDb();
  const brandId = await activeBrandId(db, askedBrand);
  const [allBrands, channels, stations, vendors, matrix, entries, byStation, byVendor] = await Promise.all([
    listBrandsWithRivals(db), listChannels(db), listTvStations(db), listVendors(db),
    spendMatrix(db, { months, brandId, group }),
    listSpendEntries(db, { month, brandId }),
    spendBreakdown(db, { month, brandId, by: "tvStation" }),
    spendBreakdown(db, { month, brandId, by: "vendor" }),
  ]);
  const brands = allBrands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  const query = (g: string) => new URLSearchParams({ month, ...(brandId ? { brand: String(brandId) } : {}), ...(g ? { group: g } : {}) }).toString();
  const tabHref = (g: string) => `/spend?${query(g)}`;
  const prev = months[2];
  const monthTotal = matrix.totals[month] ?? 0;
  const prevTotal = matrix.totals[prev] ?? 0;
  const change = prevTotal ? ((monthTotal - prevTotal) / prevTotal) * 100 : null;
  const latest = matrix.rows.reduce<string | null>((m, r) => (r.updatedAt && (!m || r.updatedAt > m) ? r.updatedAt : m), null);
  const sources = new Set(matrix.rows.map((r) => r.source));
  const overallSource = sources.size === 0 ? null : sources.size > 1 || sources.has("mixed") ? "mixed" : [...sources][0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar month={month} brands={brands} brandId={brandId} keep={group ? { group } : {}} />
        <RememberView month={month} brandId={brandId} />
        <a href={`/api/export/spend?${query(group ?? "")}`} download className={buttonVariants({ variant: "secondary", size: "sm" })}><Download aria-hidden />Export to Excel</a>
      </div>

      <StatGrid>
        <StatCard label={`Spend in ${formatMonth(month)}`} value={`${formatMillion(monthTotal)}M`} tone="accent" testId="kpi-month-spend"
          trend={months.map((m) => matrix.totals[m] ?? 0)}
          note={group ? `${GROUP_TABS.find((t) => t.key === group)?.label} only · BDT with VAT` : "All media · BDT with VAT"} />
        <StatCard label={`Change vs ${formatMonth(prev)}`} testId="kpi-change"
          value={change === null ? "–" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`}
          tone="neutral"
          note={prevTotal ? `${formatMillion(prevTotal)}M last month` : "No spend last month"} />
        <StatCard label="Brands with spend" value={matrix.rows.filter((r) => (r.cells[month] ?? 0) > 0).length} testId="kpi-brands"
          note={`of ${brands.length} active brands`} />
        <StatCard label="Entries this month" value={entries.length} testId="kpi-entries"
          note={`${entries.filter((e) => e.source === "manual").length} manual · ${entries.filter((e) => e.source === "upload").length} uploaded`} />
      </StatGrid>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Spend by brand and month (million BDT, with VAT)</CardTitle>
          <SegmentedLinks label="Media" value={group ?? ""} items={GROUP_TABS.map((t) => ({ key: t.key, label: t.label, href: tabHref(t.key) }))} />
        </CardHeader>
        <CardContent>
          {matrix.rows.length === 0 ? (
            <EmptyState title="No spend in these months" message={`Nothing recorded from ${formatMonth(months[0])} to ${formatMonth(month)}. Upload a spend file or add an entry.`} />
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="spend-matrix">
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    {months.map((m) => <TableHead key={m} className="text-right">{formatMonth(m).replace(/ \d{4}$/, "")}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.rows.map((r) => (
                    <TableRow key={r.brandId}>
                      <TableCell className="font-medium">{r.brandName}</TableCell>
                      {months.map((m) => <TableCell key={m} className="text-right tabular-nums">{r.cells[m] ? formatMillion(r.cells[m]) : "–"}</TableCell>)}
                      <TableCell className="text-right font-medium tabular-nums">{formatMillion(r.total)}</TableCell>
                      <TableCell><SourceTag source={r.source} updatedAt={r.updatedAt} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>All brands</TableCell>
                    {months.map((m) => <TableCell key={m} className="text-right tabular-nums">{matrix.totals[m] ? formatMillion(matrix.totals[m]) : "–"}</TableCell>)}
                    <TableCell className="text-right tabular-nums">{formatMillion(matrix.grandTotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          <div className="mt-2"><SourceTag source={overallSource as "upload" | "manual" | "mixed" | null} updatedAt={latest} label="All figures" /></div>
        </CardContent>
      </Card>

      <SpendEntries
        autoOpen={sp.new === "entry"}
        month={month}
        rows={entries}
        brands={brands}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        stations={stations.map((s) => ({ id: s.id, name: s.name }))}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        brandId={brandId}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title={`TV stations · ${formatMonth(month)}`} rows={byStation} empty="No TV station spend this month." />
        <Breakdown title={`Agencies and vendors · ${formatMonth(month)}`} rows={byVendor} empty="No spend this month." />
      </div>

      <UploadPanel kind="spend" viewMonth={month} />
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: { name: string; amount: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.name} className="text-sm">
                <div className="flex justify-between"><span>{r.name}</span><span className="tabular-nums">{formatMillion(r.amount)}M</span></div>
                <div className="mt-1 h-1.5 rounded bg-gray-100"><div className="h-1.5 rounded bg-primary" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
