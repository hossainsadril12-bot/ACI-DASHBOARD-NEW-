import { describe, expect, it } from "vitest";
import { FY_MEDIA } from "@/lib/manual/rules";
import { CHANNEL_COLORS, MEDIUM_BG, MEDIUM_TEXT } from "./channel-colors";

describe("MEDIUM_BG", () => {
  it("gives each FY medium the fill of its channel colour (Print uses PRESS)", () => {
    const code = { TV: "TV", Digital: "DIGITAL", Print: "PRESS", OOH: "OOH" } as const;
    for (const m of FY_MEDIA) expect(CHANNEL_COLORS[code[m]].split(" ")[0], m).toBe(MEDIUM_BG[m]);
  });
  it("gives each medium a text colour of the same hue", () => {
    for (const m of FY_MEDIA) expect(MEDIUM_TEXT[m].replace(/^text-(\w+)-\d+$/, "$1"), m).toBe(MEDIUM_BG[m].replace(/^bg-(\w+)-\d+$/, "$1"));
  });
});
