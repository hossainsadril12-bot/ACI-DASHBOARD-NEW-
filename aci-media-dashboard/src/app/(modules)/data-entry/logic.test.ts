import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilePreview } from "@/server/ingest";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  canPublishAll, greyReason, postUploads, publishButtonLabel, publishedMessage, rowStatus, uploadForm, whenDhaka,
} from "./logic";

const preview = (over: Partial<FilePreview> = {}): FilePreview => ({
  index: 0, fileName: "atl.xlsx", sizeBytes: 10, sha256: "x",
  detection: { status: "sure", type: "atl" }, type: "atl",
  label: "ATL, Savlon Soap, Jul'26 to Oct'26", summary: "4 months", datasetKey: "atl:soap",
  rowCount: 12, warnings: [], errors: [], canPublish: true, blockReason: null, ...over,
});

describe("rowStatus", () => {
  it("is ready when the file can be published", () => {
    expect(rowStatus(preview())).toBe("ready");
  });
  it("needs a type when detection was unsure", () => {
    expect(rowStatus(preview({ canPublish: false, type: null, blockReason: "Pick the file type." }))).toBe("needs-type");
  });
  it("is blocked for any other reason", () => {
    expect(rowStatus(preview({ canPublish: false, blockReason: "Fix the read error first.", errors: ["Bad sheet"] }))).toBe("blocked");
  });
});

describe("greyReason", () => {
  it("shows the block reason when it is not already an error", () => {
    expect(greyReason(preview({ canPublish: false, blockReason: "Fix the read error first.", errors: ["Bad sheet"] }))).toBe("Fix the read error first.");
  });
  it("hides the block reason when it is already listed as an error", () => {
    const r = "This file could not be opened as an Excel workbook.";
    expect(greyReason(preview({ canPublish: false, blockReason: r, errors: [r] }))).toBeNull();
  });
  it("is empty for a ready row", () => {
    expect(greyReason(preview())).toBeNull();
  });
});

describe("canPublishAll", () => {
  it("needs every row ready", () => {
    expect(canPublishAll([preview(), preview({ index: 1 })], 2)).toBe(true);
    expect(canPublishAll([preview(), preview({ index: 1, canPublish: false, blockReason: "Pick the file type." })], 2)).toBe(false);
  });
  it("needs at least one row and previews for every file", () => {
    expect(canPublishAll([], 0)).toBe(false);
    expect(canPublishAll(null, 1)).toBe(false);
    expect(canPublishAll([preview()], 2)).toBe(false);
  });
});

describe("texts", () => {
  it("names the files that were published", () => {
    expect(publishedMessage([{ label: "ATL, Savlon Soap" }, { label: "Activity Calendar" }])).toBe("Published 2 files: ATL, Savlon Soap; Activity Calendar");
    expect(publishedMessage([{ label: "Activity Calendar" }])).toBe("Published 1 file: Activity Calendar");
  });
  it("counts the files on the publish button", () => {
    expect(publishButtonLabel(3)).toBe("Publish 3 files");
    expect(publishButtonLabel(1)).toBe("Publish 1 file");
  });
  it("shows the time in Dhaka", () => {
    expect(whenDhaka(new Date("2026-11-16T08:05:00Z"))).toBe("16 Nov 2026, 14:05");
  });
});

describe("uploadForm", () => {
  it("sends every file in order and only the chosen types", () => {
    const a = new File(["a"], "a.xlsx");
    const b = new File(["b"], "b.xlsx");
    const fd = uploadForm([a, b], ["", "calendar"]);
    expect(fd.getAll("files").map((f) => (f as File).name)).toEqual(["a.xlsx", "b.xlsx"]);
    expect(fd.get("type-0")).toBeNull();
    expect(fd.get("type-1")).toBe("calendar");
  });
});

describe("postUploads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the JSON body on success", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: null, ok: true, previews: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const fd = new FormData();
    expect(await postUploads("/api/uploads/preview", fd)).toEqual({ error: null, ok: true, previews: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/preview", { method: "POST", body: fd });
  });
  it("shows the server's refusal as is", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Only the admin can do this." }, { status: 403 })));
    expect(await postUploads("/api/uploads/publish", new FormData())).toEqual({ error: "Only the admin can do this." });
  });
  it("gives a plain message when the reply is not JSON or the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502 })));
    expect((await postUploads("/api/uploads/publish", new FormData())).error).toBe("Something went wrong. Please try again.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect((await postUploads("/api/uploads/publish", new FormData())).error).toBe("The files could not be sent. Check the connection and try again.");
  });
});

describe("menu", () => {
  it("puts Data Entry in the Data group before Uploads & History", () => {
    const i = NAV_ITEMS.findIndex((n) => n.href === "/data-entry");
    expect(NAV_ITEMS[i]).toEqual({ href: "/data-entry", label: "Data Entry", group: "Data" });
    expect(i).toBe(NAV_ITEMS.findIndex((n) => n.href === "/uploads") - 1);
  });
});
