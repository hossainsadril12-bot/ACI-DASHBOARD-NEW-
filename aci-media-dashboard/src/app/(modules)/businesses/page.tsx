import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Building2 } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import { createBusinessAction, renameBusinessAction, setBusinessHiddenAction } from "./actions";
import { FormDialog, HideToggle } from "./catalog-controls";
import { HiddenTag, NameField } from "./fields";

export const metadata: Metadata = { title: "Businesses & Brands" };

const TITLE = "Businesses & Brands";
const SUBTITLE = "The businesses and brands your uploads are matched against.";

export default function BusinessesPage() {
  return (
    <Suspense fallback={<><PageHeader title={TITLE} subtitle={SUBTITLE} /><PageSkeleton label="Loading businesses" /></>}>
      <BusinessesContent />
    </Suspense>
  );
}

async function BusinessesContent() {
  await connection();
  const admin = await isAdmin(); // one cookie read; viewers get no buttons and no dialogs
  const { businesses, brands, atl } = await getCatalog(await getStore());
  const count = (list: { businessSlug: string }[], slug: string) => list.filter((x) => x.businessSlug === slug).length;

  return (
    <>
      <PageHeader title={TITLE} subtitle={SUBTITLE}>
        {admin && (
          <FormDialog trigger="Add business" primary title="Add business" submit="Add" action={createBusinessAction}>
            <NameField label="Business name" />
          </FormDialog>
        )}
      </PageHeader>
      {businesses.length === 0 ? (
        <EmptyState icon={Building2} title="No businesses yet. Add one here, or upload a file and add the businesses it contains." />
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <Table data-testid="businesses-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead className="text-right">Brands</TableHead>
                    <TableHead className="text-right">ATL categories</TableHead>
                    {admin && <TableHead><span className="sr-only">Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businesses.map((b) => (
                    <TableRow key={b.slug} className={b.hidden ? "text-gray-500" : undefined}>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <Link href={`/businesses/${b.slug}`} className="font-medium text-gray-900 hover:underline">{b.name}</Link>
                          {b.hidden && <HiddenTag />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(brands, b.slug)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(atl, b.slug)}</TableCell>
                      {admin && (
                        <TableCell>
                          <div className="flex items-start justify-end gap-2">
                            <FormDialog
                              trigger="Rename"
                              triggerLabel={`Rename ${b.name}`}
                              title={`Rename ${b.name}`}
                              submit="Save"
                              action={renameBusinessAction}
                              fields={{ slug: b.slug }}
                            >
                              <NameField label="Business name" defaultValue={b.name} />
                            </FormDialog>
                            <HideToggle action={setBusinessHiddenAction} fields={{ slug: b.slug }} hidden={b.hidden} name={b.name} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
