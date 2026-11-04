import { describe, expect, it } from "vitest";
import { confidence, detectGhosts } from "../../app/lib/scans/ghosts";

const units = new Map([
  ["A", { variantId: "v1", status: "in_stock" }],
  ["B", { variantId: "v1", status: "sold" }],
  ["C", { variantId: "v1", status: "in_stock" }],
  ["D", { variantId: "v1", status: "in_stock" }],
]);
const stockAreas = new Set(["Zone 1", "Zone 2", "Stockroom"]);
const scan = (...reads: [string, string][]) => reads.map(([epc, area]) => ({ epc, area }));

describe("detectGhosts", () => {
  const result = detectGhosts({
    units,
    stockAreas,
    scans: [
      scan(["A", "Zone 1"], ["B", "Zone 1"], ["C", "Fitting Room"], ["D", "Fitting Room"]),
      scan(["A", "Stockroom"], ["C", "Fitting Room"], ["D", "Zone 1"]),
      // A moves zones after a re-merchandise: still fine
      scan(["A", "Zone 2"], ["C", "Fitting Room"], ["X", "Fitting Room"]),
    ],
  });
  const by = (epc: string) => result.find((s) => s.epc === epc);

  it("ignores tags on the sales floor or in the stockroom, even after moving zones", () => {
    expect(by("A")).toBeUndefined();
  });
  it("flags a sold unit that still reads", () => {
    expect(by("B")?.signals).toEqual(["sold_but_read"]);
  });
  it("flags a tag stuck in one off-zone spot as never moving", () => {
    expect(by("C")).toMatchObject({ signals: ["wrong_area", "never_moves"], lastSeenArea: "Fitting Room", reads: 3 });
  });
  it("treats one fitting-room read (a try-on) as a weak signal", () => {
    expect(by("D")?.signals).toEqual(["wrong_area"]);
    expect(by("D")!.confidence).toBeLessThan(by("C")!.confidence);
  });
  it("skips unknown EPCs and sorts by confidence", () => {
    expect(by("X")).toBeUndefined();
    expect(result.map((s) => s.epc)).toEqual(["B", "C", "D"]);
  });
});

describe("confidence", () => {
  it("combines independent signals", () => {
    expect(confidence(["wrong_area", "never_moves"])).toBeCloseTo(0.76);
    expect(confidence([])).toBe(0);
  });
});
