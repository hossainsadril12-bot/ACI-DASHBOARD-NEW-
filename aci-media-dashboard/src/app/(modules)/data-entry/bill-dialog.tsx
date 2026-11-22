"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BillboardRow } from "@/lib/ingest/readers/billboard";
import { dhakaDate } from "@/lib/manual/rules";
import { changeBillboardAction } from "./actions";
import { billForm, billInput, newBillForm, withCurrent, type BillForm, type ManualBusiness } from "./manual-drafts";

const SELECT = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm";

/** Add bill / Edit bill · SL n (design 3.3). Each save publishes the whole bill list; errors show in red here. */
export function BillDialogForm({ versionId, legend, businesses, row, onDone }: {
  versionId: number | null; legend: string[]; businesses: ManualBusiness[]; row: BillboardRow | null; onDone: () => void;
}) {
  const [f, setF] = useState<BillForm>(() => (row ? billForm(row) : newBillForm(legend, dhakaDate(new Date()))));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof BillForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const send = (change: Record<string, unknown>) =>
    startTransition(async () => {
      const res = await changeBillboardAction({ baseVersionId: versionId, ...change });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(res.summary ?? "Saved and published.");
      onDone();
    });
  const save = () => {
    const built = billInput(f);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    send(row ? { op: "edit", sl: row.sl, bill: built.bill } : { op: "add", bill: built.bill });
  };
  const remove = () => {
    if (!row || !confirm(`Delete bill ${row.bill || `SL ${row.sl}`}? You can bring it back from Upload History.`)) return;
    setError(null);
    send({ op: "delete", sl: row.sl });
  };

  const field = (k: keyof BillForm, label: string, extra: ComponentProps<"input"> = {}) => (
    <label className="flex min-w-0 flex-col gap-1 font-medium">
      {label}
      <Input aria-label={label} value={f[k]} onChange={set(k)} disabled={pending} {...extra} />
    </label>
  );

  return (
    <>
      <DialogHeader><DialogTitle>{row ? `Edit bill · SL ${row.sl}` : "Add bill"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("v", "Name of the Media / Vendor", { required: true, maxLength: 500 })}
        {field("po", "Purchase Order", { maxLength: 500 })}
        {field("bill", "Bill No", { maxLength: 500 })}
        {field("poa", "PO Amount", { inputMode: "decimal" })}
        {field("ba", "Bill Amount", { inputMode: "decimal" })}
        {field("diff", "Bill Difference (blank = PO − Bill)", { inputMode: "decimal" })}
        {field("st", "Start Date", { type: "date" })}
        {field("en", "End Date", { type: "date" })}
        <label className="flex min-w-0 flex-col gap-1 font-medium">Business
          <select aria-label="Business" className={SELECT} value={f.biz} onChange={set("biz")} disabled={pending}>
            <option value="">Not set</option>
            {withCurrent(businesses.map((b) => b.name), row?.biz ?? "").map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {field("b", "Brand", { maxLength: 500 })}
        {field("sb", "Submit Date", { type: "date" })}
        {field("pr", "Payment Request Date", { type: "date" })}
        {field("billc", "Bill", { maxLength: 500 })}
        {field("chq", "Cheque", { maxLength: 500 })}
        {field("loc", "Location", { maxLength: 500 })}
        <label className="flex min-w-0 flex-col gap-1 font-medium">Status
          <select aria-label="Status" className={SELECT} value={f.status} onChange={set("status")} disabled={pending}>
            {withCurrent(legend, row?.status ?? "").map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-medium sm:col-span-2">Comments
          <Textarea aria-label="Comments" value={f.cm} onChange={set("cm")} maxLength={2000} disabled={pending} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter className="gap-2">
        {row && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={remove} disabled={pending}>Delete bill</Button>}
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save & publish"}</Button>
      </DialogFooter>
    </>
  );
}
