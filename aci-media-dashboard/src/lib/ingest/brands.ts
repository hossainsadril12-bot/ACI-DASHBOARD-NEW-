/** The client's brand list and aliases (template.html 658-667). Only suggestions read them. */

/** Where a Digital or ATL file's business came from: the admin's pick, the file's brands, the file name, or its ATL category. */
export type BusinessSource = "brands" | "file name" | "admin" | "category";

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
export const fullB = (s: string): string => { const t = s.replace(/\s+/g, " ").trim(); const k = t.toLowerCase(); return Object.hasOwn(BALIAS, k) ? BALIAS[k] : t; };

const BUSINESS_OF = new Map(Object.entries(BRANDLIST).flatMap(([biz, bs]) => bs.map((b) => [b.toLowerCase(), biz] as const)));

/** His BRANDLIST business for a brand name (via his BALIAS / fullB), or null when unknown. */
export function businessOfBrand(name: string): string | null {
  return BUSINESS_OF.get(fullB(name).toLowerCase()) ?? null;
}
