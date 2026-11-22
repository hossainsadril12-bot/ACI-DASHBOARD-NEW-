"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { fyMonthLabels, fyName } from "@/lib/manual/rules";
import { saveFyAction } from "./actions";
import { AddBrandDialog } from "./add-brand-dialog";
import {
  addFyBrand, fyBrandGroups, fyBrandKey, fyDraft, fyInput, fyTable, isDirty, setFyAmount, type ManualBusiness,
} from "./manual-drafts";
import { SaveBar } from "./save-bar";

const SELECT = "h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** FY media spend (design 3.2). Edits to several brands stay in one draft until Save & publish or Discard changes. */
export function FyEditor({ versionId, fyStart, rows, businesses, readOnly, brand, onBrand }: {
  versionId: number | null; fyStart: number; rows: FyRow[]; businesses: ManualBusiness[]; readOnly: boolean;
  brand: string | null; onBrand: (key: string) => void;
}) {
  const [initial] = useState(() => fyDraft(rows));
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = fyBrandGroups(draft);
  const selected = groups.flatMap((g) => g.brands).find((x) => fyBrandKey(x) === brand) ?? groups[0]?.brands[0] ?? null;
  const months = fyMonthLabels(fyStart);

  const save = () => {
    const built = fyInput(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveFyAction({ baseVersionId: versionId, rows: built.rows, newBrands: built.newBrands });
      if (res.error) setError(res.error);
      else toast.success("FY media spend saved and published.");
    });
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {groups.length > 0 && (
            <select aria-label="FY brand" className={SELECT} value={selected ? fyBrandKey(selected) : ""} onChange={(e) => onBrand(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g.biz} label={g.biz}>
                  {g.brands.map((x) => <option key={fyBrandKey(x)} value={fyBrandKey(x)}>{x.b}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          {!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>+ Add brand</Button>}
        </div>
        <div>
          <CardTitle>{selected ? `FY media spend · ${selected.b}` : "FY media spend"}</CardTitle>
          {selected && <p className="text-sm text-gray-500">{`BDT Mn · ${selected.biz} · FY ${fyName(fyStart)} months Jul to Jun, plus the last FY total`}</p>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {selected ? (
          <Table data-testid="fy-table">
            <TableHeader>
              <TableRow>
                <TableHead>Media</TableHead>
                {months.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                <TableHead className="text-right">Last FY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fyTable(draft, selected).map((r) => (
                <TableRow key={r.med}>
                  <TableCell className="font-medium">{r.med}</TableCell>
                  {r.m.map((v, j) => (
                    <TableCell key={months[j]}>
                      <Input aria-label={`${r.med} ${months[j]}`} inputMode="decimal" value={v} disabled={readOnly} className="w-24 text-right tabular-nums"
                        onChange={(e) => setDraft((d) => setFyAmount(d, selected, r.med, j, e.target.value))} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Input aria-label={`${r.med} Last FY`} inputMode="decimal" value={r.py} disabled={readOnly} className="w-24 text-right tabular-nums"
                      onChange={(e) => setDraft((d) => setFyAmount(d, selected, r.med, "py", e.target.value))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-gray-500">{readOnly ? "No FY data yet." : "No brands yet. Add a brand to start."}</p>
        )}
      </CardContent>
      {!readOnly && (
        <>
          <SaveBar dirty={isDirty(draft, initial)} pending={pending} error={error} onSave={save}
            onDiscard={() => { setDraft(initial); setError(null); }} />
          <AddBrandDialog open={adding} onOpenChange={setAdding} draft={draft} businesses={businesses}
            onAdd={(b) => {
              setDraft((d) => addFyBrand(d, b));
              onBrand(fyBrandKey({ biz: b.businessName, b: b.name }));
              setAdding(false);
            }} />
        </>
      )}
    </Card>
  );
}
