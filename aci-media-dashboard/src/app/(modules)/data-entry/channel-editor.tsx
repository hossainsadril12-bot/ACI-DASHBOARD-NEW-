"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SegmentedButtons } from "@/components/data/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import { fyMonthLabels, type ChannelKey } from "@/lib/manual/rules";
import { saveChannelAction } from "./actions";
import {
  CHANNEL_TABS, addChannelRow, channelDraft, channelInput, isDirty, quarterMonths, removeChannelRow, setChannelAmount, setChannelName,
  type Quarter,
} from "./manual-drafts";
import { QuarterButtons } from "./quarter-buttons";
import { SaveBar } from "./save-bar";

/**
 * Channel cost (design 3.1). All three sheets are one draft and one save; edits survive switching sheets.
 * Keyed by its version id: a save re-renders the page with the new version, which remounts this with what was stored.
 * The quarter only picks which month columns show: the draft and the save always hold all 12 months.
 */
export function ChannelEditor({ versionId, fyStart, data, readOnly, sheet, onSheet, quarter, onQuarter }: {
  versionId: number | null; fyStart: number; data: ChannelData; readOnly: boolean; sheet: ChannelKey; onSheet: (k: ChannelKey) => void;
  quarter: Quarter; onQuarter: (q: Quarter) => void;
}) {
  const [initial] = useState(() => channelDraft(data));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const months = fyMonthLabels(fyStart);
  const shown = quarterMonths(quarter);
  const tab = CHANNEL_TABS.find((t) => t.key === sheet) ?? CHANNEL_TABS[0];
  const rows = draft[tab.key];

  const save = () => {
    const built = channelInput(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    // A server action from an event handler runs in a transition (next/dist/docs/01-app/02-guides/server-actions.md).
    startTransition(async () => {
      const res = await saveChannelAction({ baseVersionId: versionId, data: built.data });
      if (res.error) setError(res.error);
      else toast.success("Channel cost saved and published.");
    });
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <SegmentedButtons label="Channel cost sheets" items={CHANNEL_TABS.map(({ key, label }) => ({ key, label }))} value={tab.key} onChange={onSheet} />
          </div>
          <QuarterButtons value={quarter} onChange={onQuarter} />
        </div>
        <div>
          <CardTitle>{`Channel cost · ${tab.label}`}</CardTitle>
          <p className="text-sm text-gray-500">BDT · type amounts, add or remove rows, then Save & publish</p>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <Table data-testid="channel-table" className="w-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">SL</TableHead>
              <TableHead>{tab.column}</TableHead>
              {shown.map((j) => <TableHead key={months[j]} className="text-right">{months[j]}</TableHead>)}
              {!readOnly && <TableHead><span className="sr-only">Remove</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell className="text-right text-gray-500 tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <Input aria-label={`${tab.column} ${i + 1}`} value={r.n} maxLength={120} disabled={readOnly} className="w-48"
                    onChange={(e) => setDraft((d) => setChannelName(d, tab.key, r.key, e.target.value))} />
                </TableCell>
                {shown.map((j) => (
                  <TableCell key={months[j]}>
                    <Input aria-label={`${tab.column} ${i + 1} ${months[j]}`} inputMode="decimal" value={r.m[j]} disabled={readOnly} className="ml-auto w-28 text-right tabular-nums"
                      onChange={(e) => setDraft((d) => setChannelAmount(d, tab.key, r.key, j, e.target.value))} />
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${r.n.trim() || `${tab.column} ${i + 1}`}`}
                      onClick={() => setDraft((d) => removeChannelRow(d, tab.key, r.key))}>Remove</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft((d) => addChannelRow(d, tab.key, crypto.randomUUID()))}>{tab.add}</Button>
        )}
      </CardContent>
      {!readOnly && (
        <SaveBar dirty={isDirty(draft, initial)} pending={pending} error={error} onSave={save}
          onDiscard={() => { setDraft(initial); setError(null); }} />
      )}
    </Card>
  );
}
