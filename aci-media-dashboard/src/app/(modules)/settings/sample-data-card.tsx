"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, FlaskConical } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TEMPLATES, UPLOAD_KINDS, type UploadKind } from "@/lib/upload/templates";
import { loadSampleDataAction, removeSampleDataAction } from "./actions";

type Notes = Record<UploadKind, { page: string; href: string; change: string }>;

/** Load or remove sample records, and download sample Excel files that change the dashboard when uploaded. */
export function SampleDataCard({ loaded, brands, notes }: { loaded: boolean; brands: number; notes: Notes }) {
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = (action: typeof loadSampleDataAction) =>
    startTransition(async () => {
      const res = await action();
      setConfirmRemove(false);
      if (res.error) toast.error(res.error);
      else toast.success(res.message ?? "Done");
    });

  return (
    <Card className="xl:col-span-2" data-testid="sample-data">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary" aria-hidden><FlaskConical className="size-[18px]" /></span>
          <div>
            <CardTitle>Sample data</CardTitle>
            <p className="max-w-2xl text-xs text-gray-500">
              Fill the dashboard with 4 sample brands, their rivals, campaigns, budgets, spend, results and bills, so every page has something to show.
              Every sample name ends with &quot;(Sample)&quot; and sample bills start with SMP-, so they never mix with real data.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loaded ? (
            <>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{brands} sample brands loaded</span>
              <Button variant="outline" disabled={pending} onClick={() => (confirmRemove ? run(removeSampleDataAction) : setConfirmRemove(true))}>
                {pending ? "Removing…" : confirmRemove ? "Click again to remove" : "Remove sample data"}
              </Button>
            </>
          ) : (
            <Button disabled={pending} onClick={() => run(loadSampleDataAction)}>{pending ? "Loading… (up to a minute)" : "Load sample data"}</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-gray-900">Try an upload</p>
        <p className="text-xs text-gray-500">
          {loaded ? "Download a file, open the page it belongs to, and upload it with Upload Excel. The numbers on that page change." : "Load the sample data first. These files use the sample brands."}
        </p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {UPLOAD_KINDS.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{TEMPLATES[k].title}</p>
                <p className="text-xs text-gray-500">
                  Upload on <Link href={notes[k].href} className="font-medium text-primary hover:underline">{notes[k].page}</Link>. {notes[k].change}
                </p>
              </div>
              <a href={`/api/samples/${k}`} download aria-label={`Download sample ${TEMPLATES[k].title} file`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <Download aria-hidden />Sample file
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
