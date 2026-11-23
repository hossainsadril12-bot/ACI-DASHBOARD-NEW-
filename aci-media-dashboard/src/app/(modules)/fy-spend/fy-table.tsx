import type { CSSProperties } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMn, type FyLine, type FySpendView } from "@/lib/pages/fy-spend";
import { cn } from "@/lib/utils";

// The brand by month table of 3.2. Only maps the view model to markup: every figure comes from fySpendView.

const ZERO = "–"; // the single-character empty marker, as in his file and Manual Entry
/** Table cells carry the number only (the unit is in the subline); same rounding rule as formatMn. */
const num = (n: number) => formatMn(n).replace(/ BDT Mn$/, "");

const sticky = "sticky left-0 z-10 min-w-36 max-w-56 whitespace-normal shadow-[inset_-1px_0_0_var(--color-gray-200)]";
const right = "text-right tabular-nums";

/** Accent tint for a brand month cell: stronger with the value, relative to the biggest brand cell on screen. */
function tint(v: number, maxCell: number): CSSProperties | undefined {
  if (!maxCell || v <= 0) return undefined;
  const alpha = 0.08 + (0.55 * v) / maxCell;
  return { backgroundColor: `color-mix(in oklab, var(--primary) ${(alpha * 100).toFixed(1)}%, transparent)` };
}

function Row({ line, kind, maxCell }: { line: FyLine; kind: "brand" | "total" | "grand"; maxCell: number }) {
  const shade = kind === "grand" ? "bg-gray-200" : kind === "total" ? "bg-muted" : "bg-white group-hover:bg-gray-50";
  return (
    <TableRow
      data-testid={kind === "grand" ? "fy-grand-total" : undefined}
      className={cn(
        kind === "brand" && "group hover:bg-gray-50",
        kind === "total" && "bg-muted font-medium hover:bg-muted",
        kind === "grand" && "bg-gray-200 font-semibold hover:bg-gray-200",
      )}
    >
      <TableCell className={cn(sticky, shade, "text-gray-900")}>{line.name}</TableCell>
      {line.m.map((v, i) => (
        <TableCell key={i} className={right}>
          {v === null ? null : v === 0 ? ZERO : kind === "brand" ? (
            <span className="inline-block rounded px-1.5 py-0.5" style={tint(v, maxCell)}>{num(v)}</span>
          ) : (
            num(v)
          )}
        </TableCell>
      ))}
      <TableCell className={cn(right, "font-semibold text-gray-900")}>{num(line.fytd)}</TableCell>
      <TableCell className={right}>{line.py === 0 ? ZERO : num(line.py)}</TableCell>
      <TableCell className={right}>{line.pct === null ? ZERO : `${line.pct}%`}</TableCell>
    </TableRow>
  );
}

export function FyTable({ view }: { view: FySpendView }) {
  return (
    <Table data-testid="fy-table">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(sticky, "bg-gray-50")}>Brand</TableHead>
          {view.monthLabels.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
          <TableHead className="text-right">FY to date</TableHead>
          <TableHead className="text-right">{`FY ${view.lastFyLabel} full year`}</TableHead>
          <TableHead className="text-right">{`% of FY ${view.lastFyLabel}`}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {view.groups.flatMap((g, gi) => [
          ...g.lines.map((l, li) => <Row key={`${gi}-${li}`} line={l} kind="brand" maxCell={view.maxCell} />),
          <Row key={`${gi}-total`} line={g.total} kind="total" maxCell={view.maxCell} />,
        ])}
        <Row line={view.grandTotal} kind="grand" maxCell={view.maxCell} />
      </TableBody>
    </Table>
  );
}
