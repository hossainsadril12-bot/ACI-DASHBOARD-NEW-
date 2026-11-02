"use client";

import { CalendarDays, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

const field = "flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white pr-1 pl-3 text-sm text-gray-500 shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20";
const control = "h-8 border-0 bg-transparent pr-2 text-sm text-gray-900 outline-none";

/**
 * Wix-style filter pills: month and brand. A change applies at once (no forgotten Apply click),
 * and the choice is remembered across pages and refreshes (see src/proxy.ts).
 */
export function FilterBar({
  month,
  brands,
  brandId,
  keep = {},
  allowAll = true,
}: {
  month: string;
  brands: { id: number; name: string }[];
  brandId?: number;
  keep?: Record<string, string>;
  /** False when the page always needs one brand chosen. */
  allowAll?: boolean;
}) {
  const apply = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    // A half-typed month is empty until complete; only submit real values.
    if (e.currentTarget.value || e.currentTarget.tagName === "SELECT") e.currentTarget.form?.requestSubmit();
  };
  return (
    <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Filters">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className={field}>
        <CalendarDays className="size-4" aria-hidden />
        <span className="sr-only">Month</span>
        <input type="month" name="month" aria-label="Month" defaultValue={month} onChange={apply} className={control} required />
      </label>
      <label className={field}>
        <Tag className="size-4" aria-hidden />
        <span className="sr-only">Brand</span>
        <select name="brand" aria-label="Brand" defaultValue={brandId ? String(brandId) : ""} onChange={apply} className={control}>
          {allowAll && <option value="">All brands</option>}
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline">Apply</Button>
    </form>
  );
}
