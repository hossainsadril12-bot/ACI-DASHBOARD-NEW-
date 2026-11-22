import { describe, expect, it } from "vitest";
import type { ActiveVersion } from "@/store/datasets";
import { dataUpdatedLine } from "./data-updated";

const v = (datasetKey: string, kind: string, iso: string): ActiveVersion =>
  ({ datasetKey, kind, label: datasetKey, fileName: null, createdAt: new Date(iso), source: "upload" });

describe("dataUpdatedLine", () => {
  it("is null for an empty store", () => {
    expect(dataUpdatedLine([])).toBeNull();
  });
  it("shows the latest date per file kind, in the file order, in Dhaka time", () => {
    const line = dataUpdatedLine([
      v("channel", "channel", "2026-11-11T05:00:00Z"),
      v("atl:lux", "atl", "2026-10-01T05:00:00Z"),
      v("atl:savlon-soap", "atl", "2026-10-20T20:30:00Z"), // 21 Oct in Dhaka (UTC+6)
      v("fy", "fy", "2026-10-27T05:00:00Z"),
    ]);
    expect(line).toBe("Data updated: ATL 21 Oct 2026 · FY spend 27 Oct 2026 · channel cost 11 Nov 2026");
  });
  it("ignores kinds it does not know", () => {
    expect(dataUpdatedLine([v("spend", "spend", "2026-10-01T05:00:00Z")])).toBeNull();
  });
});
