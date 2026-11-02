import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/data/action-form";
import { EmptyState } from "@/components/data/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getThresholds, listBrandsWithRivals, listBusinesses, listTvStations, listVendors } from "@/server/master-data";
import { TEMPLATES, UPLOAD_KINDS } from "@/lib/upload/templates";
import {
  addRivalAction, createBrandAction, createTvStationAction, createVendorAction, removeRivalAction, setThresholdsAction,
} from "./actions";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SAMPLE_FILE_NOTES, sampleStatus } from "@/server/samples";
import { SampleDataCard } from "./sample-data-card";

export const metadata: Metadata = { title: "Settings" };
// Loading sample data runs many database writes; allow up to a minute on Vercel.
export const maxDuration = 60;

const selectClass = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Brands, rivals, vendors, TV stations, alert rules and templates" />
      <Suspense fallback={<PageSkeleton label="Loading settings" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await connection();
  const db = getDb();
  const [businesses, brands, vendors, stations, thresholds, samples] = await Promise.all([
    listBusinesses(db), listBrandsWithRivals(db), listVendors(db), listTvStations(db), getThresholds(db), sampleStatus(db),
  ]);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <SampleDataCard loaded={samples.loaded} brands={samples.brands} notes={SAMPLE_FILE_NOTES} />
        <Card>
          <CardHeader><CardTitle>Brands and rivals</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ActionForm action={createBrandAction} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Brand name" aria-label="Brand name" className="w-56" required />
              <select name="businessId" aria-label="Business" className={selectClass} required>
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <Button type="submit">Add brand</Button>
            </ActionForm>
            {brands.length === 0 ? (
              <EmptyState title="No brands yet" message="Add ACI's brands above. Each brand can track up to 3 rivals." />
            ) : (
              <ul className="divide-y divide-gray-200">
                {brands.map((b) => (
                  <li key={b.id} className="py-3" data-testid={`brand-${b.name}`}>
                    <p className="font-medium">{b.name} <span className="text-xs text-gray-500">· {b.businessName}</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {b.rivals.map((r) => (
                        <ActionForm key={r.id} action={removeRivalAction} className="inline-flex">
                          <input type="hidden" name="id" value={r.id} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                            {r.name}{" "}
                            <button type="submit" aria-label={`Remove rival ${r.name}`} className="ml-1 text-gray-500 hover:text-red-700">×</button>
                          </span>
                        </ActionForm>
                      ))}
                      {b.rivals.length < 3 && (
                        <ActionForm action={addRivalAction} className="flex gap-2">
                          <input type="hidden" name="brandId" value={b.id} />
                          <Input name="name" placeholder="Rival name" aria-label={`Rival for ${b.name}`} className="w-40" required />
                          <Button type="submit" size="sm" variant="outline">Add rival</Button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alert rules</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={setThresholdsAction} className="grid grid-cols-2 gap-3" resetOnSuccess={false}>
              {([
                ["billYellowDays", "Bill turns yellow after (days)"],
                ["billRedDays", "Bill turns red after (days)"],
                ["budgetOrangePct", "Budget turns orange at (%)"],
                ["budgetRedPct", "Budget turns red at (%)"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  {label}
                  <Input name={key} type="number" min={1} defaultValue={thresholds[key]} required />
                </label>
              ))}
              <Button type="submit" className="col-span-2 w-fit">Save alert rules</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Agencies and vendors</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ActionForm action={createVendorAction} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Vendor name" aria-label="Vendor name" className="w-56" required />
              <select name="kind" aria-label="Vendor type" className={selectClass}>
                <option value="agency">Agency</option>
                <option value="media">Media owner</option>
                <option value="other">Other</option>
              </select>
              <Button type="submit">Add vendor</Button>
            </ActionForm>
            <p className="text-sm text-gray-600">{vendors.length ? vendors.map((v) => v.name).join(", ") : "No vendors yet."}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>TV stations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ActionForm action={createTvStationAction} className="flex gap-2">
              <Input name="name" placeholder="TV station" aria-label="TV station name" className="w-56" required />
              <Button type="submit">Add station</Button>
            </ActionForm>
            <p className="text-sm text-gray-600">{stations.length ? stations.map((s) => s.name).join(", ") : "No TV stations yet."}</p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Excel templates</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {UPLOAD_KINDS.map((k) => (
              <a key={k} href={`/api/templates/${k}`} download className={buttonVariants({ variant: "secondary" })}>
                {TEMPLATES[k].title}
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
