import { describe, expect, it } from "vitest";
import { channelLabel, channelSummary, readChannel, type ChannelData } from "./channel";
import { ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";
const open = (b: Buffer) => openWorkbook(new Uint8Array(b));

describe.skipIf(!hasClientFiles)("Channel Cost: the real file", () => {
  it("equals his built-in data", () => {
    const r = readChannel(open(clientFile("Channel_Cost_26-27_Nov26_Updated_V5_11.11.26.xlsx")));
    expect(r.data).toEqual(answerKey<ChannelData>("channel.json"));
    expect(r.datasetKey).toBe("channel");
    expect(r.label).toBe("Channel Cost, Jul'26 to Nov'26");
  });
});
describe("Channel Cost read errors", () => {
  it("refuses when none of the three sheets has rows", () => {
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name"], []] }, { name: "Digital", rows: [["SL", "Platform"]] }, { name: "Press & Radio", rows: [["SL", "Name"]] }]);
    expect(() => readChannel(open(b))).toThrow(new ReadError("None of the Electronic, Digital or Press & Radio sheets had rows."));
  });
  it("warns about a missing sheet and a row whose months don't add up to its total", () => {
    const months = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name", ...months], [], [1, "ATN Bangla", 100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 999]] }]);
    const r = readChannel(open(b));
    expect(r.warnings).toEqual(expect.arrayContaining(['No "Digital" sheet', 'No "Press & Radio" sheet']));
    expect(r.data.elec.notes).toEqual([["ATN Bangla", 300, 999]]);
  });
  it("builds its label and summary with the shared builders", () => {
    const months = ["July'26", "Aug'26", "Sep'26", "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27", "Apr'27", "May'27", "Jun'27", "Total"];
    const b = makeXlsx([{ name: "Electronic", rows: [["SL", "Channel Name", ...months], [], [1, "ATN Bangla", 1500000, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1500200]] }]);
    const r = readChannel(open(b));
    expect(r.label).toBe("Channel Cost, Jul'26 to Aug'26");
    expect(r.label).toBe(channelLabel(r.months));
    expect(r.summary).toBe("Electronic 1.50 Mn · Digital 0.00 Mn · Press & Radio 0.00 Mn");
    expect(r.summary).toBe(channelSummary(r.data));
    expect(channelLabel([])).toBe("Channel Cost");
  });
});
