import { describe, expect, it } from "vitest";
import { readCalendar, type CalendarData } from "./calendar";
import { READERS } from "./index";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("Activity Calendar: the real file", () => {
  const r = hasClientFiles ? readCalendar(open(clientFile("All_Activity_Calender_FY_26-27.xlsx"))) : null;
  it("matches his built-in data", () => {
    expect(r!.data).toEqual(answerKey<CalendarData>("calendar.json"));
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
  it("skips hidden sheets", () => {
    const r = readCalendar(open(makeXlsx([{ ...sheet("Oct'26"), hidden: true }, sheet("Nov'26")])));
    expect(r.months).toEqual(["2026-11"]);
  });
  it("is registered with the ATL and Digital readers", () => {
    expect(Object.keys(READERS).sort()).toEqual(["atl", "billing", "calendar", "channel", "digital", "fy"]);
  });
});
