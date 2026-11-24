import type * as React from "react";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MEDIUM_BG, MEDIUM_EDGE } from "@/lib/channel-colors";
import { FY_MEDIA } from "@/lib/manual/rules";
import { calendarQuery, cellMedia, cellTitle, toggleMedium, type CalendarParams, type CalendarView, type Cell } from "@/lib/pages/calendar";
import { formatMn } from "@/lib/pages/fy-spend";
import { cn } from "@/lib/utils";

// The 3.1 Activity Gantt. Only maps the view model to markup: every figure and rule comes from calendarView.

const ZERO = "–"; // the single-character zero marker of business rows, as on 3.2
/** Table cells carry the number only (the unit is in the sub line); same rounding rule as formatMn. */
const num = (n: number) => formatMn(n).replace(/ BDT Mn$/, "");

/** Grey diagonal hatching for months not uploaded yet. */
export const HATCH = "bg-[image:repeating-linear-gradient(135deg,var(--color-gray-300)_0_2px,transparent_2px_7px)]";

const sticky = "sticky left-0 z-10 min-w-36 max-w-56 whitespace-normal shadow-[inset_-1px_0_0_var(--color-gray-200)]";
const right = "text-right tabular-nums";
// The current month's column: an outline drawn above the cell's content, so the lanes do not cut it.
const outline = "relative after:pointer-events-none after:absolute after:inset-0 after:border-x-2 after:border-primary/70";

type Kind = "business" | "brand" | "total";

/** Month cell props shared by every row: the month, the hatching, the outline. */
function monthCell(view: CalendarView, i: number, kind: Kind | "head") {
  const current = i === view.currentIndex;
  return {
    "data-month": view.monthKeys[i],
    "data-uploaded": String(view.uploaded[i]),
    ...(current ? { "data-current": "true" } : {}),
    className: cn(
      "min-w-16",
      kind !== "head" && !view.uploaded[i] && HATCH,
      current && outline,
      current && kind === "head" && "after:border-t-2",
      current && kind === "total" && "after:border-b-2",
    ),
  };
}

function Lane({ lane }: { lane: NonNullable<Cell>["lanes"][number] }) {
  const round = lane.start && lane.end ? "rounded-full" : lane.start ? "rounded-l-full" : lane.end ? "rounded-r-full" : "";
  return <span data-medium={lane.medium} data-on={String(lane.on)} className={cn("block h-1.5 w-full", lane.on && [MEDIUM_BG[lane.medium], MEDIUM_EDGE[lane.medium]], round)} />;
}

function BrandRow({ view, brand }: { view: CalendarView; brand: CalendarView["gantt"]["groups"][number]["brands"][number] }) {
  return (
    <TableRow data-testid="gantt-brand-row" className="group hover:bg-gray-50">
      <TableCell className={cn(sticky, "bg-white pl-6 font-semibold text-gray-900 group-hover:bg-gray-50")}>{brand.name}</TableCell>
      {brand.cells.map((cell, i) => {
        const at = monthCell(view, i, "brand");
        return (
          <TableCell
            key={i}
            {...at}
            title={cell ? cellTitle(brand.name, view.monthLabels[i], cell) : "Not yet uploaded"}
            className={cn(at.className, "p-0 align-top")}
          >
            {cell && (
              <>
                <span className="sr-only">{cellMedia(cell)}</span>
                <div className={cn(right, "h-5 px-2 pt-1 text-xs text-gray-700")}>{cell.total === 0 ? "" : num(cell.total)}</div>
                <div className="flex flex-col gap-0.5 pt-1 pb-2">{cell.lanes.map((l) => <Lane key={l.medium} lane={l} />)}</div>
              </>
            )}
          </TableCell>
        );
      })}
      <TableCell className={cn(right, "font-semibold text-gray-900")}>{num(brand.fytd)}</TableCell>
    </TableRow>
  );
}

/** A business row or the Total row: bold month totals, hatched where not uploaded. */
function SumRow({ view, name, months, fytd, kind }: { view: CalendarView; name: string; months: (number | null)[]; fytd: number; kind: "business" | "total" }) {
  const shade = kind === "total" ? "bg-gray-200" : "bg-muted";
  return (
    <TableRow
      data-testid={kind === "total" ? "gantt-total-row" : "gantt-business-row"}
      className={kind === "total" ? "bg-gray-200 font-semibold hover:bg-gray-200" : "bg-muted font-medium hover:bg-muted"}
    >
      <TableCell className={cn(sticky, shade, "text-gray-900")}>{name}</TableCell>
      {months.map((v, i) => {
        const at = monthCell(view, i, kind);
        return (
          <TableCell key={i} {...at} className={cn(at.className, right, "font-semibold text-gray-900")}>
            {v === null ? null : v === 0 && kind === "business" ? ZERO : num(v)}
          </TableCell>
        );
      })}
      <TableCell className={cn(right, "font-semibold text-gray-900")}>{fytd === 0 && kind === "business" ? ZERO : num(fytd)}</TableCell>
    </TableRow>
  );
}

