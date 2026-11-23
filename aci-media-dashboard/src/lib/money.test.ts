import { describe, expect, it } from "vitest";
import { BDT_MN, formatBdtMn } from "./money";

describe("formatBdtMn", () => {
  it("shows taka as millions with 2 decimals and the unit", () => {
    expect(formatBdtMn(12_340_000)).toBe("12.34 BDT Mn");
    expect(formatBdtMn(1_234_560_000)).toBe("1,234.56 BDT Mn");
    expect(formatBdtMn(0)).toBe("0.00 BDT Mn");
    expect(formatBdtMn(-500_000)).toBe("-0.50 BDT Mn");
    expect(formatBdtMn(-1)).toBe("0.00 BDT Mn");
    expect(BDT_MN).toBe("BDT Mn");
  });
});
