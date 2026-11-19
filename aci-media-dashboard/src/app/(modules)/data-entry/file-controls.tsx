"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilePreview } from "@/server/ingest";
import {
  MAX_NEW_BUSINESS_NAME, MAX_OWN_BRANDS, NEW_BUSINESS, addAllAsNew, brandMatches, brandPickValue, businessCountLine, businessRows, categoryDefaults,
  decisionValue, otherListName, sameAsOptions, setBusinessDecision, tickShown,
  type BrandDraft, type BusinessOption, type BusinessPick, type BusinessRow, type RowDraft,
} from "./logic";

// The Part C questions for one file (business, new businesses, new category, new brands). Moved from upload-box.tsx unchanged.

const SELECT = "h-9 w-full min-w-0 max-w-full shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm md:w-56";

/** A grey box under the row for list questions, lined up with the row's controls. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:ml-7">{children}</div>;
}

/** Visible businesses, then New business… with a name box. The name is sent when the box loses focus or on Enter. */
export function BusinessSelect({ label, newLabel, pick, businesses, disabled, onPick, onTyping, onCommit }: {
  label: string; newLabel: string; pick: BusinessPick; businesses: BusinessOption[]; disabled: boolean;
  onPick: (p: BusinessPick) => void; onTyping: (p: BusinessPick) => void; onCommit: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:flex-row">
      <select aria-label={label} value={pick.value} disabled={disabled} className={SELECT}
        onChange={(e) => onPick({ value: e.target.value, newName: e.target.value === NEW_BUSINESS ? pick.newName : "" })}>
        <option value="">Pick the business…</option>
        {businesses.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        <option value={NEW_BUSINESS}>New business…</option>
      </select>
      {pick.value === NEW_BUSINESS && (
        <Input aria-label={newLabel} value={pick.newName} maxLength={MAX_NEW_BUSINESS_NAME} disabled={disabled} className="md:w-56"
          onChange={(e) => onTyping({ value: NEW_BUSINESS, newName: e.target.value })}
          onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }} />
      )}
    </div>
  );
}

// Green: on the list or settled. Orange: still to decide. The tag says which, so colour is never the only signal.
const GREEN_ROW = "bg-emerald-50";
const ORANGE_ROW = "bg-orange-50";
const GREEN_TAG = "bg-emerald-100 text-emerald-800";
const ORANGE_TAG = "bg-orange-100 text-orange-800";
const ROW = "flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 md:flex-row md:items-center md:gap-3";

/** A row's name, its tag, and the list's name when it differs ("= Salt"). */
function NameTag({ name, tag, green, listName }: { name: string; tag: string; green: boolean; listName?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <p className="min-w-0 truncate text-sm text-gray-900" title={name}>{name}</p>
      <Badge className={green ? GREEN_TAG : ORANGE_TAG}>{tag}</Badge>
      {listName && <p className="min-w-0 truncate text-sm text-gray-500" title={listName}>= {listName}</p>}
    </div>
  );
}

const TAG: Record<BusinessRow["state"], string> = { new: "New", decided: "Decided", known: "On your list" };

