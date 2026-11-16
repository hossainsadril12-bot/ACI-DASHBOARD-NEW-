/** The client's brand list and aliases (template.html 658-667), and working out a Digital file's business. */

export const DIGITAL_BUSINESSES = ["Toiletries", "Hygiene", "Salt"] as const;
export type DigitalBusiness = (typeof DIGITAL_BUSINESSES)[number];
export const isDigitalBusiness = (v: unknown): v is DigitalBusiness => (DIGITAL_BUSINESSES as readonly unknown[]).includes(v);
export type BusinessSource = "brands" | "file name" | "admin";

/** His BRANDLIST: official brand names by business. */
export const BRANDLIST: Readonly<Record<string, readonly string[]>> = {
  Toiletries: ["Savlon Liquid Antiseptic", "Savlon Antiseptic Cream", "Savlon Soap", "Savlon Handwash", "Savlon Baby Wipes", "Savlon Pickly Heat Powder", "Baby Soft", "Shinex", "Septex", "ACI Neem Original", "Leona", "Savlon Men Shower Gel", "SkinZen Shower Gel", "Wonder Kitchen Care"],
  Hygiene: ["Freedom Sanitary Napkin", "Super Dry Sanitary Napkin", "Twinkle Baby Diaper", "Freedom Intimate Wash", "Twinkle Baby Soap", "Twinkle Baby Wipes", "Savlon Respect Adult Diaper"],
  Salt: ["ACI Pure Salt", "ACI Pure Honey"],
  "Food & Beverage": ["Basic Spices", "Mustard Oil", "ACI Electrolyte"],
};

/** His BALIAS: lower-case short names to official names, plus every official name to itself (line 666). */
export const BALIAS: Readonly<Record<string, string>> = {
  "savlon la": "Savlon Liquid Antiseptic", "la": "Savlon Liquid Antiseptic", "savlon antiseptic liquid": "Savlon Liquid Antiseptic", "savlon liquid antiseptic": "Savlon Liquid Antiseptic", "liquid antiseptic": "Savlon Liquid Antiseptic", "savlon antiseptic": "Savlon Liquid Antiseptic",
  "savlon ac": "Savlon Antiseptic Cream", "savlon hw": "Savlon Handwash", "savlon hand wash": "Savlon Handwash", "savlon liquid handwash": "Savlon Handwash", "handwash": "Savlon Handwash", "hand wash": "Savlon Handwash",
  "savlon men": "Savlon Men Shower Gel", "shower gel (savlon men)": "Savlon Men Shower Gel", "skinzen": "SkinZen Shower Gel", "skingen": "SkinZen Shower Gel", "shower gel (skinzen)": "SkinZen Shower Gel", "skinzen shower gel": "SkinZen Shower Gel",
  "neem": "ACI Neem Original", "aci neem": "ACI Neem Original", "wonder": "Wonder Kitchen Care", "wonder dish wash": "Wonder Kitchen Care", "septex antiseptic bar": "Septex", "savlon pricky heat powder": "Savlon Pickly Heat Powder", "savlon prickly heat powder": "Savlon Pickly Heat Powder",
  "super dry": "Super Dry Sanitary Napkin", "super dry napkin": "Super Dry Sanitary Napkin", "savlon twinkle baby diaper": "Twinkle Baby Diaper", "twinkle baby dipaer": "Twinkle Baby Diaper", "twinkle diaper": "Twinkle Baby Diaper", "diaper": "Twinkle Baby Diaper",
  "savlon respect": "Savlon Respect Adult Diaper", "freedom": "Freedom Sanitary Napkin", "aci electrolyte drinks": "ACI Electrolyte", "electrolyte": "ACI Electrolyte", "aci pure spices": "Basic Spices", "aci pure basic spices": "Basic Spices", "aci mustard oil": "Mustard Oil", "aci pure mustard oil": "Mustard Oil",
  ...Object.fromEntries(Object.values(BRANDLIST).flat().map((b) => [b.toLowerCase(), b])),
};

/** His fullB: the official name for a brand, or the tidied name when it has no alias. */
export const fullB = (s: string): string => { const t = s.replace(/\s+/g, " ").trim(); return BALIAS[t.toLowerCase()] || t; };

const BUSINESS_OF = new Map(Object.entries(BRANDLIST).flatMap(([biz, bs]) => bs.map((b) => [b.toLowerCase(), biz] as const)));

/** His BRANDLIST business for a brand name (via his BALIAS / fullB), or null when unknown. */
export function businessOfBrand(name: string): string | null {
  return BUSINESS_OF.get(fullB(name).toLowerCase()) ?? null;
}

const NAME_HINTS: readonly [RegExp, DigitalBusiness][] = [[/toiletries/i, "Toiletries"], [/hygiene/i, "Hygiene"], [/salt/i, "Salt"]];

export function resolveDigitalBusiness(input: { brands: string[]; fileName: string; chosen: DigitalBusiness | null }):
  { business: DigitalBusiness; source: BusinessSource } | null {
  if (input.chosen) return { business: input.chosen, source: "admin" };
  const found = new Set(input.brands.map(businessOfBrand).filter((b): b is string => b != null));
  if (found.size === 1) { const [only] = found; if (isDigitalBusiness(only)) return { business: only, source: "brands" }; }
  const hits = NAME_HINTS.filter(([re]) => re.test(input.fileName));
  return hits.length === 1 ? { business: hits[0][1], source: "file name" } : null;
}
