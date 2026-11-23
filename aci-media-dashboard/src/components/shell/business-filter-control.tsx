"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { SegmentedButtons } from "@/components/data/segmented";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { BUSINESS_COOKIE, type BusinessFilterView } from "@/lib/business-filter";
import { KEEP_SECONDS } from "@/lib/view-cookies";
import { cn } from "@/lib/utils";

const ALL = "All businesses";

/** Remembers the choice for every page (a view preference only: the server checks it against the catalog). */
function remember(slug: string) {
  document.cookie = slug
    ? `${BUSINESS_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${KEEP_SECONDS}; samesite=lax`
    : `${BUSINESS_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** The shared Business filter: buttons up to 4 businesses, a searchable dropdown above (spec: Business filter). */
export function BusinessFilterControl({ view }: { view: BusinessFilterView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useOptimistic(view.value);

  const choose = (slug: string) => {
    if (slug === value) return;
    startTransition(() => {
      setValue(slug);
      remember(slug);
      router.refresh();
    });
  };

  return (
    <div aria-busy={pending || undefined} className={cn("min-w-0 max-w-full transition-opacity", pending && "opacity-70")}>
      {view.mode === "buttons" ? (
        // 40px touch targets: SegmentedButtons is 36px tall by default.
        <div className="max-w-full overflow-x-auto [&_button]:h-10">
          <SegmentedButtons label="Business" items={[{ key: "", label: ALL }, ...view.options.map((o) => ({ key: o.slug, label: o.name }))]} value={value} onChange={choose} />
        </div>
      ) : (
        <BusinessDropdown options={view.options} value={value} onChange={choose} />
      )}
    </div>
  );
}

function BusinessDropdown({ options, value, onChange }: { options: BusinessFilterView["options"]; value: string; onChange: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.slug === value)?.name ?? ALL;
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const item = "min-h-10 py-2 hover:bg-accent hover:text-accent-foreground";

  return (
    <DropdownMenu highlightItemOnHover={false} onOpenChange={(open) => { if (!open) setQuery(""); }}>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" aria-label={`Business: ${current}`} className="max-w-full" />}>
        <Building2 aria-hidden />
        <span className="truncate">{current}</span>
        <ChevronDown aria-hidden className="text-gray-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <div className="p-1">
          <Input
            aria-label="Search businesses"
            placeholder="Search businesses"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Typing belongs to the search box: keep keys away from the menu's typeahead and focus moves.
            // Escape (close) and the arrows (move into the list) still reach the menu.
            onKeyDown={(e) => { if (e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp") e.stopPropagation(); }}
            className="h-10"
          />
        </div>
        <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => onChange(v)}>
          <DropdownMenuRadioItem value="" closeOnClick className={item}>{ALL}</DropdownMenuRadioItem>
          {matches.map((o) => (
            <DropdownMenuRadioItem key={o.slug} value={o.slug} closeOnClick className={item}>{o.name}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {matches.length === 0 && <p className="px-1.5 py-2 text-sm text-gray-500">No business matches.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
