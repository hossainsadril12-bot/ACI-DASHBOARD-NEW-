"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FileType } from "@/lib/ingest/file-types";
import type { FilePreview } from "@/server/ingest";
import { BusinessSelect, NewBrands, NewBusinesses, NewCategory, Panel } from "./file-controls";
import { brandWarning, greyReason, rowStatus, underFileBusiness, type BusinessOption, type BusinessPick, type RowDraft, type RowStatus } from "./logic";

const AMBER = "bg-amber-100 text-amber-900";
const CHIP: Record<RowStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-800" },
  "needs-business": { label: "Needs a business", className: AMBER },
  "new-business": { label: "New business", className: AMBER },
  "new-category": { label: "New category", className: AMBER },
  blocked: { label: "Can't publish", className: "bg-red-100 text-red-800" },
};

/** A file while the server reads it. */
export function SkeletonBlock({ name }: { name: string }) {
  return (
    <li className="min-w-0 space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-300" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm text-gray-500">Reading {name}…</p>
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="h-9 animate-pulse rounded-lg bg-gray-100 md:ml-7" />
    </li>
  );
}

export type FileBlockProps = {
  name: string; cardType: FileType; fixedBusiness: boolean; preview: FilePreview | null; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean;
  /** The businesses offered for the file's own business (default: businesses); the other questions offer every business. */
  pickBusinesses?: BusinessOption[];
  onDraft: (d: RowDraft) => void; onTyping: (d: RowDraft) => void; onCommit: () => void; onRemove: (() => void) | null;
};

/**
 * One file in the Check before publishing dialog (spec 3.4): what was read, the warnings to check, the errors, and
 * the Part C questions. The card decides the type, so there is no type select. The business is asked only on the
 * Digital card for another business.
 */
export function FileBlock({ name, cardType, fixedBusiness, preview: p, draft, businesses, pickBusinesses, disabled, onDraft, onTyping, onCommit, onRemove }: FileBlockProps) {
  const [lastCategory, setLastCategory] = useState<RowDraft["atl"]>(null); // the picks before Change, to start the block from
  const [reviewing, setReviewing] = useState(false); // the Review and add panel is open
  const brandLine = p ? brandWarning(p) : null;
  const reviewButton = (
    <Button variant="outline" size="xs" disabled={disabled} className="ml-2 align-middle" onClick={() => setReviewing(true)}>Review and add</Button>
  );
  const status = p ? rowStatus(p) : null;
  const grey = p ? greyReason(p) : null;
  const askBusiness = cardType === "digital" && (!fixedBusiness || !!p?.needsBusiness);
  const pick: BusinessPick = draft.business.value ? draft.business : { value: p?.business?.slug ?? "", newName: "" };
  // The picker's list; a business the server took from the brands stays shown even when it is not offered.
  const pickList = pickBusinesses && !pickBusinesses.some((b) => b.slug === pick.value)
    ? [...pickBusinesses, ...businesses.filter((b) => b.slug === pick.value)]
    : (pickBusinesses ?? businesses);
  const categoryAdded = cardType === "atl" && draft.atl && p && !p.newCategory;
  return (
    <li data-testid="preview-row" className="min-w-0 space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900" title={name}>{name}</p>
        {status && <Badge className={CHIP[status].className}>{CHIP[status].label}</Badge>}
        {onRemove && <Button variant="ghost" size="xs" disabled={disabled} aria-label={`Remove ${name}`} onClick={onRemove}>Remove</Button>}
      </div>
      {(askBusiness || p?.label) && (
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:gap-4 md:pl-7">
          {askBusiness && (
            <BusinessSelect label={`Business for ${name}`} newLabel={`New business name for ${name}`} pick={pick} businesses={pickList}
              disabled={disabled}
              onPick={(b) => onDraft({ ...draft, business: b })}
              onTyping={(b) => onTyping({ ...draft, business: b })}
              onCommit={onCommit} />
          )}
          {p?.label && (
            <div className="min-w-0 text-sm">
              <p className="text-xs font-medium text-gray-500">What was read</p>
              <p className="break-words text-gray-900">{p.label}</p>
              {p.summary && <p className="text-xs text-gray-500">{p.summary}</p>}
            </div>
          )}
        </div>
      )}
      {p && (p.errors.length > 0 || p.warnings.length > 0 || grey) && (
        <div className="min-w-0 space-y-1 text-sm break-words md:pl-7">
          {p.errors.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-red-700">{p.errors.map((m, k) => <li key={k}>{m}</li>)}</ul>}
          {p.warnings.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-gray-500">Please check</p>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
                {p.warnings.map((m, k) => <li key={k}>{m}{m === brandLine && !reviewing && reviewButton}</li>)}
              </ul>
            </div>
          )}
          {grey && <p className="text-gray-500">{grey}</p>}
        </div>
      )}
      {brandLine && !reviewing && !p?.warnings.includes(brandLine) && <div className="md:pl-7">{reviewButton}</div>}
      {p && reviewing && (
        <NewBrands draft={draft} businesses={businesses} disabled={disabled}
          fileBusiness={underFileBusiness(draft) ? (p.business?.name ?? null) : null}
          onDone={(brands) => { setReviewing(false); onDraft({ ...draft, brands }); }} />
      )}
      {p && draft.bizNames.length > 0 && (
        <NewBusinesses preview={p} draft={draft} businesses={businesses} disabled={disabled} onDraft={onDraft} />
      )}
      {p?.newCategory && (
        <NewCategory key={p.newCategory.title} category={p.newCategory} businesses={businesses} disabled={disabled}
          start={lastCategory?.title === p.newCategory.title ? lastCategory : null}
          onAdd={(atl) => onDraft({ ...draft, atl })} />
      )}
      {categoryAdded && draft.atl && (
        <Panel>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="min-w-0 flex-1 text-gray-700">
              New category {draft.atl.title}, under {p.business?.name ?? draft.atl.business.newName}. Our brands: {draft.atl.ownBrands.join(", ")}.
            </p>
            <Button variant="outline" size="sm" disabled={disabled}
              onClick={() => { setLastCategory(draft.atl); onDraft({ ...draft, atl: null }); }}>Change</Button>
          </div>
        </Panel>
      )}
    </li>
  );
}