export function NewBusinesses({ preview: p, draft, businesses, disabled, onDraft }: {
  preview: FilePreview; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; onDraft: (d: RowDraft) => void;
}) {
  const rows = businessRows(p, draft);
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words text-gray-900">Businesses in this file</p>
          <p className="text-xs text-gray-500">{businessCountLine(rows)}</p>
        </div>
        {p.newBusinesses.length >= 2 && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => onDraft({ ...draft, businesses: addAllAsNew(p, draft.businesses) })}>Add all as new</Button>
        )}
      </div>
      <ul className="space-y-2">
        {rows.map(({ name: n, state, listName }) => (
          <li key={n} className={`${ROW} ${state === "new" ? ORANGE_ROW : GREEN_ROW}`}>
            <NameTag name={n} tag={TAG[state]} green={state !== "new"} listName={listName} />
            {state !== "known" && (
              <select aria-label={`Decision for ${n}`} value={decisionValue(draft.businesses, n)} disabled={disabled} className={SELECT}
                onChange={(e) => onDraft({ ...draft, businesses: setBusinessDecision(draft.businesses, draft.bizNames, n, e.target.value) })}>
                <option value="">Decide…</option>
                {sameAsOptions(n, draft, businesses).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function NewCategory({ category, businesses, start, disabled, onAdd }: {
  category: NonNullable<FilePreview["newCategory"]>; businesses: BusinessOption[]; start: RowDraft["atl"]; disabled: boolean;
  onAdd: (atl: NonNullable<RowDraft["atl"]>) => void;
}) {
  const [picks, setPicks] = useState(() => start ?? categoryDefaults(category, businesses));
  const hasBusiness = picks.business.value === NEW_BUSINESS ? !!picks.business.newName.trim() : !!picks.business.value;
  const tooMany = picks.ownBrands.length > MAX_OWN_BRANDS;
  const ready = hasBusiness && picks.ownBrands.length > 0 && !tooMany;
  const toggle = (r: string, on: boolean) =>
    setPicks({ ...picks, ownBrands: on ? category.brands.filter((b) => b === r || picks.ownBrands.includes(b)) : picks.ownBrands.filter((b) => b !== r) });
  return (
    <Panel>
      <p className="text-sm font-medium break-words text-gray-900">New category found: {category.title}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">Business</p>
        <BusinessSelect label={`Business for category ${category.title}`} newLabel={`New business name for ${category.title}`} pick={picks.business} businesses={businesses}
          disabled={disabled}
          onPick={(b) => setPicks({ ...picks, business: b })}
          onTyping={(b) => setPicks({ ...picks, business: b })}
          onCommit={() => {}} />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-gray-500">Our brands</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {category.brands.map((r, k) => (
            <label key={`${k}-${r}`} className="flex min-w-0 max-w-full items-center gap-2 text-sm text-gray-900">
              <input type="checkbox" aria-label={`Our brand ${r}`} checked={picks.ownBrands.includes(r)} disabled={disabled}
                onChange={(e) => toggle(r, e.target.checked)} className="size-4 shrink-0 accent-primary" />
              <span className="min-w-0 truncate">{r}</span>
            </label>
          ))}
        </div>
        {tooMany && <p className="text-sm text-gray-500">Tick at most {MAX_OWN_BRANDS}.</p>}
      </fieldset>
      <Button size="sm" disabled={disabled || !ready} onClick={() => onAdd({ title: category.title, ...picks })}>Add category</Button>
    </Panel>
  );
}

/**
 * Review and add: a copy of the row's brands, saved by Done. fileBusiness: the row's business now (Digital, ATL),
 * shown instead of the name an earlier preview gave.
 */
export function NewBrands({ draft, known, businesses, disabled, fileBusiness, onDone }: {
  draft: RowDraft; known: FilePreview["knownBrands"]; businesses: BusinessOption[]; disabled: boolean; fileBusiness: string | null;
  onDone: (brands: BrandDraft[]) => void;
}) {
  const [rows, setRows] = useState<BrandDraft[]>(draft.brands);
  const [query, setQuery] = useState("");
  // A brand with no business on its row (OOH) picks one: visible businesses, or one this row adds.
  const adding = draft.bizNames.filter((n) => decisionValue(draft.businesses, n) === "add");
  const set = (k: number, b: Partial<BrandDraft>) => setRows(rows.map((x, j) => (j === k ? { ...x, ...b } : x)));
  const shown = rows.filter((b) => brandMatches(b, query)).length;
  const knownShown = known.filter((b) => brandMatches(b, query));
  const actions = (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" disabled={disabled || shown === 0} onClick={() => setRows(tickShown(rows, query))}>Tick all</Button>
      <Button size="sm" disabled={disabled} onClick={() => onDone(rows)}>Done</Button>
    </div>
  );
  return (
    <Panel>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Input type="search" aria-label="Search brands" placeholder="Search brands" value={query} className="md:w-64"
          onChange={(e) => setQuery(e.target.value)} />
        {actions}
      </div>
      {shown === 0 && knownShown.length === 0 && <p className="text-sm text-gray-500">No brand matches the search.</p>}
      <ul className="space-y-3">
        {rows.map((b, k) => {
          if (!brandMatches(b, query)) return null;
          const business = b.business !== null ? (fileBusiness ?? b.business) : null;
          return (
            <li key={b.name} className={`flex min-w-0 flex-col gap-2 rounded-md px-2 py-1.5 md:flex-row md:items-center md:gap-3 ${b.ticked ? GREEN_ROW : ORANGE_ROW}`}>
              <label className="flex min-w-0 items-center gap-2 text-sm text-gray-900 md:w-56">
                <input type="checkbox" aria-label={`Add ${b.name}`} checked={b.ticked} disabled={disabled}
                  onChange={(e) => set(k, { ticked: e.target.checked })} className="size-4 shrink-0 accent-primary" />
                <span className="min-w-0 truncate" title={b.name}>{b.name}</span>
                <Badge className={b.ticked ? GREEN_TAG : ORANGE_TAG}>{b.ticked ? "Will add" : "New"}</Badge>
              </label>
              <Input aria-label={`Full name for ${b.name}`} value={b.fullName} maxLength={120} disabled={disabled} className="md:flex-1"
                onChange={(e) => set(k, { fullName: e.target.value })} />
              {business !== null ? (
                <p className="min-w-0 truncate text-sm text-gray-500 md:w-56" title={business}>{business}</p>
              ) : (
                <select aria-label={`Business for ${b.name}`} value={brandPickValue(b.pick, draft)} disabled={disabled} className={SELECT}
                  onChange={(e) => set(k, { pick: e.target.value })}>
                  <option value="">Pick the business…</option>
                  {businesses.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                  {adding.map((n) => <option key={n} value={`new:${n}`}>{n}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {knownShown.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Already on your list ({knownShown.length})</p>
          <ul className="space-y-2">
            {knownShown.map((b) => (
              <li key={b.name} className={`${ROW} ${GREEN_ROW}`}>
                <NameTag name={b.name} tag="On your list" green listName={otherListName(b)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {shown > 0 && actions}
    </Panel>
  );
}
