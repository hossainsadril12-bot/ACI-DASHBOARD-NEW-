import { eq } from "drizzle-orm";
import { ValidationError } from "@/server/errors";
import { setting } from "./schema";
import type { Store } from "./client";

export const DEFAULT_USD_RATE = 123;
const USD_RATE = "usd_rate";

/** BDT per USD, set by the admin. Used for every digital figure outside Digital Performance. */
export async function getUsdRate(store: Store): Promise<number> {
  const row = await store.query.setting.findFirst({ where: eq(setting.key, USD_RATE) });
  return typeof row?.value === "number" ? row.value : DEFAULT_USD_RATE;
}

export async function setUsdRate(store: Store, rate: number): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) {
    throw new ValidationError("USD rate must be a number between 0 and 1,000 BDT.");
  }
  const updatedAt = new Date();
  await store
    .insert(setting)
    .values({ key: USD_RATE, value: rate, updatedAt })
    .onConflictDoUpdate({ target: setting.key, set: { value: rate, updatedAt } });
}
