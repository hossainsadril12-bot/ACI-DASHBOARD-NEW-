import * as XLSX from "xlsx";
import { and, eq, like, notExists, or, sql } from "drizzle-orm";
import { bills, brands, spendEntries, tvStations, uploads, vendors } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { addDays, addMonths, daysInMonth } from "@/lib/month";
import { TEMPLATES, type UploadKind } from "@/lib/upload/templates";
import { SAMPLE_TAG } from "@/lib/sample";
import { ValidationError } from "./errors";
import { listBills, remindBill } from "./billing";
import { saveCompetitorAd, saveYoutubeMonth, setSourceOwner } from "./competitors";
import { addRival, createBrand, listBrandsWithRivals, listBusinesses } from "./master-data";
import { setBudget } from "./plan";
import { importGeneratedFile } from "./uploads";

// Every sample record is marked so it can be found and removed without touching real data:
// brands, vendors and TV stations end with "(Sample)", bill numbers start with "SMP-",
// and upload file names start with "sample-" (loaded) or "aci-sample-" (downloaded by the user).
export { SAMPLE_TAG };

type Channel = "TV" | "Press" | "Radio" | "OOH" | "Meta" | "YouTube" | "TikTok";
type SampleBrand = {
  name: string; short: string; business: string; rivals: [string, string, string];
  /** Typical full-month spend per channel, BDT with VAT. */
  spend: Partial<Record<Channel, number>>;
  /** Budget as a share of full-month spend; below 1 means the brand goes over budget. */
  budgetFactor: number;
};

const BRANDS: SampleBrand[] = [
  { name: `Glow Beauty Soap ${SAMPLE_TAG}`, short: "Glow", business: "Toiletries", rivals: ["Lumina Soap", "PureSkin Bar", "Rosy Soap"],
    spend: { TV: 3_200_000, Press: 450_000, Meta: 900_000, YouTube: 550_000, TikTok: 300_000 }, budgetFactor: 1.2 },
  { name: `Crystal Salt ${SAMPLE_TAG}`, short: "Crystal", business: "Salt", rivals: ["SeaWhite Salt", "Royal Salt", "Daily Salt"],
    spend: { TV: 2_100_000, Radio: 250_000, OOH: 400_000, Meta: 500_000, YouTube: 300_000 }, budgetFactor: 1.15 },
  { name: `CareSoft Napkin ${SAMPLE_TAG}`, short: "CareSoft", business: "Hygiene", rivals: ["Comfy Pads", "Bloom Care", "Freshday"],
    spend: { TV: 1_800_000, Press: 300_000, Meta: 750_000, YouTube: 400_000, TikTok: 450_000 }, budgetFactor: 0.95 },
  { name: `ORS-Plus ${SAMPLE_TAG}`, short: "ORS-Plus", business: "Electrolyte", rivals: ["HydraLyte", "SaltaSip", "Revive ORS"],
    spend: { TV: 2_600_000, Radio: 300_000, OOH: 350_000, Meta: 600_000, YouTube: 350_000 }, budgetFactor: 1.1 },
];

const AGENCY = `Bluebird Media ${SAMPLE_TAG}`;
const DIGITAL_AGENCY = `Northstar Digital ${SAMPLE_TAG}`;
const STATIONS = [`Channel One ${SAMPLE_TAG}`, `Channel Two ${SAMPLE_TAG}`];
const DIGITAL: Channel[] = ["Meta", "YouTube", "TikTok"];
/** Rough cost to reach 1,000 people per channel (BDT), so the Performance chart has a clear ranking. */
const COST_PER_1000: Partial<Record<Channel, number>> = { TV: 2100, Press: 1700, Radio: 900, Meta: 320, YouTube: 420, TikTok: 260 };

// ---------- deterministic numbers ----------

/** Same input, same number: a stable ±10% wobble so months and brands differ without randomness. */
function wobble(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 1 + ((Math.abs(h) % 21) - 10) / 100;
}
const round10k = (n: number) => Math.round(n / 10_000) * 10_000;
const vat = (amount: number) => Math.round((amount * 13) / 113);
const day = (month: string, d: number) => `${month}-${String(Math.min(d, daysInMonth(month))).padStart(2, "0")}`;

function channelSpend(b: SampleBrand, ch: Channel, month: string): number {
  return round10k((b.spend[ch] ?? 0) * wobble(`${b.short}|${ch}|${month}`));
}
const brandMonthTotal = (b: SampleBrand, month: string) =>
  (Object.keys(b.spend) as Channel[]).reduce((t, ch) => t + channelSpend(b, ch, month), 0);

