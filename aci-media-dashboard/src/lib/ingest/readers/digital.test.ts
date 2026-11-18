import { describe, expect, it } from "vitest";
import { digitalBrands, readDigital, type DigitalData } from "./digital";
import { NeedsBusinessError, ReadError } from "../read-result";
import { openWorkbook } from "../workbook";
import { answerKey, clientFile, hasClientFiles, makeXlsx } from "../test-workbooks";

const open = (b: Buffer) => openWorkbook(new Uint8Array(b));
const FILES = [
  ["Toiletries_Business_Digital_Media_Data_FY_26-27.xlsx", "Toiletries"],
  ["Hygiene_Business.xlsx", "Hygiene"],
  ["Salt_Business.xlsx", "Salt"],
] as const;

type KeyRow = DigitalData["raw"]["Meta"][number] & { ob?: string };

/**
 * digraw.json was made by his source/scripts/digraw.py, not by parseDigital. Two known differences:
 * - digraw.py line 48 adds `ob` (the brand as written in the sheet); template.html never produces or reads it, so it is dropped.
 * - template.html line 602 fills an empty Content Type with "Master TVC – …" for Savlon rows; digraw.py does not.
 *   That hits exactly these 3 Toiletries YouTube rows, so their expected Content Type is patched to his live upload's value.
 * Every other raw row must be equal as is.
 */
const LINE_602_FILL: Record<string, string> = {
  "Savlon Relaunch - All Placement": "Master TVC – All Placement",
  "Savlon Relaunch - TV": "Master TVC – TV",
  "Savlon Relaunch - Mobile": "Master TVC – Mobile",
};
function expectedRaw(rows: KeyRow[], biz: string, plat: string): DigitalData["raw"]["Meta"] {
  return rows.filter((x) => x.bz === biz).map(({ ob, ...row }) => {
    const fill = biz === "Toiletries" && plat === "YouTube" && ob ? LINE_602_FILL[ob] : undefined;
    if (!fill) return row;
    expect(row.r[2], `${ob}: the key's Content Type`).toBeNull();
    return { ...row, r: row.r.map((v, i) => (i === 2 ? fill : v)) };
  });
}

describe.skipIf(!hasClientFiles)("Digital: the 3 real files match his built-in data", () => {
  const dig3 = hasClientFiles ? answerKey<DigitalData["dig"]>("dig3.json") : [];
  const digraw = hasClientFiles ? answerKey<{ rows: Record<"Meta" | "YouTube" | "TikTok", KeyRow[]> }>("digraw.json") : { rows: { Meta: [], YouTube: [], TikTok: [] } };
  it("patches exactly the 3 known line-602 rows", () => {
    const hits = digraw.rows.YouTube.filter((x) => x.bz === "Toiletries" && x.ob && x.ob in LINE_602_FILL);
    expect(hits.map((x) => x.ob)).toEqual(Object.keys(LINE_602_FILL));
  });
  it.each(FILES)("%s is %s and equals his data", (file, biz) => {
    const r = readDigital(open(clientFile(file)), { fileName: "renamed.xlsx", business: { slug: biz.toLowerCase(), name: biz } });
    expect(r.datasetKey).toBe(`digital:${biz.toLowerCase()}`);
    expect(r.label).toMatch(new RegExp(`^Digital, ${biz}, \\w{3}'\\d{2} to \\w{3}'\\d{2}$`));
    expect(r.data.dig).toEqual(dig3.filter((x) => x.bz === biz));
    for (const p of ["Meta", "YouTube", "TikTok"] as const) expect(r.data.raw[p], p).toEqual(expectedRaw(digraw.rows[p], biz, p));
  });
});

describe("Digital read errors", () => {
  const sheet = (name: string, rows: unknown[][]) => ({ name, rows });
  const head = ["Brand", "Month", "Content Type", "Content Link", "Bid Type", "Reach", "Impressions", "Spent (USD)"];
  const SALT = { slug: "salt", name: "Salt" };
  it("asks for the business whenever the caller has none, even when the brands would settle it", () => {
    const b = makeXlsx([sheet("Meta", [head, [], ["Freedom Sanitary Napkin", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(() => readDigital(open(b), { fileName: "Hygiene_Business.xlsx" })).toThrow(new NeedsBusinessError("Pick the business."));
    expect(() => readDigital(open(b), { fileName: "Hygiene_Business.xlsx", business: null })).toThrow(NeedsBusinessError);
  });
  it("uses the caller's business for the key, label and every row", () => {
    const b = makeXlsx([sheet("Meta", [head, [], ["Mystery Brand", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    const r = readDigital(open(b), { fileName: "digital.xlsx", business: { slug: "home-care", name: "Home Care" } });
    expect(r.datasetKey).toBe("digital:home-care");
    expect(r.label).toBe("Digital, Home Care, Jul'26 to Jul'26");
    expect(r.summary).toMatch(/^Home Care: 1 ads/);
    expect(r.data.dig.map((o) => o.bz)).toEqual(["Home Care"]);
    expect(r.data.raw.Meta.map((o) => o.bz)).toEqual(["Home Care"]);
  });
  it("does not throw on a brand cell named like a prototype key", () => {
    const b = makeXlsx([sheet("Meta", [head, [], ["constructor", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(readDigital(open(b), { fileName: "digital.xlsx", business: SALT }).datasetKey).toBe("digital:salt");
  });
  it("lists the brands, skipping a percentage sub-header row 2", () => {
    const sub = ["Savlon Soap", null, null, null, null, null, null, 0.25];
    const b = makeXlsx([sheet("Meta", [head, sub, ["Freedom Sanitary Napkin", "Jul'26", "Video", "https://facebook.com/x", "CPV", 10, 100, 5]]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(digitalBrands(open(b))).toEqual(["Freedom Sanitary Napkin"]);
  });
  it("refuses a file with no ad rows", () => {
    const b = makeXlsx([sheet("Meta", [head]), sheet("YouTube", [head]), sheet("TikTok", [head])]);
    expect(() => readDigital(open(b), { fileName: "Salt.xlsx", business: SALT })).toThrow(new ReadError("No ad rows were found in the Meta, YouTube or TikTok sheets."));
  });
});
