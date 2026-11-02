import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { CardLink } from "@/components/data/card-link";
import { EmptyState } from "@/components/data/empty-state";
import { FlaskConical } from "lucide-react";
import { StatCard, StatGrid } from "@/components/data/stat-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANNEL_COLORS, FALLBACK_COLOR, mainChannel } from "@/lib/channel-colors";
import { formatMillion, formatTaka } from "@/lib/money";
import { formatMonth, isMonth, todayDhaka } from "@/lib/month";
import { cn } from "@/lib/utils";
import { homeData, UPCOMING_DAYS } from "@/server/home";
import type { CampaignView } from "@/server/plan";
import { RemindOverdueButton, ResolveReminderButton } from "./home-actions";
import { PageSkeleton } from "@/components/data/page-skeleton";

export const metadata: Metadata = { title: "Home" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const LEVEL_BAR = { ok: "bg-primary", orange: "bg-orange-500", red: "bg-red-600", "no-budget": "bg-gray-300" } as const;
const LEVEL_TEXT = { ok: "text-gray-700", orange: "text-orange-700", red: "text-red-700", "no-budget": "text-gray-400" } as const;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <PageHeader title={part} subtitle="Here is what needs attention today. All amounts in BDT, with VAT." />;
}

export default function HomePage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <Suspense fallback={<PageSkeleton label="Loading" />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function HomeContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const h = await homeData(getDb(), { today, month });
  const t = h.thresholds;
  const buckets = [
    { key: "fresh", label: `0–${t.billYellowDays - 1} days`, ...h.bills.fresh, dot: "bg-gray-400" },
    { key: "yellow", label: `${t.billYellowDays}–${t.billRedDays - 1} days`, ...h.bills.yellow, dot: "bg-amber-500" },
    { key: "red", label: `${t.billRedDays}+ days`, ...h.bills.red, dot: "bg-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="[&>header]:mb-0"><Greeting /></div>
      {h.budgets.length === 0 && (
        <EmptyState icon={FlaskConical} title="No brands yet"
          message="Load the sample data in Settings to see every page filled in, or add your first real brand there.">
          <Link href="/settings" className={buttonVariants()}>Open Settings</Link>
        </EmptyState>
      )}
      <form method="get" aria-label="Home month" className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <label className="flex items-center gap-1">Budget month
          <input type="month" name="month" defaultValue={month} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm" />
        </label>
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>

      <StatGrid>
        <StatCard label="Live campaigns" value={h.live.length} tone="accent" href={`/plan?month=${today.slice(0, 7)}`} testId="kpi-live"
          note={h.live.length ? `${h.live.map((c) => c.name).slice(0, 2).join(", ")}${h.live.length > 2 ? "…" : ""}` : "None running today"} />
        <StatCard label={`Starting in ${UPCOMING_DAYS} days`} value={h.startingSoon.length} tone="accent" href={`/plan?month=${today.slice(0, 7)}`} testId="kpi-upcoming"
          note={h.startingSoon[0] ? `Next: ${h.startingSoon[0].name}, ${longDate(h.startingSoon[0].startDate)}` : "Nothing planned yet"} />
        <StatCard label="Unpaid bills" value={h.bills.unpaid.count} tone={h.bills.unpaid.count ? "warn" : "good"} href="/billing" testId="kpi-unpaid"
          note={`${formatMillion(h.bills.unpaid.amount)}M BDT waiting`} />
        <StatCard label={`Overdue ${t.billRedDays}+ days`} value={h.bills.red.count} tone={h.bills.red.count ? "bad" : "good"} href="/billing?age=red" testId="kpi-overdue"
          note={h.bills.red.count ? `${formatMillion(h.bills.red.amount)}M BDT · follow up` : "All bills on time"} />
      </StatGrid>

      <Card className={cn(h.alerts.some((a) => a.level === "red") && "border-red-200")}>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        <CardContent>
          {h.alerts.length === 0 ? (
            <p className="text-sm text-gray-500" data-testid="alerts">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-2" data-testid="alerts">
              {h.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.level === "red" ? "bg-red-600" : "bg-orange-500")} aria-hidden />
                  <Link href={a.href} className="hover:underline">{a.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
            <CardTitle>Budget used</CardTitle>
            <p className="text-xs text-gray-500">{formatMonth(month)} · actual spend against budget. Orange from {t.budgetOrangePct}%, red from {t.budgetRedPct}%.</p>
            </div>
            <CardLink href={`/plan?month=${month}`}>Open plan</CardLink>
          </CardHeader>
          <CardContent>
            {h.budgets.length === 0 ? <p className="text-sm text-gray-500">No active brands yet.</p> : (
              <ul className="space-y-3" data-testid="home-budgets">
                {h.budgets.map((b) => (
                  <li key={b.brandId} className="text-sm" data-testid={`home-budget-${b.brandName}`}>
                    <div className="flex justify-between gap-2">
                      <span>{b.brandName}</span>
                      <span className={cn("tabular-nums", LEVEL_TEXT[b.level])}>
                        {b.budget ? `${Math.round(b.pct ?? 0)}% of ${formatMillion(b.budget)}M` : "No budget set"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100">
                      {b.budget ? <div className={cn("h-2 rounded", LEVEL_BAR[b.level])} style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Bills waiting</CardTitle>
              <p className="text-xs text-gray-500">{h.bills.unpaid.count} unpaid · {formatTaka(h.bills.unpaid.amount)} BDT</p>
            </div>
            <RemindOverdueButton count={h.bills.red.count} />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm" data-testid="home-bills">
              {buckets.map((b) => (
                <li key={b.key}>
                  <Link href={`/billing?age=${b.key}`} className="flex items-center justify-between gap-2 hover:underline">
                    <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", b.dot)} aria-hidden />{b.label}</span>
                    <span className="tabular-nums">{b.count} · {formatMillion(b.amount)}M</span>
                  </Link>
                </li>
              ))}
            </ul>
            {h.reminders.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="mb-1 text-xs font-medium text-gray-600">Reminders</p>
                <ul className="space-y-1 text-sm" data-testid="home-reminders">
                  {h.reminders.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>{r.billNo} · {r.vendorName ?? "No vendor"} · <span className="text-gray-500">{r.ageDays} days</span></span>
                      <ResolveReminderButton id={r.id} label={r.billNo} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle>Best channel for reach</CardTitle>
            <CardLink href={`/performance?month=${h.bestReach?.month ?? month}`}>Compare</CardLink>
          </CardHeader>
          <CardContent data-testid="home-best-reach">
            {h.bestReach ? (
              <>
                <p className="text-2xl font-semibold">{h.bestReach.row.name}</p>
                <p className="text-sm text-gray-600">{formatTaka(h.bestReach.row.costPer1000!)} BDT to reach 1,000 people</p>
                <p className="mt-1 text-xs text-gray-500">Lowest cost in {formatMonth(h.bestReach.month)}{h.bestReach.month !== month ? " (latest month with numbers)" : ""}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No reach numbers yet. Enter them on the <Link href="/performance" className="underline">Performance</Link> page.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CampaignList title="Live now" testId="home-live" empty="No campaign is running today." rows={h.live} today={today} />
        <CampaignList title={`Starting in the next ${UPCOMING_DAYS} days`} testId="home-upcoming" empty="Nothing starts in the next two weeks." rows={h.startingSoon} today={today} />
      </div>
    </div>
  );
}

function CampaignList({ title, testId, empty, rows, today }: { title: string; testId: string; empty: string; rows: CampaignView[]; today: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <CardLink href={`/plan?month=${today.slice(0, 7)}`}>Open plan</CardLink>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-gray-500" data-testid={testId}>{empty}</p> : (
          <ul className="divide-y divide-gray-100 text-sm" data-testid={testId}>
            {rows.map((c) => {
              const main = mainChannel(c.lines);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", main ? CHANNEL_COLORS[main] ?? FALLBACK_COLOR : FALLBACK_COLOR)}>{main ?? "–"}</span>
                    <span className="truncate"><span className="font-medium">{c.name}</span> · {c.brandName}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-gray-500 tabular-nums">
                    {c.startDate > today ? `Starts ${longDate(c.startDate)}` : `Ends ${longDate(c.endDate)}`} · {formatMillion(c.total)}M
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
