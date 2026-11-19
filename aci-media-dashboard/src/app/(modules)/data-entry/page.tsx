import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";
import { getCatalog } from "@/store/catalog";
import { listActiveVersions, listHistory } from "@/store/datasets";
import { getStore } from "@/store/client";
import { CardFace } from "./card-face";
import { cardStates } from "./cards-state";
import { DataCard } from "./data-card";
import { HistoryTable } from "./history-table";

export const metadata: Metadata = { title: "Data Entry" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Tab = "upload" | "history";

const TABS: { key: Tab; label: string; href: string }[] = [
  { key: "upload", label: "Upload Data", href: "/data-entry" },
  { key: "history", label: "Upload History", href: "/data-entry?tab=history" },
];

const tabOf = (sp: Record<string, string | string[] | undefined>): Tab => (sp.tab === "history" ? "history" : "upload");

export default function DataEntryPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Data Entry" subtitle="Upload the Excel files in the same format you use today. Every upload is kept in Upload History.">
        <Suspense fallback={<SegmentedLinks label="Data Entry sections" items={TABS} value="" />}>
          <Tabs searchParams={searchParams} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<PageSkeleton label="Loading" />}>
        <DataEntryContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Tabs({ searchParams }: { searchParams: Search }) {
  return <SegmentedLinks label="Data Entry sections" items={TABS} value={tabOf(await searchParams)} />;
}

async function DataEntryContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const tab = tabOf(await searchParams);
  const admin = await isAdmin(); // one cookie read; passed down as a prop
  const store = await getStore();

  if (tab === "history") {
    return <HistoryTable rows={await listHistory(store, { limit: 200 })} admin={admin} />;
  }
  const catalog = await getCatalog(store);
  const cards = cardStates(await listActiveVersions(store), catalog.businesses);
  // The visible businesses for the pickers; the server checks every pick again.
  const businesses = catalog.businesses.filter((b) => !b.hidden).map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="space-y-4">
      {!admin && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <Lock className="size-4 shrink-0 text-gray-500" aria-hidden />
          <span>Only the admin can upload. Sign in to upload.</span>
          <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2">Sign in</Link>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (admin ? <DataCard key={c.id} state={c} businesses={businesses} /> : <CardFace key={c.id} state={c} />))}
      </div>
    </div>
  );
}
