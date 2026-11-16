import { describe, expect, it } from "vitest";
import { readBilling, type BillingData } from "./billing";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const H = ["SL", "Media/ Vendor", "Business", "Brand", "Month", "Media ", "PO Number", "PO Amount (W/H VAT)", "PO Amount (incl. VAT)", "Invoice No", "Bill Amount", "Net Bill", "ASF", "Remittance Tax", "ADD Cost", "VAT", "Unbilled Amount", "Chalan", "Bill qty", "Cheque No", "Remarks", "Location"];

type Cell = string | number | null;

/*
 * His built-in data (billing.json, billraw.json) was made by scripts/billing.py and scripts/billraw.py (Python),
 * not by his JS reader (template.html parseBilling 629-639), which is what his dashboard runs after an upload.
 * We port the JS reader, so these documented differences are expected and counted. Everything else is exact.
 *  - date: billing.py `str(x[9] or '')` turns a datetime invoice cell into "YYYY-MM-DD 00:00:00"; his JS gives "YYYY-MM-DD".
 *  - trim: billing.py keeps spaces around strings; his xstr (template.html ~506) trims. Same text otherwise.
 *  - round: Python round() is half-to-even; his JS Math.round is half-up (billing.py `round(n(x[8])*share)` etc.,
 *    billraw.py `round(x,2)`). At an exact .5 the JS value is the key value + 1 (or + 0.01) and the key value is even.
 *  - po-spread: see SPREAD_ROWS.
 */
const normText = (k: Cell): Cell => (typeof k === "string" ? k.replace(/ 00:00:00$/, "").trim() : k);

/*
 * Rows 2306 and 2466 (PO 2505004341, invoices "D096" and " D096"). billing.py's PO-spread pass groups by the raw
 * str(x[9]), so " D096" is a second invoice and the unbilled amount is spread (flag 2). His JS groups by xstr()
 * (trimmed): one invoice, so `invs.size < 2` skips the spread (template.html parseBilling line 636). We assert OUR values.
 */
const SPREAD_ROWS: Record<number, { po: number; unbilled: number; flag: number }> = {
  2306: { po: 360882, unbilled: 318739, flag: 0 },
  2466: { po: 360882, unbilled: 312523, flag: 0 },
};

describe.skipIf(!hasClientFiles)("Billing master: the real file", () => {
  const r = hasClientFiles ? readBilling(open(clientFile("Dashboard_Media_Final_Fixed_26th_October_2026.xlsx"))) : null;

  it("equals his built-in data (bl), except the documented Python-script differences", () => {
    const key = answerKey<BillingData["bl"]>("billing.json");
    const mine = r!.data.bl;
    expect(mine.length).toBe(key.length);
    const n = { date: 0, trim: 0, round: 0, spread: 0 };
    mine.forEach((row, i) => {
      expect(row.length).toBe(key[i].length);
      row.forEach((v, c) => {
        const k = key[i][c];
        if (v === k) return;
        if (SPREAD_ROWS[i] && (c === 9 || c === 11 || c === 16)) { n.spread++; return; }
        if (typeof v === "string" && typeof k === "string" && v === normText(k)) {
          if (k.endsWith(" 00:00:00")) n.date++; else n.trim++;
          return;
        }
        if (typeof v === "number" && typeof k === "number" && c >= 9 && c <= 15 && v - k === 1 && k % 2 === 0) { n.round++; return; }
        expect.fail(`bl[${i}][${c}]: mine ${JSON.stringify(v)} vs his data ${JSON.stringify(k)}`);
      });
    });
    for (const [i, s] of Object.entries(SPREAD_ROWS)) {
      expect([mine[+i][9], mine[+i][11], mine[+i][16]]).toEqual([s.po, s.unbilled, s.flag]);
      expect(mine[+i][7]).toBe("2505004341");
    }
    expect(n).toEqual({ date: 26, trim: 50, round: 143, spread: 6 }); // measured counts; any new divergence fails above or here
  });
  it("equals his built-in data (br), except cents rounding (JS round(v,2) in template.html ~507 vs billraw.py round(x,2))", () => {
    const key = answerKey<BillingData["br"]>("billraw.json");
    expect(r!.data.br.h).toEqual(key.h);
    expect(r!.data.br.r.length).toBe(key.r.length);
    let rounded = 0;
    r!.data.br.r.forEach((row, i) => row.forEach((v, c) => {
      const k = key.r[i][c];
      if (v === k) return;
      if (typeof v === "number" && typeof k === "number" && Math.round((v - k) * 100) === 1) { rounded++; return; }
      expect.fail(`br[${i}][${c}]: mine ${JSON.stringify(v)} vs his data ${JSON.stringify(k)}`);
    }));
    expect(rounded).toBe(132); // measured count; any new divergence fails above or here
  });
  it("labels the file", () => {
    expect(r!.label).toBe("Billing master, 2,956 lines");
  });
});
describe("Billing master rules", () => {
  it("needs the Master sheet", () => {
    expect(() => readBilling(open(makeXlsx([{ name: "Sheet1", rows: [H] }])))).toThrow(new ReadError('Sheet "Master" wasn\'t found in this file.'));
  });
  it("counts a bill split across lines once (same PO and invoice, same amounts)", () => {
    const line = (sl: number) => [sl, "Asiatic", "Toiletries", "Savlon Soap", "Oct'26", "TVC", "PO1", 100, 115, "INV1", 115, 100, 0, 0, 0, 15, 0, "", "", "", "", ""];
    const r = readBilling(open(makeXlsx([{ name: "Master", rows: [H, line(1), line(2)] }])));
    expect(r.data.bl.map((x) => x[9])).toEqual([58, 58]); // 115 shared between the two lines, his Math.round(115 * 0.5)
    expect(r.data.bl.map((x) => x[16])).toEqual([1, 1]);
  });
});
