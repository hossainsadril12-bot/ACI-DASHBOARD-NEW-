import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MEDIUM_BG, MEDIUM_EDGE } from "@/lib/channel-colors";
import { FY_MEDIA } from "@/lib/manual/rules";
import { chartScale, type CalendarView } from "@/lib/pages/calendar";
import { formatMn } from "@/lib/pages/fy-spend";
import { cn } from "@/lib/utils";

// The 3.1 month-on-month chart, in plain elements (no chart library). Heights and shares come from chartScale.

/** The column total carries the number only (the unit is the sub line); same rounding rule as formatMn. */
const num = (n: number) => formatMn(n).replace(/ BDT Mn$/, "");

export function SpendChart({ chart }: { chart: CalendarView["chart"] }) {
  if (!chart.length) return null;
  const scale = chartScale(chart);
  return (
    <Card data-testid="calendar-chart">
      <CardHeader>
        <CardTitle>Month-on-month spend by media</CardTitle>
        <CardDescription>BDT Mn</CardDescription>
      </CardHeader>
      {/* The columns scroll inside the card on a phone; the page never scrolls sideways. */}
      <CardContent className="space-y-4 overflow-x-auto">
        <div className="flex min-w-max items-end gap-2 pt-6">
          {chart.map((c, ci) => (
            <div key={c.label} data-testid="chart-column" className="flex w-16 shrink-0 flex-col items-center gap-2">
              <div className="relative h-[200px] w-10">
                <div data-testid="chart-bar" className="absolute inset-x-0 bottom-0 flex flex-col-reverse" style={{ height: `${scale[ci].height}%` }}>
                  <span data-testid="chart-total" className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold whitespace-nowrap text-gray-900 tabular-nums">
                    {num(c.total)}
                  </span>
                  {FY_MEDIA.map((m, n) =>
                    c.v[n] > 0 ? (
                      <div
                        key={m}
                        data-medium={m}
                        title={`${m}: ${formatMn(c.v[n])}`}
                        className={cn("w-full shrink-0 last-of-type:rounded-t-[3px]", MEDIUM_BG[m], MEDIUM_EDGE[m])}
                        style={{ height: `${scale[ci].parts[n]}%` }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
              <span className="text-xs whitespace-nowrap text-gray-500">{c.label}</span>
            </div>
          ))}
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
          {FY_MEDIA.map((m) => (
            <li key={m} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-[3px]", MEDIUM_BG[m], MEDIUM_EDGE[m])} aria-hidden />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
