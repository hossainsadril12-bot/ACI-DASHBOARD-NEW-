import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { BarList } from "@/components/data/bar-list";
import { EmptyState } from "@/components/data/empty-state";
import { UploadPanel } from "@/components/data/upload-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount, formatMillion } from "@/lib/money";
import { formatMonth, isMonth, todayDhaka } from "@/lib/month";
import { cn } from "@/lib/utils";
import {
  competitorOverview, listCompetitorAds, listCompetitorMedia, listSources, listYoutube, MEDIA_TYPES, STALE_DAYS,
} from "@/server/competitors";
import { listBrandsWithRivals } from "@/server/master-data";
import { RememberView } from "@/components/data/remember-view";
import { AdLog } from "./ad-log";
import { MediaEntries } from "./media-entries";
import { SourcesTable } from "./sources-table";
import { YoutubeSnapshot } from "./youtube-snapshot";
import { PageSkeleton } from "@/components/data/page-skeleton";

export const metadata: Metadata = { title: "Competitor Tracking" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function CompetitorsPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Competitor Tracking" subtitle="Each brand against its 3 rivals" />
      <Suspense fallback={<PageSkeleton label="Loading competitors" />}>
        <CompetitorsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CompetitorsContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const db = getDb();
  const active = (await listBrandsWithRivals(db)).filter((b) => b.active);
  if (active.length === 0) {
    return (
      <EmptyState title="No brands yet" message="Add a brand and its rivals in Settings first.">
        <Link href="/settings" className={buttonVariants({ variant: "secondary" })}>Open Settings</Link>
      </EmptyState>
    );
  }
  const wanted = typeof sp.brand === "string" ? Number(sp.brand) : NaN;
  const brand = active.find((b) => b.id === wanted) ?? active[0];

  const [overview, mediaRows, ads, youtube, sources] = await Promise.all([
    competitorOverview(db, { brandId: brand.id, month }),
    listCompetitorMedia(db, { brandId: brand.id, month }),
    listCompetitorAds(db, { brandId: brand.id }),
    listYoutube(db, { brandId: brand.id, month }),
    listSources(db, today),
  ]);
  const anySpend = overview.some((s) => s.spend > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar month={month} brands={active.map((b) => ({ id: b.id, name: b.name }))} brandId={brand.id} allowAll={false} />
        <RememberView month={month} brand={false} />
        <p className="text-sm text-gray-600" data-testid="rivals-line">
          <span className="font-medium text-gray-900">{brand.name}</span>
          {brand.rivals.length ? ` vs ${brand.rivals.map((r) => r.name).join(", ")}` : " has no rivals yet"}
          {brand.rivals.length < 3 && <> · <Link href="/settings" className="text-primary underline">Add rivals in Settings</Link></>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Share of voice · {formatMonth(month)}</CardTitle>
            <p className="text-xs text-gray-500">Share of TV, Press and Radio spend between {brand.name} and its rivals.</p>
          </CardHeader>
          <CardContent>
            {anySpend ? (
              <BarList testId="share-of-voice" empty="No data." color="bg-primary"
                rows={overview.map((s) => ({
                  key: s.key, label: s.name, value: s.shareOfVoice, display: s.shareOfVoice === null ? "" : `${s.shareOfVoice.toFixed(1)}%`,
                  note: s.isOwn ? "Our brand" : undefined, highlight: s.isOwn,
                }))} />
            ) : (
              <p className="text-sm text-gray-500">No spend recorded for {formatMonth(month)} yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Spend and spots by media</CardTitle><p className="text-xs text-gray-500">Spend in million BDT · spots or insertions</p></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table data-testid="media-by-subject">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    {MEDIA_TYPES.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className={cn(s.isOwn && "font-medium")}>{s.name}</TableCell>
                      {MEDIA_TYPES.map((m) => (
                        <TableCell key={m} className="text-right tabular-nums">
                          {s.byMedia[m].spend || s.byMedia[m].spots
                            ? <>{formatMillion(s.byMedia[m].spend)}<span className="text-gray-400"> · {formatCount(s.byMedia[m].spots)}</span></>
                            : "–"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">
                        {s.spend || s.spots ? <>{formatMillion(s.spend)}<span className="text-gray-400"> · {formatCount(s.spots)}</span></> : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <MediaEntries brandId={brand.id} month={month} rows={mediaRows}
        subjects={[{ rivalId: null, name: brand.name }, ...brand.rivals.map((r) => ({ rivalId: r.id, name: r.name }))]} />

      <AdLog brandId={brand.id} rows={ads} rivals={brand.rivals} />

      <YoutubeSnapshot brandId={brand.id} month={month} rows={youtube} />

      <SourcesTable rows={sources} staleDays={STALE_DAYS} />

      <UploadPanel kind="competitor_media" viewMonth={month} />
    </div>
  );
}
