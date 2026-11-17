"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FILE_TYPE_LABEL, FILE_TYPES, isFileType, type FileType } from "@/lib/ingest/file-types";
import { cn } from "@/lib/utils";
import type { FilePreview } from "@/server/ingest";
import {
  MAX_NEW_BUSINESS_NAME, MAX_OWN_BRANDS, NEW_BUSINESS, addAllAsNew, canPublishAll, categoryDefaults, decisionValue, emptyDraft,
  greyReason, postUploads, publishButtonLabel, publishedMessage, rowStatus, sameAsOptions, seenBrands, seenNames, setBusinessDecision,
  toDecisions, uploadForm, type BrandDraft, type BusinessOption, type BusinessPick, type RowDraft, type RowStatus,
} from "./logic";

const AMBER = "bg-amber-100 text-amber-900";
const CHIP: Record<RowStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-800" },
  "needs-type": { label: "Needs a type", className: AMBER },
  "needs-business": { label: "Needs a business", className: AMBER },
  "new-business": { label: "New business", className: AMBER },
  "new-category": { label: "New category", className: AMBER },
  blocked: { label: "Can't publish", className: "bg-red-100 text-red-800" },
};

const SELECT = "h-9 w-full shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm md:w-56";

type Choice = FileType | "";

/** Several of his usual Excel files at once: one preview line per file, a type picker when unsure, then Publish. */
export function UploadBox({ businesses }: { businesses: BusinessOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0); // only the newest preview request may update the rows
  const sent = useRef(""); // the decisions the rows on screen were previewed with
  const nextId = useRef(0);
  const [ids, setIds] = useState<number[]>([]); // a stable React key per row, so a row's open panels follow it
  const [files, setFiles] = useState<File[]>([]);
  const [types, setTypes] = useState<Choice[]>([]);
  const [drafts, setDrafts] = useState<RowDraft[]>([]);
  const [previews, setPreviews] = useState<FilePreview[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = checking || publishing;

  const decisionsOf = (ds: RowDraft[]) => ds.map((d) => toDecisions(d, businesses));

  /** Previews every current file again, so batch rules (two files for one dataset) stay right. */
  async function check(nextFiles: File[], nextTypes: Choice[], nextDrafts: RowDraft[], keepRows: boolean) {
    const id = ++latest.current;
    const decisions = decisionsOf(nextDrafts);
    sent.current = JSON.stringify(decisions);
    setFiles(nextFiles);
    setTypes(nextTypes);
    setDrafts(nextDrafts);
    setError(null);
    if (!keepRows) setPreviews(null);
    if (nextFiles.length === 0) return setChecking(false);
    setChecking(true);
    const res = await postUploads<{ previews: FilePreview[] }>("/api/uploads/preview", uploadForm(nextFiles, nextTypes, decisions));
    if (id !== latest.current) return;
    setChecking(false);
    if (res.error) {
      setError(res.error);
      setPreviews(null);
      return;
    }
    const list = res.previews ?? [];
    setPreviews(list);
    // Names the server no longer asks about (decided) stay on screen so the admin can change them.
    setDrafts(nextDrafts.map((d, i) => (list[i] ? { ...d, bizNames: seenNames(d.bizNames, list[i]), brands: seenBrands(d.brands, list[i]) } : d)));
  }

  /** Keeps a row's draft; previews again when what would be sent changed. */
  function apply(next: RowDraft[]) {
    if (JSON.stringify(decisionsOf(next)) !== sent.current) void check(files, types, next, true);
    else setDrafts(next);
  }
  const setDraft = (i: number, d: RowDraft) => apply(drafts.map((x, j) => (j === i ? d : x)));
  const typeDraft = (i: number, d: RowDraft) => setDrafts(drafts.map((x, j) => (j === i ? d : x))); // typing: sent on blur

  function add(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    setLeftOut(chosen.filter((f) => f.size === 0).map((f) => f.name));
    const usable = chosen.filter((f) => f.size > 0); // the server refuses empty files
    if (usable.length === 0) return;
    setIds([...ids, ...usable.map(() => ++nextId.current)]);
    void check([...files, ...usable], [...types, ...usable.map(() => "" as const)], [...drafts, ...usable.map(emptyDraft)], false);
  }

  function clear() {
    latest.current++;
    sent.current = "";
    setIds([]);
    setFiles([]);
    setTypes([]);
    setDrafts([]);
    setPreviews(null);
    setChecking(false);
    setError(null);
    setLeftOut([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const res = await postUploads<{ published: { datasetKey: string; label: string; versionId: number }[] }>(
      "/api/uploads/publish", uploadForm(files, types, decisionsOf(drafts)),
    );
    setPublishing(false);
    if (res.error) return setError(res.error);
    toast.success(publishedMessage(res.published ?? []));
    clear();
    router.refresh();
  }

  const rowsReady = previews !== null && previews.length === files.length;
  const canPublish = canPublishAll(previews, files.length) && !busy;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div
          data-testid="upload-drop"
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) add(e.dataTransfer.files); }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-accent" : "border-gray-300 bg-gray-50",
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-white text-primary shadow-xs ring-1 ring-gray-200" aria-hidden>
            <Upload className="size-5" />
          </span>
          <p className="font-medium text-gray-900">Drop Excel files here</p>
          <p className="max-w-md text-sm text-gray-500">Drop one or more of your usual Excel files. No templates needed.</p>
          <Button variant="secondary" className="mt-1" disabled={busy} onClick={() => inputRef.current?.click()}>Choose files</Button>
          <input ref={inputRef} type="file" multiple accept=".xlsx" tabIndex={-1} aria-label="Choose Excel files" className="sr-only"
            onChange={(e) => add(e.target.files)} />
        </div>

        {leftOut.length > 0 && <p className="text-sm text-amber-800">{leftOut.join(", ")} {leftOut.length === 1 ? "is" : "are"} empty and left out.</p>}

        {files.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {checking && <span role="status" className="sr-only">Checking the files…</span>}
            <ul className={cn("divide-y divide-gray-200", checking && rowsReady && "opacity-60")} aria-busy={checking}>
              {files.map((f, i) => {
                const p = rowsReady && previews ? previews[i] : null;
                if (checking && !p) return <SkeletonRow key={ids[i] ?? `f${i}`} name={f.name} />;
                return (
                  <PreviewRow key={ids[i] ?? `f${i}`} name={f.name} preview={p} choice={types[i] ?? ""} draft={drafts[i] ?? emptyDraft()}
                    businesses={businesses} disabled={busy}
                    onType={(t) => void check(files, types.map((x, j) => (j === i ? t : x)), drafts.map((x, j) => (j === i ? emptyDraft() : x)), true)}
                    onDraft={(d) => setDraft(i, d)}
                    onTyping={(d) => typeDraft(i, d)}
                    onCommit={() => apply(drafts)}
                    onRemove={() => {
                      const keep = (_: unknown, j: number) => j !== i;
                      if (files.length === 1) return clear();
                      setIds(ids.filter(keep));
                      void check(files.filter(keep), types.filter(keep), drafts.filter(keep), false);
                    }} />
                );
              })}
            </ul>
            <div className="space-y-3 border-t border-gray-200 bg-gray-50/60 px-4 py-3">
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={clear} disabled={publishing}>Cancel</Button>
                <Button onClick={() => void publish()} disabled={!canPublish}>{publishing ? "Publishing…" : publishButtonLabel(files.length)}</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonRow({ name }: { name: string }) {
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-300" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm text-gray-500">{name}</p>
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:pl-7">
        <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100 md:w-56" />
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-gray-100" />
      </div>
    </li>
  );
}

type RowProps = {
  name: string; preview: FilePreview | null; choice: Choice; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean;
  onType: (t: Choice) => void; onDraft: (d: RowDraft) => void; onTyping: (d: RowDraft) => void; onCommit: () => void; onRemove: () => void;
};

function PreviewRow({ name, preview: p, choice, draft, businesses, disabled, onType, onDraft, onTyping, onCommit, onRemove }: RowProps) {
  const [lastCategory, setLastCategory] = useState<RowDraft["atl"]>(null); // the picks before Change, to start the block from
  const status = p ? rowStatus(p) : null;
  const grey = p ? greyReason(p) : null;
  const type = choice || p?.type;
  const pick: BusinessPick = draft.business.value ? draft.business : { value: p?.business?.slug ?? "", newName: "" };
  const categoryAdded = type === "atl" && draft.atl && p && !p.newCategory;
  return (
    <li data-testid="preview-row" className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="size-4 shrink-0 text-gray-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900" title={name}>{name}</p>
        {status && <Badge className={CHIP[status].className}>{CHIP[status].label}</Badge>}
        <Button variant="ghost" size="xs" disabled={disabled} aria-label={`Remove ${name}`} onClick={onRemove}>Remove</Button>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4 md:pl-7">
        <select
          aria-label={`File type for ${name}`}
          value={choice || p?.type || ""}
          disabled={disabled || p?.detection?.status === "none"} // not one of his files: no type makes it publishable
          onChange={(e) => onType(isFileType(e.target.value) ? e.target.value : "")}
          className={SELECT}
        >
          <option value="">Pick the file type…</option>
          {FILE_TYPES.map((t) => <option key={t} value={t}>{FILE_TYPE_LABEL[t]}</option>)}
        </select>
        {type === "digital" && (
          <BusinessSelect label={`Business for ${name}`} newLabel={`New business name for ${name}`} pick={pick} businesses={businesses}
            disabled={disabled}
            onPick={(b) => onDraft({ ...draft, business: b })}
            onTyping={(b) => onTyping({ ...draft, business: b })}
            onCommit={onCommit} />
        )}
        {p?.label && (
          <div className="min-w-0 text-sm">
            <p className="text-gray-900">{p.label}</p>
            {p.summary && <p className="text-xs text-gray-500">{p.summary}</p>}
          </div>
        )}
      </div>
      {p && (p.errors.length > 0 || p.warnings.length > 0 || grey) && (
        <div className="space-y-1 text-sm md:pl-7">
          {p.errors.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-red-700">{p.errors.map((m, k) => <li key={k}>{m}</li>)}</ul>}
          {p.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-amber-800">{p.warnings.map((m, k) => <li key={k}>{m}</li>)}</ul>}
          {grey && <p className="text-gray-500">{grey}</p>}
        </div>
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
      {p && draft.brands.length > 0 && (
        <NewBrands draft={draft} businesses={businesses} disabled={disabled} onDraft={onDraft} />
      )}
    </li>
  );
}

/** A grey box under the row for list questions, lined up with the row's controls. */
function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:ml-7">{children}</div>;
}

/** Visible businesses, then New business… with a name box. The name is sent when the box loses focus or on Enter. */
function BusinessSelect({ label, newLabel, pick, businesses, disabled, onPick, onTyping, onCommit }: {
  label: string; newLabel: string; pick: BusinessPick; businesses: BusinessOption[]; disabled: boolean;
  onPick: (p: BusinessPick) => void; onTyping: (p: BusinessPick) => void; onCommit: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
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

function NewBusinesses({ preview: p, draft, businesses, disabled, onDraft }: {
  preview: FilePreview; draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; onDraft: (d: RowDraft) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">New businesses in this file</p>
        {p.newBusinesses.length >= 2 && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => onDraft({ ...draft, businesses: addAllAsNew(p, draft.businesses) })}>Add all as new</Button>
        )}
      </div>
      <ul className="space-y-2">
        {draft.bizNames.map((n) => (
          <li key={n} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-gray-900" title={n}>{n}</p>
            <select aria-label={`Decision for ${n}`} value={decisionValue(draft.businesses, n)} disabled={disabled} className={SELECT}
              onChange={(e) => onDraft({ ...draft, businesses: setBusinessDecision(draft.businesses, draft.bizNames, n, e.target.value) })}>
              <option value="">Decide…</option>
              {sameAsOptions(n, draft, businesses).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function NewCategory({ category, businesses, start, disabled, onAdd }: {
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
      <p className="text-sm font-medium text-gray-900">New category found: {category.title}</p>
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">Business</p>
        <BusinessSelect label="Business" newLabel={`New business name for ${category.title}`} pick={picks.business} businesses={businesses}
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

function NewBrands({ draft, businesses, disabled, onDraft }: {
  draft: RowDraft; businesses: BusinessOption[]; disabled: boolean; onDraft: (d: RowDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BrandDraft[]>([]);
  // A brand with no business on its row (OOH) picks one: visible businesses, or one this row adds.
  const adding = draft.bizNames.filter((n) => decisionValue(draft.businesses, n) === "add");
  const set = (k: number, b: Partial<BrandDraft>) => setRows(rows.map((x, j) => (j === k ? { ...x, ...b } : x)));
  if (!open) {
    return (
      <div className="md:pl-7">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => { setRows(draft.brands); setOpen(true); }}>Review and add</Button>
      </div>
    );
  }
  return (
    <Panel>
      <ul className="space-y-3">
        {rows.map((b, k) => (
          <li key={b.name} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="flex min-w-0 items-center gap-2 text-sm text-gray-900 sm:w-40">
              <input type="checkbox" aria-label={`Add ${b.name}`} checked={b.ticked} disabled={disabled}
                onChange={(e) => set(k, { ticked: e.target.checked })} className="size-4 shrink-0 accent-primary" />
              <span className="min-w-0 truncate" title={b.name}>{b.name}</span>
            </label>
            <Input aria-label={`Full name for ${b.name}`} value={b.fullName} maxLength={120} disabled={disabled} className="sm:flex-1"
              onChange={(e) => set(k, { fullName: e.target.value })} />
            {b.business !== null ? (
              <p className="min-w-0 truncate text-sm text-gray-500 sm:w-56" title={b.business}>{b.business}</p>
            ) : (
              <select aria-label={`Business for ${b.name}`} value={b.pick} disabled={disabled} className={SELECT}
                onChange={(e) => set(k, { pick: e.target.value })}>
                <option value="">Pick the business…</option>
                {businesses.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                {adding.map((n) => <option key={n} value={`new:${n}`}>{n}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setRows(rows.map((x) => ({ ...x, ticked: true })))}>Tick all</Button>
        <Button size="sm" disabled={disabled} onClick={() => { setOpen(false); onDraft({ ...draft, brands: rows }); }}>Done</Button>
      </div>
    </Panel>
  );
}