const control = "inline-flex h-10 min-w-10 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors";

/**
 * A GET form to /calendar that lands on `target`, the same address as calendarHref(target). Every parameter but
 * `own` rides in a hidden field; `own` rides on the submit button itself, so the button says what it changes.
 * Native buttons give Space and Enter, and the form works without script.
 */
function ParamForm({ target, own, children }: { target: CalendarParams; own: string; children: (field: { name?: string; value?: string }) => React.ReactNode }) {
  const pairs = calendarQuery(target);
  const at = pairs.findIndex(([k]) => k === own);
  // Fields submit in document order: the button sits where its pair falls, so the address reads as calendarHref's.
  const cut = at >= 0 ? at : pairs.length;
  const hidden = (ps: [string, string][]) => ps.filter(([k]) => k !== own).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  return (
    <form action="/calendar" className="contents">
      {hidden(pairs.slice(0, cut))}
      {children(at >= 0 ? { name: pairs[at][0], value: pairs[at][1] } : {})}
      {hidden(pairs.slice(cut))}
    </form>
  );
}

function MediumToggle({ medium, params, shown }: { medium: (typeof FY_MEDIA)[number]; params: CalendarParams; shown: CalendarView["gantt"]["media"] }) {
  const on = shown.includes(medium);
  const next = toggleMedium(shown, medium);
  const body = (
    <>
      <span className={cn("size-3 rounded-[3px]", MEDIUM_BG[medium], MEDIUM_EDGE[medium], !on && "opacity-30")} aria-hidden />
      {medium}
    </>
  );
  const look = cn(control, on ? "border-gray-300 bg-white font-medium text-gray-900" : "border-gray-200 bg-gray-50 text-gray-500");
  // The last medium on cannot be switched off: shown as pressed, but disabled.
  if (!next) return <button type="button" disabled aria-pressed="true" data-toggle={medium} className={cn(look, "cursor-not-allowed")}>{body}</button>;
  return (
    <ParamForm target={{ ...params, media: next }} own="media">
      {(field) => (
        <button type="submit" {...field} aria-pressed={on} data-toggle={medium} className={cn(look, "cursor-pointer hover:bg-gray-50")}>
          {body}
        </button>
      )}
    </ParamForm>
  );
}

export function Gantt({ view, params }: { view: CalendarView; params: CalendarParams }) {
  const { gantt } = view;
  const shown = gantt.media;
  return (
    <Card data-testid="calendar-gantt">
      <CardHeader>
        <CardTitle>{`Activity Gantt · FY ${view.fyLabel}`}</CardTitle>
        <CardDescription>
          Each coloured lane is a medium; a continuous bar means the brand stayed on air month after month. Number = month spend (BDT Mn) for the media shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Media shown" className="flex flex-wrap gap-2">
            {FY_MEDIA.map((m) => <MediumToggle key={m} medium={m} params={params} shown={shown} />)}
          </div>
          <ParamForm target={{ ...params, media: shown, inactive: !params.inactive }} own="inactive">
            {(field) => (
              <button
                type="submit"
                {...field}
                role="switch"
                aria-checked={params.inactive}
                className={cn(control, "cursor-pointer border-transparent text-gray-700 hover:bg-gray-50")}
              >
                <span
                  className={cn("grid size-4 place-items-center rounded-[4px] border", params.inactive ? "border-primary bg-primary text-primary-foreground" : "border-gray-300 bg-white")}
                  aria-hidden
                >
                  {params.inactive && <Check className="size-3" strokeWidth={3} />}
                </span>
                Show inactive brands
              </button>
            )}
          </ParamForm>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(sticky, "bg-gray-50")}>Brand</TableHead>
              {view.monthLabels.map((m, i) => {
                const at = monthCell(view, i, "head");
                return <TableHead key={m} {...at} className={cn(at.className, "text-right")}>{m}</TableHead>;
              })}
              <TableHead className="text-right">FYTD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gantt.groups.flatMap((g, gi) => [
              <SumRow key={`${gi}`} view={view} name={g.name} months={g.months} fytd={g.fytd} kind="business" />,
              ...g.brands.map((b, bi) => <BrandRow key={`${gi}-${bi}`} view={view} brand={b} />),
            ])}
            <SumRow view={view} name="Total" months={gantt.total.months} fytd={gantt.total.fytd} kind="total" />
          </TableBody>
        </Table>

        <ul data-testid="gantt-legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
          {shown.map((m) => (
            <li key={m} className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-5 rounded-full", MEDIUM_BG[m], MEDIUM_EDGE[m])} aria-hidden />
              <span>{m}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className={cn("size-3.5 rounded-[3px] border border-gray-200", HATCH)} aria-hidden />
            Not yet uploaded
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
