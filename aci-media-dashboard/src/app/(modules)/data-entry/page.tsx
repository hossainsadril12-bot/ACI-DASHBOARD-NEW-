import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { isAdmin } from "@/auth/admin";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SegmentedLinks } from "@/components/data/segmented";
import { buttonVariants } from "@/components/ui/button";
import { listHistory } from "@/store/datasets";
import { getStore } from "@/store/client";
import { HistoryTable } from "./history-table";
import { UploadBox } from "./upload-box";

export const metadata: Metadata = { title: "Data Entry" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Tab = "upload" | "history";

const TABS: { key: Tab; label: string; href: string }[] = [
  { key: "upload", label: "Upload", href: "/data-entry" },
  { key: "history", label: "Upload History", href: "/data-entry?tab=history" },
];

const tabOf = (sp: Record<string, string | string[] | undefined>): Tab => (sp.tab === "history" ? "history" : "upload");

export default function DataEntryPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Data Entry" subtitle="Upload his usual Excel files. Every upload is kept in Upload History.">
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

  if (tab === "history") {
    return <HistoryTable rows={await listHistory(await getStore(), { limit: 200 })} admin={admin} />;
  }
  if (!admin) {
    return (
      <EmptyState icon={Lock} title="Admin only" message="Only the admin can upload. Sign in to upload files.">
        <Link href="/sign-in" className={buttonVariants({ variant: "outline" })}>Sign in</Link>
      </EmptyState>
    );
  }
  return <UploadBox />;
}
