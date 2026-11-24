import { SegmentedLinks } from "@/components/data/segmented";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MEDIUM_BG, MEDIUM_EDGE } from "@/lib/channel-colors";
import { FY_MEDIA } from "@/lib/manual/rules";
import { calendarHref, formatSheet, type CalendarParams, type CalendarView } from "@/lib/pages/calendar";
import { cn } from "@/lib/utils";

// The 3.1 Sheet view: his Excel sheet's layout. Only maps the view model to markup; every figure comes from calendarView.

type SheetModel = CalendarView["sheet"];
type Line = { v: number[]; t: number };

const right = "text-right tabular-nums";
// Excel-like bands: green header, amber business totals, green grand total.
const head = "border-emerald-700 bg-emerald-700 text-white";

function Numbers({ line, className }: { line: Line; className?: string }) {
  return (
    <>
      {line.v.map((x, n) => <TableCell key={FY_MEDIA[n]} className={cn(right, className)}>{formatSheet(x)}</TableCell>)}
      <TableCell className={cn(right, "font-semibold", className)}>{formatSheet(line.t)}</TableCell>
    </>
  );
}

function Notes({ notes, label }: { notes: NonNullable<SheetModel["notes"]>; label: string }) {
  // Free text from the bottom of his sheet, rendered as React text only. A group shows only when it has entries.
  const groups = [
    { title: "TV channels used by brand", chips: notes.tvByBrand.map((x) => `${x.brand} · ${x.count} ${x.count === 1 ? "channel" : "channels"}`) },
    { title: `TV channels on air (${notes.channels.length})`, chips: notes.channels },
    { title: "Digital platforms", chips: notes.digital },
  ].filter((g) => g.chips.length);
  if (!groups.length) return null;
  return (
    <Card data-testid="calendar-notes">
      <CardHeader>
        <CardTitle>{`${label} media notes`}</CardTitle>
        <CardDescription>From the bottom of the month&apos;s sheet · all businesses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <h3 className="text-xs font-medium text-gray-500">{g.title}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {g.chips.map((c, i) => (
                <li key={i}>
                  <Badge variant="outline" className="h-auto min-h-6 max-w-full font-normal whitespace-normal text-gray-700">{c}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

export function Sheet({ view, params }: { view: CalendarView; params: CalendarParams }) {
  const { sheet } = view;
  return (
    <>
      <Card data-testid="calendar-sheet">
        <CardHeader>
          <CardTitle>{`CB Media Activity & Spending Amount (Mn) · ${sheet.title}`}</CardTitle>
          <CardDescription>Same layout as the Excel sheet · blank = no activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 40px touch targets; the months scroll on their own on a phone. */}
          <div className="max-w-full overflow-x-auto [&_a]:h-10">
            <SegmentedLinks
              label="Sheet month"
              value={sheet.choice}
              items={sheet.choices.map((c) => ({ key: c.key, label: c.label, href: calendarHref({ ...params, view: "sheet", sheet: c.key }) }))}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className={cn(head, "hover:bg-emerald-700")}>
                <TableHead className={cn(head, "min-w-28")}>Business</TableHead>
                <TableHead className={cn(head, "min-w-36")}>Brand</TableHead>
                {FY_MEDIA.map((m) => (
                  <TableHead key={m} className={cn(head, "text-right")}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("size-2.5 rounded-[2px] ring-1 ring-white/80", MEDIUM_BG[m], MEDIUM_EDGE[m])} aria-hidden />
                      {m}
                    </span>
                  </TableHead>
                ))}
                <TableHead className={cn(head, "text-right")}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.groups.flatMap((g, gi) => [
                ...g.brands.map((b, bi) => (
                  <TableRow key={`${gi}-${bi}`} data-testid="sheet-brand-row">
                    <TableCell className="font-semibold whitespace-normal text-gray-900">{bi === 0 ? g.name : ""}</TableCell>
                    <TableCell className="whitespace-normal text-gray-900">{b.name}</TableCell>
                    <Numbers line={b} className="text-gray-700" />
                  </TableRow>
                )),
                <TableRow key={`${gi}-total`} data-testid="sheet-total-row" className="bg-amber-50 font-semibold text-gray-900 hover:bg-amber-50">
                  <TableCell colSpan={2}>Total</TableCell>
                  <Numbers line={g.total} />
                </TableRow>,
              ])}
              <TableRow data-testid="sheet-grand-total" className="bg-emerald-100 font-bold text-gray-900 hover:bg-emerald-100">
                <TableCell colSpan={2}>Grand Total</TableCell>
                <Numbers line={sheet.grand} className="font-bold" />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {sheet.notes && sheet.notesLabel && <Notes notes={sheet.notes} label={sheet.notesLabel} />}
    </>
  );
}
