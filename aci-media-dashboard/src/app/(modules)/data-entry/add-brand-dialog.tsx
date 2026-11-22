"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NEW_BRAND, brandChoices, brandToAdd, type BrandToAdd, type FyDraft, type ManualBusiness } from "./manual-drafts";

const SELECT = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm disabled:opacity-50";

/** "+ Add brand" (design 3.2): a business from the list, then one of its brands or a new name (added to the list on save). */
export function AddBrandDialog({ open, onOpenChange, draft, businesses, onAdd }: {
  open: boolean; onOpenChange: (open: boolean) => void; draft: FyDraft; businesses: ManualBusiness[]; onAdd: (b: BrandToAdd) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <AddBrandForm draft={draft} businesses={businesses} onAdd={onAdd} />}</DialogContent>
    </Dialog>
  );
}

function AddBrandForm({ draft, businesses, onAdd }: { draft: FyDraft; businesses: ManualBusiness[]; onAdd: (b: BrandToAdd) => void }) {
  const [pick, setPick] = useState({ businessSlug: "", brand: "", newName: "" });
  const [error, setError] = useState<string | null>(null);
  const business = businesses.find((b) => b.slug === pick.businessSlug);
  const add = () => {
    const r = brandToAdd(draft, businesses, pick);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onAdd(r.brand);
  };
  return (
    <>
      <DialogHeader><DialogTitle>Add brand</DialogTitle></DialogHeader>
      {businesses.length === 0 ? (
        <p className="text-sm text-gray-600">No businesses yet. Add one on <Link href="/businesses" className="text-primary underline underline-offset-2">Businesses & Brands</Link> first.</p>
      ) : (
        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5 font-medium">Business
            <select aria-label="Business" className={SELECT} value={pick.businessSlug}
              onChange={(e) => setPick({ businessSlug: e.target.value, brand: "", newName: "" })}>
              <option value="">Pick the business…</option>
              {businesses.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-medium">Brand
            <select aria-label="Brand" className={SELECT} value={pick.brand} disabled={!business}
              onChange={(e) => setPick((p) => ({ ...p, brand: e.target.value }))}>
              <option value="">Pick a brand…</option>
              {business && brandChoices(draft, business).map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={NEW_BRAND}>New brand…</option>
            </select>
          </label>
          {pick.brand === NEW_BRAND && (
            <label className="flex flex-col gap-1.5 font-medium">New brand name
              <Input aria-label="New brand name" value={pick.newName} maxLength={120} autoComplete="off"
                onChange={(e) => setPick((p) => ({ ...p, newName: e.target.value }))} />
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="button" onClick={add} disabled={businesses.length === 0}>Add</Button>
      </DialogFooter>
    </>
  );
}
