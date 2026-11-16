import { describe, expect, it } from "vitest";
import { createTestStore } from "./test-store";
import { DEFAULT_USD_RATE, getUsdRate, setUsdRate } from "./settings";

describe("USD rate", () => {
  it("defaults to 123 BDT", async () => {
    expect(await getUsdRate(await createTestStore())).toBe(DEFAULT_USD_RATE);
    expect(DEFAULT_USD_RATE).toBe(123);
  });

  it("saves a new rate", async () => {
    const store = await createTestStore();
    await setUsdRate(store, 120.5);
    await setUsdRate(store, 121);
    expect(await getUsdRate(store)).toBe(121);
  });

  it("accepts the upper limit of 1000", async () => {
    const store = await createTestStore();
    await setUsdRate(store, 1000);
    expect(await getUsdRate(store)).toBe(1000);
  });

  it.each([0, -1, 1001, Number.NaN])("refuses %s", async (rate) => {
    await expect(setUsdRate(await createTestStore(), rate)).rejects.toThrow(/USD rate must be/);
  });
});
