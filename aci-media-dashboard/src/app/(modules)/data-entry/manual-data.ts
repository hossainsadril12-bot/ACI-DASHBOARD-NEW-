import { DEFAULT_BILL_STATUSES, type BillboardData } from "@/lib/ingest/readers/billboard";
import type { ChannelData } from "@/lib/ingest/readers/channel";
import type { FyRow } from "@/lib/ingest/readers/fy";
import { fyStartOf } from "@/lib/manual/rules";
import { getCatalog } from "@/store/catalog";
import type { Store } from "@/store/client";
import { getActiveData } from "@/store/datasets";
import type { ManualEntryData } from "./manual-drafts";

const emptyChannel = (): ChannelData => ({ elec: { rows: [], notes: [] }, dig: { rows: [], notes: [] }, press: { rows: [], notes: [] } });

/** What Manual Entry opens: each dataset's active version (or an empty start), its FY, and the visible businesses and brands. */
export async function loadManualEntry(store: Store, now: Date = new Date()): Promise<ManualEntryData> {
  // One after another: one store connection.
  const channel = await getActiveData<ChannelData>(store, "channel");
  const fy = await getActiveData<FyRow[]>(store, "fy");
  const billboard = await getActiveData<BillboardData>(store, "billboard");
  const catalog = await getCatalog(store);
  const bills = billboard?.data;
  return {
    channel: { versionId: channel?.versionId ?? null, fyStart: fyStartOf(channel, now), data: channel?.data ?? emptyChannel() },
    fy: { versionId: fy?.versionId ?? null, fyStart: fyStartOf(fy, now), rows: fy?.data ?? [] },
    billboard: {
      versionId: billboard?.versionId ?? null,
      data: { legend: bills?.legend.length ? bills.legend : [...DEFAULT_BILL_STATUSES], rows: bills?.rows ?? [] },
    },
    businesses: catalog.businesses
      .filter((b) => !b.hidden)
      .map((b) => ({ slug: b.slug, name: b.name, brands: catalog.brands.filter((x) => x.businessSlug === b.slug && !x.hidden).map((x) => x.name) })),
  };
}
