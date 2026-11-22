import { describe, expect, it } from "vitest";
import { BAD_AMOUNT } from "@/lib/manual/rules";
import {
  CHANNEL_TABS, addChannelRow, amountText, channelDraft, channelInput, isDirty, readAmount, removeChannelRow, setChannelAmount, setChannelName,
} from "./manual-drafts";

const months = (jul: number) => [jul, ...Array.from({ length: 11 }, () => 0)];
const blank11 = () => Array.from({ length: 11 }, () => "");

describe("amounts", () => {
  it("reads blank as null, allows commas, refuses text", () => {
    expect(readAmount("")).toEqual({ ok: true, value: null });
    expect(readAmount(" 1,250.5 ")).toEqual({ ok: true, value: 1250.5 });
    expect(readAmount("-3")).toEqual({ ok: true, value: -3 });
    expect(readAmount("12a")).toEqual({ ok: false });
    expect(readAmount("Infinity")).toEqual({ ok: false });
  });
  it("shows 0 as a blank box", () => {
    expect([amountText(0), amountText(1500), amountText(0.25)]).toEqual(["", "1500", "0.25"]);
  });
});

describe("channel draft", () => {
  const data = {
    elec: { rows: [{ sl: 7, n: "ATN Bangla", m: months(100000) }], notes: [] },
    dig: { rows: [], notes: [] },
    press: { rows: [{ sl: "x", n: "Prothom Alo", m: months(0) }], notes: [["Prothom Alo", 1, 2]] },
  };
  it("names its three sheets, columns and add buttons as the design does", () => {
    expect(CHANNEL_TABS.map((t) => [t.key, t.label, t.column, t.add])).toEqual([
      ["elec", "Electronic", "Channel", "+ Add channel"],
      ["dig", "Digital", "Platform", "+ Add platform"],
      ["press", "Press & Radio", "Newspaper / station", "+ Add newspaper / station"],
    ]);
  });
  it("makes boxes from the data, 0 as blank", () => {
    expect(channelDraft(data)).toEqual({
      elec: [{ key: "elec-0", n: "ATN Bangla", m: ["100000", ...blank11()] }],
      dig: [],
      press: [{ key: "press-0", n: "Prothom Alo", m: ["", ...blank11()] }],
    });
  });
  it("adds, renames, types and removes rows on one sheet only, and knows when it is back to what was loaded", () => {
    const start = channelDraft(data);
    let d = addChannelRow(start, "dig", "k1");
    d = setChannelName(d, "dig", "k1", "Facebook");
    d = setChannelAmount(d, "dig", "k1", 1, "2,000");
    expect(d.dig).toEqual([{ key: "k1", n: "Facebook", m: ["", "2,000", ...blank11().slice(1)] }]);
    expect(d.elec).toBe(start.elec);
    expect(isDirty(d, start)).toBe(true);
    expect(isDirty(removeChannelRow(d, "dig", "k1"), start)).toBe(false);
  });
  it("sends blank as 0 and refuses a box that is not a number", () => {
    const d = setChannelAmount(channelDraft(data), "elec", "elec-0", 2, "");
    expect(channelInput(d)).toEqual({ ok: true, data: { elec: [{ n: "ATN Bangla", m: months(100000) }], dig: [], press: [{ n: "Prothom Alo", m: months(0) }] } });
    expect(channelInput(setChannelAmount(d, "press", "press-0", 0, "abc"))).toEqual({ ok: false, error: BAD_AMOUNT });
  });
});
