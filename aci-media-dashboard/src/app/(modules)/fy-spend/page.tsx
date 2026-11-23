import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { isAdmin } from "@/auth/admin";
import { EmptyState } from "@/components/data/empty-state";
import { NoDataYet } from "@/components/data/no-data-yet";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";
import { StatCard, StatGrid } from "@/components/data/stat-card";
import { BusinessFilter, getBusinessChoice } from "@/components/shell/business-filter";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { FY_MEDIA, fyStartOf } from "@/lib/manual/rules";
import { formatMn, fySpendView, parseMedia, tableNote, type MediaChoice } from "@/lib/pages/fy-spend";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import { getActiveData } from "@/store/datasets";
import { FyTable } from "./fy-table";

export const metadata: Metadata = { title: "FY Media Spend" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "3.2 FY Media Spend";
const MEDIA_ITEMS = [
  { key: "All", label: "All media", href: "/fy-spend" },
  ...FY_MEDIA.map((m) => ({ key: m, label: m, href: `/fy-spend?media=${m}` })),
];

// The subline and the media buttons name the FY from the data, so the whole header streams with the body.
export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<><PageHeader title={TITLE} /><PageSkeleton label="Loading FY media spend" /></>}>
      <FySpend searchParams={searchParams} />
    </Suspense>
  );
}

function Header({ subtitle, media }: { subtitle?: string; media?: MediaChoice }) {
  return (
    <PageHeader title={TITLE} subtitle={subtitle}>
      <Suspense fallback={null}>
        <BusinessFilter />
      </Suspense>
      {media && (
        // 40px touch targets, and the buttons scroll on their own on a phone, as the Business filter does.
        <div className="max-w-full overflow-x-auto [&_a]:h-10">
          <SegmentedLinks label="Media" items={MEDIA_ITEMS} value={media} />
        </div>
      )}
    </PageHeader>
  );
}

async function FySpend({ searchParams }: { searchParams: Search }) {
  await connection();
  const store = await getStore();
  const [active, catalog, choice, admin, sp] = await Promise.all([
    getActiveData<FyRow[]>(store, "fy"),
    getCatalog(store),
    getBusinessChoice(),
    isAdmin(),
    searchParams,
  ]);

  if (!active) {
    return (
      <>
        <Header />
        <NoDataYet fileName="CB Media Spent Report" card="fy" admin={admin} />
      </>
    );
  }

  const media = parseMedia(sp.media);
  const view = fySpendView({
    rows: active.data,
    fyStart: fyStartOf(active, new Date()),
    businessOf: catalog.businessOf,
    brandOf: catalog.brandOf,
    business: choice,
    media,
  });

  return (
    <>
      <Header subtitle={`BDT Mn by brand and month · FY ${view.fyLabel} vs FY ${view.lastFyLabel}`} media={media} />
      <div className="space-y-6">
        <StatGrid>
          {view.cards.map((c) => (
            <StatCard
              key={c.medium}
              label={c.medium}
              testId={`fy-card-${c.medium}`}
              value={<Amount n={c.fytd} />}
              // Wraps instead of cutting off on a phone, where the cards are two to a row.
              note={<span className="whitespace-normal">{`FY ${view.lastFyLabel} full year: ${formatMn(c.py)}`}</span>}
            />
          ))}
        </StatGrid>

        <Card>
          <CardHeader>
            <CardTitle>{`Brand × month spend${media === "All" ? "" : ` · ${media}`}`}</CardTitle>
            <CardDescription>
              {tableNote(view)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.empty ? (
              <EmptyState title={`No spend for ${choice?.name ?? "this selection"} in FY ${view.fyLabel} yet.`} />
            ) : (
              <FyTable view={view} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** formatMn's text, with the unit set smaller so the figure stays on one line in a phone-width card. */
function Amount({ n }: { n: number }) {
  const [figure, ...unit] = formatMn(n).split(" ");
  return (
    <>
      {figure} <span className="text-sm font-medium text-gray-500">{unit.join(" ")}</span>
    </>
  );
}
