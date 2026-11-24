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
import type { CalendarData } from "@/lib/ingest/readers/calendar";
import { MEDIUM_TEXT } from "@/lib/channel-colors";
import { dhakaDate, fyStartOf } from "@/lib/manual/rules";
import { calendarHref, calendarView, carriedParams, changeNote, monthsNote, parseCalendarParams, type CalendarParams, type CalendarView } from "@/lib/pages/calendar";
import { formatMn } from "@/lib/pages/fy-spend";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import { getActiveData } from "@/store/datasets";
import { Gantt } from "./gantt";
import { Sheet } from "./sheet";
import { SpendChart } from "./spend-chart";

export const metadata: Metadata = { title: "Monthly Activity Calendar" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "3.1 Monthly Activity Calendar";
const SUBTITLE = "Brand × media activity and spend (BDT Mn), month on month";

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<><PageHeader title={TITLE} subtitle={SUBTITLE} /><PageSkeleton label="Loading the activity calendar" /></>}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

function Header({ params }: { params?: CalendarParams }) {
  return (
    <PageHeader title={TITLE} subtitle={SUBTITLE}>
      <Suspense fallback={null}>
        <BusinessFilter />
      </Suspense>
      {params && (
        // 40px touch targets, and the buttons scroll on their own on a phone, as the Business filter does.
        <div className="max-w-full overflow-x-auto [&_a]:h-10">
          <SegmentedLinks
            label="Calendar view"
            value={params.view}
            items={[
              { key: "gantt", label: "Gantt chart", href: calendarHref({ ...params, view: "gantt" }) },
              { key: "sheet", label: "Sheet view", href: calendarHref({ ...params, view: "sheet" }) },
            ]}
          />
        </div>
      )}
    </PageHeader>
  );
}

async function Calendar({ searchParams }: { searchParams: Search }) {
  await connection();
  const store = await getStore();
  const [active, catalog, choice, admin, sp] = await Promise.all([
    getActiveData<CalendarData>(store, "calendar"),
    getCatalog(store),
    getBusinessChoice(),
    isAdmin(),
    searchParams,
  ]);

  if (!active) {
    return (
      <>
        <Header />
        <NoDataYet fileName="All Activity Calendar" card="calendar" admin={admin} />
      </>
    );
  }

  const params = parseCalendarParams(sp);
  const now = new Date();
  const view = calendarView({
    data: active.data,
    fyStart: fyStartOf(active, now),
    today: dhakaDate(now).slice(0, 7),
    businessOf: catalog.businessOf,
    brandOf: catalog.brandOf,
    business: choice,
    params,
  });

  return (
    <>
      <Header params={carriedParams(params, view)} />
      <div className="space-y-6">
        {view.cards && <Cards view={view} cards={view.cards} />}
        {view.empty && choice ? (
          <EmptyState title={`No activity for ${choice.name} in FY ${view.fyLabel} yet.`} />
        ) : (
          <>
            {params.view === "sheet" ? <Sheet view={view} params={params} /> : <Gantt view={view} params={params} />}
            <SpendChart chart={view.chart} />
          </>
        )}
      </div>
    </>
  );
}

function Cards({ view, cards }: { view: CalendarView; cards: NonNullable<CalendarView["cards"]> }) {
  return (
    <StatGrid>
      <StatCard label={`FY ${view.fyLabel} to date`} testId="cal-card-fytd" value={<Amount n={cards.fytd} />} note={<Wrap>{monthsNote(cards)}</Wrap>} />
      <StatCard label={`${cards.last.label} spend`} testId="cal-card-last" value={<Amount n={cards.last.total} />} note={<Wrap>{changeNote(cards.last)}</Wrap>} />
      <StatCard
        label="Active brands"
        testId="cal-card-active"
        value={cards.activeLast}
        note={<Wrap>{`in ${cards.last.label} · ${cards.activeFy} so far this FY`}</Wrap>}
      />
      <StatCard
        label={`Media mix ${cards.last.label}`}
        testId="cal-card-mix"
        value={
          <span className="flex flex-wrap gap-x-1.5 gap-y-1 text-base leading-snug md:text-lg">
            {cards.mix.map((m, i) => (
              <span key={m.medium} data-medium={m.medium} className="whitespace-nowrap">
                <span className={cn("font-semibold", MEDIUM_TEXT[m.medium])}>{`${m.pct}%`}</span>
                {` ${m.medium}`}
                {i < cards.mix.length - 1 && <span className="text-gray-400">{" · "}</span>}
              </span>
            ))}
          </span>
        }
      />
    </StatGrid>
  );
}

/** Card notes wrap instead of cutting off on a phone, where the cards are two to a row. */
function Wrap({ children }: { children: string }) {
  return <span className="whitespace-normal">{children}</span>;
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
