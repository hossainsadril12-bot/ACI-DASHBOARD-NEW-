"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DIGITAL_BUSINESSES, isDigitalBusiness, type DigitalBusiness } from "@/lib/ingest/brands";
import { FILE_TYPE_LABEL, FILE_TYPES, isFileType, type FileType } from "@/lib/ingest/file-types";
import { cn } from "@/lib/utils";
import type { FilePreview } from "@/server/ingest";
import {
  canPublishAll, greyReason, postUploads, publishButtonLabel, publishedMessage, rowStatus, uploadForm, type RowStatus,
} from "./logic";

const CHIP: Record<RowStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-800" },
  "needs-type": { label: "Needs a type", className: "bg-amber-100 text-amber-900" },
  "needs-business": { label: "Needs a business", className: "bg-amber-100 text-amber-900" },
  blocked: { label: "Can't publish", className: "bg-red-100 text-red-800" },
};

type Choice = FileType | "";
type BusinessChoice = DigitalBusiness | "";

/** Several of his usual Excel files at once: one preview line per file, a type picker when unsure, then Publish. */
export function UploadBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0); // only the newest preview request may update the rows
  const [files, setFiles] = useState<File[]>([]);
  const [types, setTypes] = useState<Choice[]>([]);
  const [businesses, setBusinesses] = useState<BusinessChoice[]>([]);
  const [previews, setPreviews] = useState<FilePreview[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = checking || publishing;

  /** Previews every current file again, so batch rules (two files for one dataset) stay right. */
  async function check(nextFiles: File[], nextTypes: Choice[], nextBusinesses: BusinessChoice[], keepRows: boolean) {
    const id = ++latest.current;
    setFiles(nextFiles);
    setTypes(nextTypes);
    setBusinesses(nextBusinesses);
    setError(null);
    if (!keepRows) setPreviews(null);
    if (nextFiles.length === 0) return setChecking(false);
    setChecking(true);
    const res = await postUploads<{ previews: FilePreview[] }>("/api/uploads/preview", uploadForm(nextFiles, nextTypes, nextBusinesses));
    if (id !== latest.current) return;
    setChecking(false);
    if (res.error) {
      setError(res.error);
      setPreviews(null);
    } else {
      setPreviews(res.previews ?? []);
    }
  }

  function add(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    setLeftOut(chosen.filter((f) => f.size === 0).map((f) => f.name));
    const usable = chosen.filter((f) => f.size > 0); // the server refuses empty files
    if (usable.length === 0) return;
    const none = usable.map(() => "" as const);
    void check([...files, ...usable], [...types, ...none], [...businesses, ...none], false);
  }

  function clear() {
    latest.current++;
    setFiles([]);
    setTypes([]);
    setBusinesses([]);
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
      "/api/uploads/publish", uploadForm(files, types, businesses),
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
                if (checking && !p) return <SkeletonRow key={i} name={f.name} />;
                return (
                  <PreviewRow key={i} name={f.name} preview={p} choice={types[i] ?? ""} business={businesses[i] ?? ""} disabled={busy}
                    onType={(t) => void check(files, types.map((x, j) => (j === i ? t : x)),
                      businesses.map((x, j) => (j === i && t !== "digital" ? "" : x)), true)}
                    onBusiness={(b) => void check(files, types, businesses.map((x, j) => (j === i ? b : x)), true)}
                    onRemove={() => {
                      const keep = (_: unknown, j: number) => j !== i;
                      if (files.length === 1) clear();
                      else void check(files.filter(keep), types.filter(keep), businesses.filter(keep), false);
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

function PreviewRow({ name, preview: p, choice, business, disabled, onType, onBusiness, onRemove }: {
  name: string; preview: FilePreview | null; choice: Choice; business: BusinessChoice; disabled: boolean;
  onType: (t: Choice) => void; onBusiness: (b: BusinessChoice) => void; onRemove: () => void;
}) {
  const status = p ? rowStatus(p) : null;
  const grey = p ? greyReason(p) : null;
  const isDigital = (choice || p?.type) === "digital";
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
          className="h-9 w-full shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm md:w-56"
        >
          <option value="">Pick the file type…</option>
          {FILE_TYPES.map((t) => <option key={t} value={t}>{FILE_TYPE_LABEL[t]}</option>)}
        </select>
        {isDigital && (
          <select
            aria-label={`Business for ${name}`}
            value={business || p?.business || ""}
            disabled={disabled}
            onChange={(e) => onBusiness(isDigitalBusiness(e.target.value) ? e.target.value : "")}
            className="h-9 w-full shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm md:w-56"
          >
            <option value="">Pick the business…</option>
            {DIGITAL_BUSINESSES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
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
    </li>
  );
}
