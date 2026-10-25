import { describe, expect, it } from "vitest";
import { parseScanCsv } from "../../app/lib/scans/parse";

const NOW = new Date("2026-11-15T08:00:00Z");
const EPC1 = "303400000000000000000001";
const EPC2 = "303400000000000000000002";

describe("parseScanCsv", () => {
  it("parses epc, area and read_at", () => {
    const r = parseScanCsv(`epc,area,read_at\n${EPC1},Zone 1,2026-11-15T08:30:00Z\n`, NOW);
    expect(r.errors).toEqual([]);
    expect(r.reads).toEqual([{ epc: EPC1, area: "Zone 1", readAt: new Date("2026-11-15T08:30:00Z") }]);
  });

  it("works with only an epc column and normalizes case", () => {
    const r = parseScanCsv(`EPC\r\n${EPC1.toLowerCase()}\r\n`, NOW);
    expect(r.reads).toEqual([{ epc: EPC1, area: null, readAt: NOW }]);
  });

  it("drops repeat reads of the same tag", () => {
    const r = parseScanCsv(`epc\n${EPC1}\n${EPC2}\n${EPC1}\n`, NOW);
    expect(r.reads.map((x) => x.epc)).toEqual([EPC1, EPC2]);
    expect(r.duplicates).toBe(1);
  });

  it("reports bad rows without storing them", () => {
    const r = parseScanCsv(`epc,read_at\nnot-an-epc,\n${EPC1},yesterday\n${EPC2},\n`, NOW);
    expect(r.reads.map((x) => x.epc)).toEqual([EPC2]);
    expect(r.errors).toEqual([
      'Row 2: "NOT-AN-EPC" is not a 24-character hex EPC',
      'Row 3: invalid read_at "yesterday"',
    ]);
  });

  it("rejects files without an epc column or over the row limit", () => {
    expect(parseScanCsv("tag,area\nx,y", NOW).errors[0]).toMatch(/Missing an "epc" column/);
    expect(parseScanCsv(`epc\n${EPC1}\n${EPC2}`, NOW, 1).errors[0]).toMatch(/Too many rows/);
    expect(parseScanCsv("", NOW).errors).toEqual(["File is empty"]);
  });
});
