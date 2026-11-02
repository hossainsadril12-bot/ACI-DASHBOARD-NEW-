import { and, eq, inArray, or, sql } from "drizzle-orm";
import { bills } from "@/db/schema";
import type { Db } from "@/db/types";
import { todayDhaka } from "@/lib/month";
import type { RowError } from "@/lib/upload/parse";
import { ValidationError } from "../errors";
import { checkBill, parseBillStatus, type BillStatus } from "../billing";
import { addMissing, type Applier, type Missing } from "./types";
import { createMissingRefs, inScope, num, str } from "./shared";

export type BillItem = {
  key: string;
  billNo: string;
  poNo: string | null;
  vendorId: number | null;
  brandId: number | null;
  month: string;
  billDate: string;
  amount: number;
  vatAmount: number | null;
  status: BillStatus;
  paidAt: string | null;
  note: string | null;
};

// Bill numbers are matched without case, across all months.
const billKey = (billNo: string) => billNo.trim().toLowerCase();

export const billsApplier: Applier<BillItem> = {
  kind: "bills",

  resolve(rows, lk) {
    const items: BillItem[] = [];
    const errors: RowError[] = [];
    const missing: Missing = { vendors: [], tvStations: [] };
    const seen = new Map<string, number>();
    const today = todayDhaka();
    for (const r of rows) {
      const v = r.values;
      const brandName = str(v.brand);
      const vendorName = str(v.vendor);
      const brandId = brandName ? lk.brand(brandName) : null;
      if (brandName && !brandId) errors.push({ row: r.rowNumber, column: "Brand", message: `Unknown brand "${brandName}". Add it in Settings first.` });
      const vendorId = vendorName ? lk.vendor(vendorName) ?? null : null;
      if (vendorName && vendorId === null) addMissing(missing.vendors, vendorName);
      const status = parseBillStatus(str(v.status));
      if (!status) errors.push({ row: r.rowNumber, column: "Status", message: `Unknown status "${str(v.status)}"` });
      if ((brandName && !brandId) || !status || typeof v.month !== "string" || typeof v.billDate !== "string") continue;

      let checked;
      try {
        const amount = num(v.amount);
        const vat = num(v.vatAmount);
        checked = checkBill({
          billNo: String(v.billNo ?? ""), poNo: str(v.poNo), month: v.month, billDate: v.billDate,
          amount: amount === null ? NaN : Math.round(amount), vatAmount: vat === null ? null : Math.round(vat),
          status, paidAt: str(v.paidOn), note: str(v.note),
        }, today);
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        errors.push({ row: r.rowNumber, column: "Bill", message: e.message });
        continue;
      }
      const key = billKey(checked.billNo);
      const first = seen.get(key);
      if (first) {
        errors.push({ row: r.rowNumber, column: "Bill no", message: `Same bill no as row ${first}` });
        continue;
      }
      seen.set(key, r.rowNumber);
      items.push({ ...checked, key, vendorId, brandId: brandId ?? null });
    }
    return { items, errors, missing };
  },

  createMissing: createMissingRefs,

  async existingKeys(db) {
    const rows = await db.select({ billNo: bills.billNo, source: bills.source }).from(bills);
    return rows.map((r) => ({ key: billKey(r.billNo), source: r.source }));
  },

  async replace(db: Db, periods, items, uploadId, scope) {
    const keys = items.map((i) => i.key);
    await db.delete(bills).where(and(
      eq(bills.source, "upload"),
      or(inArray(bills.month, periods), ...(keys.length ? [inArray(sql`lower(${bills.billNo})`, keys)] : [])),
      inScope(bills.brandId, scope, true),
    ));
    if (!items.length) return 0;
    await db.insert(bills).values(items.map((i) => ({
      billNo: i.billNo, poNo: i.poNo, vendorId: i.vendorId, brandId: i.brandId, month: i.month, billDate: i.billDate, amount: i.amount,
      vatAmount: i.vatAmount, status: i.status, paidAt: i.paidAt, note: i.note, source: "upload" as const, uploadId,
    })));
    return items.length;
  },
};
