import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Hammer } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { EmptyState } from "@/components/data/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { BusinessFilter } from "./business-filter";
import { PageHeader } from "./page-header";
import { prdPage, type PrdPage } from "./nav-items";

const need = (href: string): PrdPage => {
  const p = prdPage(href);
  if (!p) throw new Error(`Not a PRD page: ${href}`);
  return p;
};

export function beingBuiltMetadata(href: string): Metadata {
  return { title: need(href).label };
}

export function BeingBuiltBody({ page, admin }: { page: PrdPage; admin: boolean }) {
  return (
    <EmptyState icon={Hammer} title="This page is being built." message={page.files ? `It will read: ${page.files}` : page.note}>
      {admin && page.card && (
        <Link href={`/data-entry#card-${page.card}`} className={buttonVariants({ variant: "outline", size: "lg" })}>Open its upload card</Link>
      )}
    </EmptyState>
  );
}

async function WithAdmin({ page }: { page: PrdPage }) {
  await connection();
  return <BeingBuiltBody page={page} admin={await isAdmin()} />;
}

/** A PRD page whose link works but whose content is not built yet (spec: Pages not built yet). */
export function BeingBuilt({ href }: { href: string }) {
  const page = need(href);
  return (
    <>
      <PageHeader title={`${page.code} ${page.label}`}>
        {page.businessFilter && (
          <Suspense fallback={null}>
            <BusinessFilter />
          </Suspense>
        )}
      </PageHeader>
      <Suspense fallback={<BeingBuiltBody page={page} admin={false} />}>
        <WithAdmin page={page} />
      </Suspense>
    </>
  );
}
