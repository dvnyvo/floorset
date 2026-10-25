import { describe, expect, it } from "vitest";
import { chronicShorts, readRates, type UnitInfo, type VariantStock } from "../../app/lib/scans/reconcile";

const variants: VariantStock[] = [
  { variantId: "v1", sku: "A-S", productTitle: "Legging A", size: "S", category: "legging", onHand: 10 },
  { variantId: "v2", sku: "B-S", productTitle: "Bra B", size: "S", category: "bra", onHand: 20 },
];
const units = new Map<string, UnitInfo>();
for (let i = 0; i < 10; i++) units.set(`L${i}`, { variantId: "v1", status: "in_stock" });
for (let i = 0; i < 20; i++) units.set(`B${i}`, { variantId: "v2", status: "in_stock" });

describe("readRates", () => {
  it("computes raw and adjusted rates and flags below 95%", () => {
    const reads = [...Array.from({ length: 10 }, (_, i) => `L${i}`), ...Array.from({ length: 18 }, (_, i) => `B${i}`), "UNKNOWN"];
    const ghosts = new Set(["L0", "L1"]); // two legging tags are loose: items gone
    const r = readRates({ variants, units, readEpcs: reads, ghostEpcs: ghosts });

    const legging = r.byCategory.find((c) => c.key === "legging")!;
    expect(legging).toMatchObject({ expected: 10, raw: 10, adjusted: 8, rawRate: 1, adjustedRate: 0.8, belowTarget: true });
    const bra = r.byCategory.find((c) => c.key === "bra")!;
    expect(bra).toMatchObject({ raw: 18, adjustedRate: 0.9, belowTarget: true });
    expect(r.total).toMatchObject({ expected: 30, raw: 28, adjusted: 26 });
    expect(r.unknownEpcs).toBe(1);
  });

  it("returns a null rate when nothing is expected", () => {
    const r = readRates({ variants: [{ ...variants[0], onHand: 0 }], units, readEpcs: [], ghostEpcs: new Set() });
    expect(r.bySku[0]).toMatchObject({ rawRate: null, belowTarget: false });
  });
});

describe("chronicShorts", () => {
  const rows = (shortKeys: string[]) =>
    ["v1", "v2", "v3"].map((key) => ({
      key, label: key, expected: 5, raw: 5, adjusted: shortKeys.includes(key) ? 4 : 5,
      rawRate: 1, adjustedRate: 1, belowTarget: false,
    }));

  it("finds variants short in every count", () => {
    expect(chronicShorts([rows(["v1", "v2"]), rows(["v1"]), rows(["v1", "v3"])])).toEqual(["v1"]);
  });
  it("needs at least two counts", () => {
    expect(chronicShorts([rows(["v1"])])).toEqual([]);
  });
});
