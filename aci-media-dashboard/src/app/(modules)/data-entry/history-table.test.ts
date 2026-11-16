import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HistoryRow } from "@/store/datasets";
import { HistoryTable } from "./history-table";

const row = (versionId: number): HistoryRow => ({
  versionId, datasetKey: "calendar", kind: "calendar", label: `L ${versionId}`, source: "upload",
  summary: { rowCount: 1 }, fileId: null, fileName: null, createdAt: new Date(Date.UTC(2026, 10, 16)), isActive: false,
});
const render = (n: number) => renderToStaticMarkup(createElement(HistoryTable, { rows: Array.from({ length: n }, (_, i) => row(i + 1)), admin: false }));

describe("HistoryTable", () => {
  it("says it shows only the latest 200 when the list is cut at 200", () => {
    expect(render(200)).toContain("Showing the latest 200 uploads.");
  });
  it("says nothing about a limit when there are fewer rows", () => {
    expect(render(3)).not.toContain("Showing the latest 200 uploads.");
  });
});
