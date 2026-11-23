import { describe, expect, it } from "vitest";
import { readCalendar, type CalendarData } from "./calendar";
import { READERS } from "./index";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("Activity Calendar: the real file", () => {
  const r = hasClientFiles ? readCalendar(open(clientFile("All_Activity_Calender_FY_26-27.xlsx"))) : null;
  it("matches his built-in data", () => {
    // His built-in data is 4-decimal; the reader keeps 6, so names match exactly and numbers to 4 places.
    const key = answerKey<CalendarData>("calendar.json");
    expect(r!.data.months).toHaveLength(key.months.length);
    r!.data.months.forEach((m, i) => {
      const k = key.months[i];
      expect({ m: m.m, label: m.label, notes: m.notes }).toEqual({ m: k.m, label: k.label, notes: k.notes });
      expect(m.rows).toHaveLength(k.rows.length);
      m.rows.forEach((row, j) => {
        const kr = k.rows[j];
        expect({ biz: row.biz, b: row.b }).toEqual({ biz: kr.biz, b: kr.b });
        expect(row.v).toHaveLength(kr.v.length);
        // Each of his numbers is ours rounded to 4 places, so at most half a unit (0.00005, inclusive: 1.72555 -> 1.7256) away.
        row.v.forEach((x, n) => expect(Math.abs(x - kr.v[n]), `${m.m} ${row.b} v[${n}]`).toBeLessThanOrEqual(0.00005 + 1e-9));
        // His t is the sum of his already-rounded parts (0.0707 + 0.5753 = 0.646 for Septex Aug'26),
        // so it can be up to 4 x 0.00005 away from ours; ours must be the sum of our own parts.
        expect(Math.abs(row.t - kr.t), `${m.m} ${row.b} t`).toBeLessThanOrEqual(4 * 0.00005 + 1e-9);
        expect(row.t, `${m.m} ${row.b} t = sum of v`).toBeCloseTo(row.v.reduce((a, x) => a + x, 0), 6);
      });
    });
  });
  it("Oct'26 grand total is 39.327 Mn (PRD acceptance check)", () => {
    const oct = r!.data.months.find((m) => m.m === "2026-10")!;
    expect(oct.rows.reduce((t, x) => t + x.t, 0)).toBeCloseTo(39.327, 3);
  });
  it("labels and keys", () => {
    expect(r!.datasetKey).toBe("calendar");
    expect(r!.label).toBe("Activity Calendar, Jul'26 to Oct'26");
    expect(r!.months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });
});

describe("Activity Calendar read errors and warnings", () => {
  const sheet = (name: string, extra: unknown[][] = [["Grand Total", null, 1, 0.5, 0, 0, 1.5]]) => ({
    name, rows: [[`CB Media Activity ${name}`], ["Business", "Brand", "Media"], [null, null, "TV", "Digital", "Print", "OOH", "Total"], ["Toiletries", "Savlon Soap", 1, 0.5, 0, 0, 1.5], ...extra],
  });
  it("refuses a workbook with no month sheets", () => {
    expect(() => readCalendar(open(makeXlsx([{ name: "Notes", rows: [["hi"]] }])))).toThrow(/No monthly sheets were recognised/);
  });
  it("warns when a sheet has no Grand Total row, and still reads it", () => {
    const r = readCalendar(open(makeXlsx([sheet("Nov'26", [])])));
    expect(r.data.months[0].rows).toHaveLength(1);
    expect(r.warnings).toContain('Sheet "Nov\'26" has no Grand Total row; read to the last row.');
  });
  it("keeps 6 decimals in each medium and the row total", () => {
    const r = readCalendar(open(makeXlsx([sheet("Nov'26", [["Hygiene", "Angel", 0.1234567, 0.0000014, 0, 0, 0.1234581], ["Grand Total"]])])));
    const angel = r.data.months[0].rows.find((x) => x.b === "Angel")!;
    expect(angel.v).toEqual([0.123457, 0.000001, 0, 0]);
    expect(angel.t).toBe(0.123458);
  });
  it("skips hidden sheets", () => {
    const r = readCalendar(open(makeXlsx([{ ...sheet("Oct'26"), hidden: true }, sheet("Nov'26")])));
    expect(r.months).toEqual(["2026-11"]);
  });
  it("is registered with the ATL and Digital readers", () => {
    expect(Object.keys(READERS).sort()).toEqual(["atl", "billboard", "billing", "calendar", "channel", "digital", "fy", "ooh-sites"]);
  });
});
