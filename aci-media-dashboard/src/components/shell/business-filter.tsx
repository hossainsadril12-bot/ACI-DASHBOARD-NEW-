import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getCatalog } from "@/store/catalog";
import { getStore } from "@/store/client";
import { BUSINESS_COOKIE, businessFilterView } from "@/lib/business-filter";
import { BusinessFilterControl } from "./business-filter-control";

/** The cookie is a view preference, never a permission: it is checked against the visible catalog every time. */
const view = cache(async () => {
  await connection();
  const saved = (await cookies()).get(BUSINESS_COOKIE)?.value;
  return businessFilterView((await getCatalog(await getStore())).businesses, saved);
});

/** For the pages built next: the business the person chose, or null for All businesses. Checked against the catalog. */
export async function getBusinessChoice(): Promise<{ slug: string; name: string } | null> {
  const v = await view();
  return v.options.find((o) => o.slug === v.value) ?? null;
}

/** The shared Business filter for the page header. Render it inside <Suspense>: it reads cookies. */
export async function BusinessFilter() {
  const v = await view();
  return v.mode === "none" ? null : <BusinessFilterControl view={v} />;
}
