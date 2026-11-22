"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SegmentedButtons } from "@/components/data/segmented";
import type { ChannelKey } from "@/lib/manual/rules";
import { ChannelEditor } from "./channel-editor";
import { FyEditor } from "./fy-editor";
import type { ManualEntryData } from "./manual-drafts";

type View = "channel" | "fy" | "bills";
const VIEWS: { key: View; label: string }[] = [
  { key: "channel", label: "Channel cost" },
  { key: "fy", label: "FY media spend" },
];

/**
 * Manual Entry (design 3). Every editor stays mounted (only hidden), so unsaved edits survive switching. A viewer sees the
 * same editors with the inputs off; the server refuses a viewer's save anyway.
 */
export function ManualEntry({ admin, data }: { admin: boolean; data: ManualEntryData }) {
  const [view, setView] = useState<View>("channel");
  const [sheet, setSheet] = useState<ChannelKey>("elec");
  const [fyBrand, setFyBrand] = useState<string | null>(null);
  return (
    <div className="min-w-0 space-y-4">
      {!admin && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <Lock className="size-4 shrink-0 text-gray-500" aria-hidden />
          <span>Only the admin can change data. Sign in to edit.</span>
          <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2">Sign in</Link>
        </p>
      )}
      <div className="max-w-full overflow-x-auto">
        <SegmentedButtons label="Manual Entry sections" items={VIEWS} value={view} onChange={setView} />
      </div>
      <section data-testid="manual-channel" hidden={view !== "channel"} className="min-w-0">
        <ChannelEditor key={`channel-${data.channel.versionId ?? "none"}`} {...data.channel} readOnly={!admin} sheet={sheet} onSheet={setSheet} />
      </section>
      <section data-testid="manual-fy" hidden={view !== "fy"} className="min-w-0">
        <FyEditor key={`fy-${data.fy.versionId ?? "none"}`} {...data.fy} businesses={data.businesses} readOnly={!admin} brand={fyBrand} onBrand={setFyBrand} />
      </section>
    </div>
  );
}
