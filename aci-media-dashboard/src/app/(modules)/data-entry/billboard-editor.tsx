"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import { formatTaka } from "@/lib/money";
import { BillDialogForm } from "./bill-dialog";
import {
  ANY_MONTH, BILL_COLUMNS, DEFAULT_BILL_COLUMNS, billFilterActive, billsCaption, billsCount, billsToShow, parseBillColumns, readStoredColumns,
  submitMonthOptions, toggleBillColumn, writeBillColumns, type BillColumn, type BillRange, type ManualBusiness,
} from "./manual-drafts";

const SELECT = "h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** The cells the Columns menu can hide (view controls design 1.3). */
const CELLS: Record<BillColumn, { right: boolean; cell: (r: BillboardRow) => ReactNode }> = {
  po: { right: false, cell: (r) => r.po },
  bill: { right: false, cell: (r) => r.bill },
  poa: { right: true, cell: (r) => formatTaka(r.poa) },
  ba: { right: true, cell: (r) => formatTaka(r.ba) },
  b: { right: false, cell: (r) => r.b },
  loc: { right: false, cell: (r) => r.loc },
};

// The Columns ticks live in this browser. They are read on the client only, so the server render and the first paint use the
// default; a browser that refuses storage keeps the ticks for this page and is back on the default after a reload.
const columnListeners = new Set<() => void>();
const SERVER_COLUMNS: BillColumn[] = [...DEFAULT_BILL_COLUMNS];
let cachedColumns: { raw: string | null; columns: BillColumn[] } | null = null;
let unstoredColumns: BillColumn[] | null = null;
const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
/** The same array while the stored value is unchanged, as useSyncExternalStore needs. */
function columnsNow(): BillColumn[] {
  if (unstoredColumns) return unstoredColumns;
  const raw = readStoredColumns(browserStorage());
  if (!cachedColumns || cachedColumns.raw !== raw) cachedColumns = { raw, columns: parseBillColumns(raw) };
  return cachedColumns.columns;
}
function subscribeColumns(onChange: () => void): () => void {
  columnListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    columnListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function setColumns(columns: BillColumn[]): void {
  unstoredColumns = writeBillColumns(browserStorage(), columns) ? null : columns;
  columnListeners.forEach((f) => f());
}

/** OOH / billboard bills (design 3.3). Keyed by version id: after a save it remounts with the stored list. */
export function BillboardEditor({ versionId, data, businesses, readOnly, query, onQuery, range, onRange }: {
  versionId: number | null; data: BillboardData; businesses: ManualBusiness[]; readOnly: boolean; query: string; onQuery: (q: string) => void;
  range: BillRange; onRange: (r: BillRange) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ row: BillboardRow | null } | null>(null);
  const columns = useSyncExternalStore(subscribeColumns, columnsNow, () => SERVER_COLUMNS);
  const fromId = useId();
  const toId = useId();
  const { shown, matching } = billsToShow(data.rows, query, showAll, range);
  const months = submitMonthOptions(data.rows, range);
  const visible = BILL_COLUMNS.filter((c) => columns.includes(c.key));
  const span = 3 + visible.length + (readOnly ? 0 : 1); // SL, Vendor, Status, the ticked columns, and Edit for the admin
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>OOH / billboard bills</CardTitle>
          <p className="text-sm text-gray-500">{billsCaption(data.rows.length)}</p>
        </div>
        <div data-testid="bills-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
          <Input aria-label="Search bills" placeholder="Vendor, PO, bill no, brand or location" value={query} className="w-full sm:w-72"
            onChange={(e) => onQuery(e.target.value)} />
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-gray-600">
            <label htmlFor={fromId}>Submitted from</label>
            <select id={fromId} className={SELECT} value={range.from} onChange={(e) => onRange({ ...range, from: e.target.value })}>
              <option value={ANY_MONTH}>Any</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label htmlFor={toId}>to</label>
            <select id={toId} className={SELECT} value={range.to} onChange={(e) => onRange({ ...range, to: e.target.value })}>
              <option value={ANY_MONTH}>Any</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }))}>Columns</DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              {BILL_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem key={c.key} checked={columns.includes(c.key)}
                  onCheckedChange={(on) => setColumns(toggleBillColumn(columns, c.key, on))}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!readOnly && <Button type="button" onClick={() => setEditing({ row: null })}>+ Add bill</Button>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {billFilterActive(query, range) && <p className="text-sm text-gray-500">{billsCount(matching, data.rows.length)}</p>}
        <Table data-testid="manual-bills-table">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead>
              <TableHead>Vendor</TableHead>
              {visible.map((c) => <TableHead key={c.key} className={CELLS[c.key].right ? "text-right" : undefined}>{c.label}</TableHead>)}
              <TableHead>Status</TableHead>
              {!readOnly && <TableHead><span className="sr-only">Edit</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.sl}>
                <TableCell className="text-right tabular-nums">{r.sl}</TableCell>
                <TableCell className="font-medium">{r.v}</TableCell>
                {visible.map((c) => (
                  <TableCell key={c.key} className={CELLS[c.key].right ? "text-right tabular-nums" : undefined}>{CELLS[c.key].cell(r)}</TableCell>
                ))}
                <TableCell>{r.status}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" aria-label={`Edit bill ${r.bill || `SL ${r.sl}`}`} onClick={() => setEditing({ row: r })}>Edit</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {matching === 0 && data.rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={span} className="py-6 text-center text-gray-500">No bills match.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!showAll && matching > shown.length && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>{`Show all ${matching}`}</Button>
        )}
      </CardContent>
      {!readOnly && (
        <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            {editing && (
              <BillDialogForm key={editing.row?.sl ?? "new"} versionId={versionId} legend={data.legend} businesses={businesses} row={editing.row}
                onDone={() => setEditing(null)} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
