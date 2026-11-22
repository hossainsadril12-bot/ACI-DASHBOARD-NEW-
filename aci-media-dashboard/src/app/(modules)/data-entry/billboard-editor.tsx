"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillboardData, BillboardRow } from "@/lib/ingest/readers/billboard";
import { formatTaka } from "@/lib/money";
import { BillDialogForm } from "./bill-dialog";
import { billsCaption, billsToShow, type ManualBusiness } from "./manual-drafts";

/** OOH / billboard bills (design 3.3). Keyed by version id: after a save it remounts with the stored list. */
export function BillboardEditor({ versionId, data, businesses, readOnly, query, onQuery }: {
  versionId: number | null; data: BillboardData; businesses: ManualBusiness[]; readOnly: boolean; query: string; onQuery: (q: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ row: BillboardRow | null } | null>(null);
  const { shown, matching } = billsToShow(data.rows, query, showAll);
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div>
          <CardTitle>OOH / billboard bills</CardTitle>
          <p className="text-sm text-gray-500">{billsCaption(data.rows.length)}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input aria-label="Search bills" placeholder="Vendor, PO, bill no, brand or location" value={query} className="w-full sm:w-72"
            onChange={(e) => onQuery(e.target.value)} />
          {!readOnly && <Button type="button" onClick={() => setEditing({ row: null })}>+ Add bill</Button>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <Table data-testid="manual-bills-table">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead><TableHead>Vendor</TableHead><TableHead>PO</TableHead><TableHead>Bill No</TableHead>
              <TableHead className="text-right">PO Amount</TableHead><TableHead className="text-right">Bill Amount</TableHead>
              <TableHead>Brand</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead>
              {!readOnly && <TableHead><span className="sr-only">Edit</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.sl}>
                <TableCell className="text-right tabular-nums">{r.sl}</TableCell>
                <TableCell className="font-medium">{r.v}</TableCell>
                <TableCell>{r.po}</TableCell>
                <TableCell>{r.bill}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTaka(r.poa)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTaka(r.ba)}</TableCell>
                <TableCell>{r.b}</TableCell>
                <TableCell>{r.loc}</TableCell>
                <TableCell>{r.status}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" aria-label={`Edit bill ${r.bill || `SL ${r.sl}`}`} onClick={() => setEditing({ row: r })}>Edit</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
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
