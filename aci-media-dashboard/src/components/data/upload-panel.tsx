"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TEMPLATES, type UploadKind } from "@/lib/upload/templates";
import { cn } from "@/lib/utils";
import { formatMonth } from "@/lib/month";
import { usePathname, useRouter } from "next/navigation";
import type { CheckStatus, UploadPreview } from "@/server/uploads";
import { confirmUploadAction, previewUploadAction } from "@/app/(modules)/uploads/actions";

const CHIP: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "Passed", className: "bg-emerald-100 text-emerald-800" },
  review: { label: "Review", className: "bg-amber-100 text-amber-900" },
  fail: { label: "Failed", className: "bg-red-100 text-red-800" },
};

/** `viewMonth`: the month the page shows; after saving a file for other months, offer to open them. */
export function UploadPanel({ kind, viewMonth }: { kind: UploadKind; viewMonth?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const def = TEMPLATES[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Closed until needed, so each page shows one "Upload Excel" choice instead of a large drop area (Hick's law).
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const formFor = (f: File) => {
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", f);
    return fd;
  };

  function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setAccept(false);
    setError(null);
    startTransition(async () => {
      const res = await previewUploadAction(formFor(f));
      if (res.error) setError(res.error);
      else setPreview(res.preview ?? null);
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setAccept(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    setOpen(false);
  }

  function confirm() {
    if (!file) return;
    const fd = formFor(file);
    if (accept) fd.set("acceptMismatch", "on");
    startTransition(async () => {
      const res = await confirmUploadAction(fd);
      if (res.error) return setError(res.error);
      const r = res.result!;
      const saved = `Saved as version ${r.uploadId}: ${r.inserted} added${r.skippedManual ? `, ${r.skippedManual} kept as manual edits` : ""}`;
      const other = viewMonth && r.periods.length && !r.periods.includes(viewMonth) ? r.periods[0] : null;
      if (other) {
        // The rows went to a month that is not on screen; without this the page looks unchanged.
        toast.success(`${saved} for ${formatMonth(other)}`, {
          duration: 12_000,
          action: {
            label: `Show ${formatMonth(other)}`,
            onClick: () => {
              const q = new URLSearchParams(window.location.search);
              q.set("month", other);
              router.push(`${pathname}?${q.toString()}`);
            },
          },
        });
      } else {
        toast.success(saved);
      }
      reset();
    });
  }

  const mismatch = preview?.totals.status === "mismatch";
  const canConfirm = Boolean(preview?.ok) && (!mismatch || accept) && !pending;

  const expanded = open || Boolean(file);

  return (
    <Card data-testid={`upload-${kind}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary" aria-hidden><FileSpreadsheet className="size-[18px]" /></span>
          <div>
            <CardTitle>Upload {def.title.charAt(0).toLowerCase() + def.title.slice(1)} (Excel)</CardTitle>
            <p className="text-xs text-gray-500">Add many rows at once from the template. Every file is checked before it is saved.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/api/templates/${kind}`} download className={buttonVariants({ variant: "ghost", size: "sm" })}>Download template</a>
          <Button size="sm" variant="secondary" aria-expanded={expanded} onClick={() => (expanded ? reset() : setOpen(true))}>
            {expanded ? "Close" : <><Upload aria-hidden />Upload Excel</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" hidden={!expanded}>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors",
            dragging ? "border-primary bg-accent" : "border-gray-300 bg-gray-50 hover:border-primary/60 hover:bg-accent/50",
          )}
        >
          <Upload className="mb-1 size-5 text-gray-400" aria-hidden />
          <span className="font-medium">{file ? file.name : "Drop an Excel file here, or click to choose"}</span>
          <span className="text-xs text-gray-500">.xlsx, .xls or .csv · up to 4 MB · use the template columns · optional TOTAL row to check sums</span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" aria-label={`Choose ${def.title} file`} className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])} />
        </label>

        {pending && !preview && <p className="text-sm text-gray-500">Checking the file…</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        {preview && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium">Automatic checks</h3>
              <ul className="space-y-1" aria-label="Upload checks">
                {preview.checks.map((c) => (
                  <li key={c.label} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn("w-16 rounded-full px-2 py-0.5 text-center text-xs", CHIP[c.status].className)}>{CHIP[c.status].label}</span>
                    <span className="font-medium">{c.label}</span>
                    {c.detail && <span className="text-gray-500">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {preview.errors.length > 0 && (
              <div className="max-h-60 overflow-auto rounded border border-red-200">
                <Table aria-label="Row problems">
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Column</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.errors.map((e, i) => (
                      <TableRow key={i}><TableCell>{e.row}</TableCell><TableCell>{e.column}</TableCell><TableCell>{e.message}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {preview.sample.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-gray-600">Preview first {Math.min(5, preview.sample.length)} of {preview.rowCount} rows</summary>
                <div className="mt-2 overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>{def.columns.map((c) => <TableHead key={c.key}>{c.header}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>
                      {preview.sample.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>{def.columns.map((c) => <TableCell key={c.key}>{r[c.key] ?? ""}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )}

            {mismatch && (
              <label className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5" />
                I checked the file. The rows are correct and the TOTAL row is wrong.
              </label>
            )}

            <div className="flex gap-2">
              <Button onClick={confirm} disabled={!canConfirm}>{pending ? "Saving…" : "Confirm and save"}</Button>
              <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
            </div>
            {!preview.ok && <p className="text-sm text-red-700">Fix the failed checks in the file, then upload it again.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
