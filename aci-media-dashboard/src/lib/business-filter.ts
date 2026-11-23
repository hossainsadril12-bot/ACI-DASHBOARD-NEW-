// The shared Business filter (spec: Business filter). A view control: it never changes saved data.
export const BUSINESS_COOKIE = "aci-business";
export const BUTTONS_MAX = 4; // more than this and buttons get crowded (Hick's law): use a dropdown

export type BusinessFilterView = {
  mode: "none" | "buttons" | "dropdown";
  /** Visible businesses in catalog order. "All businesses" is not in this list. */
  options: { slug: string; name: string }[];
  /** "" = All businesses, else a slug from options. */
  value: string;
};

/** The cookie is only a preference: a slug that is unknown or hidden means All businesses. */
export function businessFilterView(businesses: { slug: string; name: string; hidden: boolean }[], saved: string | undefined): BusinessFilterView {
  const options = businesses.filter((b) => !b.hidden).map(({ slug, name }) => ({ slug, name }));
  const mode = options.length === 0 ? "none" : options.length <= BUTTONS_MAX ? "buttons" : "dropdown";
  const value = saved && options.some((o) => o.slug === saved) ? saved : "";
  return { mode, options, value };
}