// ---------- workbooks ----------

type Row = (string | number | null)[];

function workbook(kind: UploadKind, rows: Row[]): Uint8Array {
  const def = TEMPLATES[kind];
  const ws = XLSX.utils.aoa_to_sheet([def.columns.map((c) => c.header), ...rows]);
  ws["!cols"] = def.columns.map((c) => ({ wch: Math.max(16, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

/** Month, Date, Brand, Channel, TV station, Agency, Amount, Note. `share` < 1 gives an early, part-month file. */
function spendRows(month: string, share: number, lastDay = 31): Row[] {
  const rows: Row[] = [];
  for (const b of BRANDS) {
    for (const ch of Object.keys(b.spend) as Channel[]) {
      const amount = round10k(channelSpend(b, ch, month) * share);
      const agency = DIGITAL.includes(ch) ? DIGITAL_AGENCY : AGENCY;
      if (ch === "TV") {
        const first = round10k(amount * 0.6);
        rows.push([month, day(month, Math.min(5, lastDay)), b.name, "TV", STATIONS[0], agency, first, "Prime time spots"]);
        rows.push([month, day(month, Math.min(12, lastDay)), b.name, "TV", STATIONS[1], agency, amount - first, null]);
      } else {
        rows.push([month, day(month, Math.min(8, lastDay)), b.name, ch, null, agency, amount, null]);
      }
    }
  }
  rows.push(["TOTAL", null, null, null, null, null, rows.reduce((t, r) => t + (r[6] as number), 0), null]);
  return rows;
}

/** Month, Brand, Channel, Spend, People reached, GRP, SOV %, SOS %, 1+ reach %, CPRP. `reachShare` < 1 = early estimate. */
function performanceRows(month: string, reachShare: number): Row[] {
  const rows: Row[] = [];
  for (const b of BRANDS) {
    for (const ch of Object.keys(b.spend) as Channel[]) {
      const spend = channelSpend(b, ch, month);
      const cost = COST_PER_1000[ch];
      // Outdoor has no audience measure, so it shows "No data" on the chart.
      const reached = cost ? Math.round((spend / cost) * 1000 * wobble(`reach|${b.short}|${ch}|${month}`) * reachShare) : null;
      if (ch === "TV") {
        const grp = Math.round(spend / 14_000);
        rows.push([month, b.name, ch, spend, reached, grp, Math.round(18 + 10 * wobble(`sov|${b.short}|${month}`) - 10), Math.round(16 + 10 * wobble(`sos|${b.short}|${month}`) - 10), Math.round(55 * wobble(`r1|${b.short}|${month}`)), Math.round(spend / grp)]);
      } else {
        rows.push([month, b.name, ch, spend, reached, null, null, null, null, null]);
      }
    }
  }
  return rows;
}

/** Month, Brand, Platform, Spend, Reach, Impressions, CPM, ThruPlays, Cost per view, Engagement. */
function digitalRows(month: string, share: number): Row[] {
  const rows: Row[] = [];
  for (const b of BRANDS) {
    for (const ch of DIGITAL) {
      if (!b.spend[ch]) continue;
      const spend = channelSpend(b, ch, month);
      const reach = Math.round((spend / COST_PER_1000[ch]!) * 1000 * wobble(`reach|${b.short}|${ch}|${month}`) * share);
      const impressions = Math.round(reach * 2.6);
      const thruplays = Math.round(impressions * (ch === "YouTube" ? 0.18 : 0.12));
      rows.push([month, b.name, ch, spend, reach, impressions, null, thruplays, null, Math.round(impressions * 0.008)]);
    }
  }
  return rows;
}

/** Month, Brand, Brand or rival name, Media, Spend, Spots, SOV %. */
function competitorRows(month: string, share: number): Row[] {
  const rows: Row[] = [];
  const spots = (spend: number, perSpot: number) => Math.round(spend / perSpot);
  for (const b of BRANDS) {
    const tv = channelSpend(b, "TV", month);
    const add = (subject: string, media: "TV" | "Press" | "Radio", spend: number) =>
      rows.push([month, b.name, subject, media, round10k(spend * share), spots(spend * share, media === "TV" ? 18_000 : media === "Radio" ? 4_000 : 60_000), null]);
    add(b.name, "TV", tv);
    if (b.spend.Press) add(b.name, "Press", channelSpend(b, "Press", month));
    if (b.spend.Radio) add(b.name, "Radio", channelSpend(b, "Radio", month));
    add(b.rivals[0], "TV", tv * 1.25 * wobble(`r0|${b.short}|${month}`));
    add(b.rivals[0], "Press", 600_000 * wobble(`r0p|${b.short}|${month}`));
    add(b.rivals[1], "TV", tv * 0.7 * wobble(`r1|${b.short}|${month}`));
    add(b.rivals[1], "Radio", 280_000 * wobble(`r1r|${b.short}|${month}`));
    add(b.rivals[2], "TV", tv * 0.4 * wobble(`r2|${b.short}|${month}`));
  }
  return rows;
}

/** Campaign, Brand, Start, End, Status, Channel, Planned amount, Notes: running, starting soon and later campaigns. */
function seedPlanRows(today: string): Row[] {
  const m = today.slice(0, 7);
  const rows: Row[] = [];
  for (const b of BRANDS) {
    const name = (s: string) => `${b.short} ${s}`;
    const digital = (Object.keys(b.spend) as Channel[]).filter((c) => DIGITAL.includes(c));
    for (const ch of digital) {
      rows.push([name("always-on digital"), b.name, `${addMonths(m, -1)}-01`, day(addMonths(m, 1), 31), "Live", ch, round10k(channelSpend(b, ch, m) * 3), "Runs for three months"]);
    }
    rows.push([name("TV burst"), b.name, addDays(today, -10), addDays(today, 10), "Live", "TV", round10k(channelSpend(b, "TV", m) * 0.8), null]);
    const launchChannel: Channel = b.spend.Press ? "Press" : "Radio";
    rows.push([name("new season launch"), b.name, addDays(today, 5), addDays(today, 25), "Planned", "TV", round10k(channelSpend(b, "TV", m) * 0.6), "Starts soon"]);
    rows.push([name("new season launch"), b.name, addDays(today, 5), addDays(today, 25), "Planned", launchChannel, round10k(channelSpend(b, launchChannel, m)), null]);
  }
  rows.push(["TOTAL", null, null, null, null, null, rows.reduce((t, r) => t + (r[6] as number), 0), null]);
  return rows;
}

/** Bill no, PO no, Vendor, Brand, Month, Bill date, Amount, VAT, Status, Paid on, Note. Billing month is last month. */
function seedBillRows(today: string): Row[] {
  const month = addMonths(today.slice(0, 7), -1);
  const bill = (no: string, vendor: string, b: SampleBrand, age: number, amount: number, status: string, note: string | null, paidOn: string | null = null): Row =>
    [no, `PO-${no.slice(4)}`, vendor, b.name, month, addDays(today, -age), amount, vat(amount), status, paidOn, note];
  return [
    bill("SMP-001", AGENCY, BRANDS[0], 45, 2_850_000, "Unpaid", "TV, Channel One"),
    bill("SMP-002", DIGITAL_AGENCY, BRANDS[2], 33, 1_240_000, "Finance/Audit", null),
    bill("SMP-003", AGENCY, BRANDS[1], 22, 1_960_000, "Cheque in hand", null),
    bill("SMP-004", DIGITAL_AGENCY, BRANDS[3], 16, 740_000, "Unpaid", "Waiting for the PO copy"),
    bill("SMP-005", AGENCY, BRANDS[2], 6, 1_380_000, "Bill error", "Amount differs from the PO"),
    bill("SMP-006", DIGITAL_AGENCY, BRANDS[0], 3, 520_000, "Cheque in counter", null),
    bill("SMP-007", AGENCY, BRANDS[3], 40, 2_100_000, "Payment Done", "Paid by bank transfer", addDays(today, -2)),
  ];
}

// ---------- files the user can download and upload ----------

export type SampleFile = { fileName: string; data: Uint8Array };

/** Where each sample file is uploaded and what changes on screen. Shown in Settings. */
export const SAMPLE_FILE_NOTES: Record<UploadKind, { page: string; href: string; change: string }> = {
  plan: { page: "Plan", href: "/plan", change: "Adds next month's festive campaigns for all 4 brands." },
  spend: { page: "Spend", href: "/spend", change: "Replaces this month's early spend with the full month. Totals go up and one brand goes over budget." },
  performance: { page: "Performance", href: "/performance", change: "Replaces this month's early reach with final numbers, so cost to reach 1,000 people drops." },
  digital: { page: "Digital Data", href: "/digital", change: "Replaces this month's early Meta, YouTube and TikTok results with final ones." },
  competitor_media: { page: "Competitor Tracking", href: "/competitors", change: "Replaces this month's early TV, Press and Radio monitoring with final numbers." },
  bills: { page: "Billing", href: "/billing", change: "Adds 2 new bills and marks bill SMP-004 as paid." },
};

/**
 * Excel files for the user to upload on each page. Each one changes what the page shows:
 * this month's final numbers replace the early ones, a new plan for next month, new and paid bills.
 */
export function sampleUploadFile(kind: UploadKind, today: string): SampleFile {
  const m = today.slice(0, 7);
  const next = addMonths(m, 1);
  switch (kind) {
    case "spend":
      return { fileName: `aci-sample-spend-${m}.xlsx`, data: workbook("spend", spendRows(m, 1)) };
    case "performance":
      return { fileName: `aci-sample-performance-${m}.xlsx`, data: workbook("performance", performanceRows(m, 1)) };
    case "digital":
      return { fileName: `aci-sample-digital-${m}.xlsx`, data: workbook("digital", digitalRows(m, 1)) };
    case "competitor_media":
      return { fileName: `aci-sample-competitors-${m}.xlsx`, data: workbook("competitor_media", competitorRows(m, 1)) };
    case "plan": {
      const rows: Row[] = BRANDS.flatMap((b) => {
        const second: Channel = b.spend.TikTok ? "TikTok" : "Radio";
        return [
          [`${b.short} festive push`, b.name, day(next, 3), day(next, 20), "Planned", "TV", round10k(channelSpend(b, "TV", next) * 0.7), "Festive season"],
          [`${b.short} festive push`, b.name, day(next, 3), day(next, 20), "Planned", second, round10k(channelSpend(b, second, next)), null],
        ] as Row[];
      });
      rows.push(["TOTAL", null, null, null, null, null, rows.reduce((t, r) => t + (r[6] as number), 0), null]);
      return { fileName: `aci-sample-plan-${next}.xlsx`, data: workbook("plan", rows) };
    }
    case "bills": {
      const rows: Row[] = [
        ["SMP-101", "PO-101", DIGITAL_AGENCY, BRANDS[0].name, m, addDays(today, -2), 860_000, vat(860_000), "Unpaid", null, "Meta, this month"],
        ["SMP-102", "PO-102", AGENCY, BRANDS[1].name, m, today, 1_150_000, vat(1_150_000), "Unpaid", null, "TV, this month"],
        ["SMP-004", "PO-004", DIGITAL_AGENCY, BRANDS[3].name, m, addDays(today, -16), 740_000, vat(740_000), "Payment Done", today, "Paid after the PO copy arrived"],
      ];
      return { fileName: `aci-sample-bills-${m}.xlsx`, data: workbook("bills", rows) };
    }
  }
}

// ---------- load and remove ----------

export async function sampleStatus(db: Db) {
  const [r] = await db.select({ n: sql<string>`count(*)` }).from(brands).where(like(brands.name, `%${SAMPLE_TAG}`));
  const n = Number(r?.n ?? 0);
  return { loaded: n > 0, brands: n };
}

/**
 * Fill every module with sample records: brands and rivals, last month and this month (early numbers),
 * campaigns, budgets, bills, a reminder, rival ads, YouTube snapshots and source owners.
 * Files go through the normal upload pipeline, so they show in Uploads & History.
 */
export async function loadSampleData(db: Db, today: string) {
  if ((await sampleStatus(db)).loaded) throw new ValidationError("Sample data is already loaded. Remove it first to load it again.");
  const m = today.slice(0, 7);
  const prev = addMonths(m, -1);
  const businesses = await listBusinesses(db);

  for (const b of BRANDS) {
    const biz = businesses.find((x) => x.name === b.business);
    if (!biz) throw new ValidationError(`Business "${b.business}" is missing. Run the database setup first.`);
    const brand = await createBrand(db, { name: b.name, businessId: biz.id });
    for (const r of b.rivals) await addRival(db, { brandId: brand.id, name: r });
  }

  const todayDay = Number(today.slice(8, 10));
  const files: { kind: UploadKind; fileName: string; rows: Row[] }[] = [
    { kind: "plan", fileName: `sample-plan-${m}.xlsx`, rows: seedPlanRows(today) },
    ...[-3, -2, -1].map((n) => ({ kind: "spend" as const, fileName: `sample-spend-${addMonths(m, n)}.xlsx`, rows: spendRows(addMonths(m, n), 1) })),
    // This month so far: about half the month's spend, dated up to today.
    { kind: "spend", fileName: `sample-spend-${m}-early.xlsx`, rows: spendRows(m, 0.5, todayDay) },
    { kind: "performance", fileName: `sample-performance-${prev}.xlsx`, rows: performanceRows(prev, 1) },
    { kind: "performance", fileName: `sample-performance-${m}-early.xlsx`, rows: performanceRows(m, 0.85) },
    { kind: "digital", fileName: `sample-digital-${prev}.xlsx`, rows: digitalRows(prev, 1) },
    { kind: "digital", fileName: `sample-digital-${m}-early.xlsx`, rows: digitalRows(m, 0.85) },
    { kind: "competitor_media", fileName: `sample-competitors-${prev}.xlsx`, rows: competitorRows(prev, 1) },
    { kind: "competitor_media", fileName: `sample-competitors-${m}-early.xlsx`, rows: competitorRows(m, 0.85) },
    { kind: "bills", fileName: `sample-bills-${prev}.xlsx`, rows: seedBillRows(today) },
  ];
  for (const f of files) await importGeneratedFile(db, { kind: f.kind, fileName: f.fileName, data: workbook(f.kind, f.rows) });

  const loaded = (await listBrandsWithRivals(db)).filter((b) => b.name.endsWith(SAMPLE_TAG));
  for (const b of BRANDS) {
    const brand = loaded.find((x) => x.name === b.name)!;
    for (const month of [prev, m]) {
      await setBudget(db, { brandId: brand.id, month, amount: round10k(brandMonthTotal(b, month) * b.budgetFactor), reason: "Sample budget" });
    }
    await saveCompetitorAd(db, null, {
      brandId: brand.id, rivalId: brand.rivals[0].id, platform: b.spend.TikTok ? "TikTok" : "Meta", adUrl: "https://www.facebook.com/ads/library/",
      startedOn: addDays(today, -9), hook: `${brand.rivals[0].name}: family moment in the first 3 seconds`, cta: "Shop now",
      visualStyle: "Real family, warm light", tone: "Caring", notes: "Sample ad entry",
    });
    for (const [month, growth] of [[prev, 1], [m, 1.04]] as const) {
      await saveYoutubeMonth(db, {
        brandId: brand.id, month,
        rows: [
          { rivalId: null, subscribers: Math.round(42_000 * wobble(`yt|${b.short}`) * growth), totalViews: Math.round(9_500_000 * wobble(`ytv|${b.short}`) * growth), videos: 140, latestUploadOn: addDays(today, -4) },
          ...brand.rivals.map((r, i) => ({
            rivalId: r.id, subscribers: Math.round((90_000 - i * 25_000) * wobble(`yt|${r.name}`) * (growth > 1 ? 1.02 : 1)),
            totalViews: Math.round((25_000_000 - i * 7_000_000) * wobble(`ytv|${r.name}`)), videos: 300 - i * 70, latestUploadOn: addDays(today, -2 - i * 5),
          })),
        ],
      });
    }
  }
  await setSourceOwner(db, "competitor_media", "Media monitoring team");
  await setSourceOwner(db, "meta_ads", "Digital team");
  await setSourceOwner(db, "youtube", "Digital team");
  await setSourceOwner(db, "tiktok_ads", "Digital team");
  const overdue = (await listBills(db, today, { search: "SMP-001" }))[0];
  if (overdue) await remindBill(db, overdue.id);

  await logChange(db, { entity: "sample_data", entityId: "all", action: "create", after: { brands: BRANDS.length, files: files.length } });
  return { brands: BRANDS.length, files: files.length };
}

/** Delete every sample record. Real brands, bills, uploads, vendors and TV stations are left alone. */
export async function removeSampleData(db: Db) {
  await db.delete(bills).where(like(bills.billNo, "SMP-%"));
  // Brands cascade to rivals, campaigns, budgets, spend, performance, digital and competitor records.
  const removed = await db.delete(brands).where(like(brands.name, `%${SAMPLE_TAG}`)).returning({ id: brands.id });
  await db.delete(uploads).where(or(like(uploads.fileName, "sample-%"), like(uploads.fileName, "aci-sample-%")));
  await db.delete(vendors).where(and(
    like(vendors.name, `%${SAMPLE_TAG}`),
    notExists(db.select({ x: sql`1` }).from(spendEntries).where(eq(spendEntries.vendorId, vendors.id))),
    notExists(db.select({ x: sql`1` }).from(bills).where(eq(bills.vendorId, vendors.id))),
  ));
  await db.delete(tvStations).where(and(
    like(tvStations.name, `%${SAMPLE_TAG}`),
    notExists(db.select({ x: sql`1` }).from(spendEntries).where(eq(spendEntries.tvStationId, tvStations.id))),
  ));
  await logChange(db, { entity: "sample_data", entityId: "all", action: "delete", after: { brands: removed.length } });
  return { brands: removed.length };
}
