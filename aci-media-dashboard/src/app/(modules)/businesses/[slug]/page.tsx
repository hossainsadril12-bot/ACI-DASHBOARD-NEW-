import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import {
  createBrandAction, renameBrandAction, setAtlCategoryAction, setAtlHiddenAction, setBrandHiddenAction, setBusinessHiddenAction,
} from "../actions";
import { FormDialog, HideToggle } from "../catalog-controls";
import { HiddenTag, NameField } from "../fields";

export const metadata: Metadata = { title: "Businesses & Brands" };

type Params = Promise<{ slug: string }>;

const selectClass = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm font-normal";

export default function BusinessPage({ params }: { params: Params }) {
  return (
    <>
      <Link href="/businesses" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="size-4" aria-hidden />
        Businesses & Brands
      </Link>
      <Suspense fallback={<PageSkeleton label="Loading business" />}>
        <BusinessContent params={params} />
      </Suspense>
    </>
  );
}

async function BusinessContent({ params }: { params: Params }) {
  await connection();
  const { slug } = await params;
  const admin = await isAdmin(); // one cookie read; viewers get no buttons and no dialogs
  const catalog = await getCatalog(await getStore());
  const biz = catalog.businesses.find((b) => b.slug === slug);
  if (!biz) notFound();

  const brands = catalog.brands.filter((b) => b.businessSlug === slug);
  const atl = catalog.atl.filter((a) => a.businessSlug === slug);
  // Where an ATL category can move: the visible businesses, plus this one even when hidden
  // (the store refuses a move onto a hidden business, but staying put is fine).
  const targets = catalog.businesses.filter((b) => !b.hidden || b.slug === slug);
  const others = biz.names.slice(1);

  return (
    <>
      <PageHeader title={biz.name} subtitle={others.length ? `Also matches: ${others.join(", ")}` : undefined}>
        {biz.hidden && <HiddenTag />}
        {/* A hidden business takes no new brands (the store refuses them), so offer Show instead of Add brand. */}
        {admin && biz.hidden && (
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500">This business is hidden. Show it to add brands.</p>
            <HideToggle action={setBusinessHiddenAction} fields={{ slug }} hidden name={biz.name} />
          </div>
        )}
        {admin && !biz.hidden && (
          <FormDialog trigger="Add brand" primary title="Add brand" submit="Add" action={createBrandAction} fields={{ businessSlug: slug }}>
            <NameField label="Brand name" />
          </FormDialog>
        )}
      </PageHeader>

      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Brands</CardTitle></CardHeader>
          <CardContent>
            {brands.length === 0 ? (
              <EmptyState title="No brands yet." />
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="brands-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Also matches</TableHead>
                      {admin && <TableHead><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brands.map((b) => (
                      <TableRow key={b.id} className={b.hidden ? "text-gray-500" : undefined}>
                        <TableCell className="min-w-40">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{b.name}</span>
                            {b.hidden && <HiddenTag />}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-40 whitespace-normal">{b.names.slice(1).join(", ")}</TableCell>
                        {admin && (
                          <TableCell>
                            <div className="flex items-start justify-end gap-2">
                              <FormDialog
                                trigger="Rename"
                                triggerLabel={`Rename ${b.name}`}
                                title={`Rename ${b.name}`}
                                submit="Save"
                                action={renameBrandAction}
                                fields={{ id: String(b.id) }}
                              >
                                <NameField label="Brand name" defaultValue={b.name} />
                              </FormDialog>
                              <HideToggle action={setBrandHiddenAction} fields={{ id: String(b.id) }} hidden={b.hidden} name={b.name} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ATL categories</CardTitle></CardHeader>
          <CardContent>
            {atl.length === 0 ? (
              <EmptyState title="No ATL categories yet." />
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="atl-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Our brands</TableHead>
                      {admin && <TableHead><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atl.map((a) => (
                      <TableRow key={a.slug} className={a.hidden ? "text-gray-500" : undefined}>
                        <TableCell className="min-w-40">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{a.name}</span>
                            {a.hidden && <HiddenTag />}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-40 whitespace-normal">{a.ownBrands.join(", ")}</TableCell>
                        {admin && (
                          <TableCell>
                            <div className="flex items-start justify-end gap-2">
                              <FormDialog
                                trigger="Change"
                                triggerLabel={`Change ${a.name}`}
                                title={`Change ${a.name}`}
                                submit="Save"
                                action={setAtlCategoryAction}
                                fields={{ slug: a.slug }}
                              >
                                <label className="flex flex-col gap-1.5 font-medium">
                                  Business
                                  <select name="businessSlug" defaultValue={a.businessSlug} className={selectClass}>
                                    {targets.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1.5 font-medium">
                                  Our brands
                                  <Textarea name="ownBrands" defaultValue={a.ownBrands.join("\n")} rows={4} required className="font-normal" />
                                  <span className="text-xs font-normal text-gray-500">One name per line.</span>
                                </label>
                              </FormDialog>
                              <HideToggle action={setAtlHiddenAction} fields={{ slug: a.slug }} hidden={a.hidden} name={a.name} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
