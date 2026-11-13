import { describe, expect, it } from "vitest";
import { salesFromOrder } from "../../app/lib/sales";
import { parseScanCsv } from "../../app/lib/scans/parse";
import { generateScans } from "../../scripts/gen-scans";
import { chronicShorts, readRates, trendPoints, type UnitInfo, type VariantStock } from "../../app/lib/scans/reconcile";

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

describe("trendPoints", () => {
  it("builds one point per full count, oldest first, with totals and per-category rates", () => {
    const row = (d: string, category: string, expected: number, raw: number, adjusted: number) => ({ takenAt: new Date(d), category, expected, raw, adjusted });
    const points = trendPoints([
      row("2026-11-08T08:00:00Z", "bra", 100, 94, 93),
      row("2026-11-01T08:00:00Z", "bra", 100, 97, 97),
      row("2026-11-01T08:00:00Z", "top", 300, 297, 297),
      row("2026-11-08T08:00:00Z", "top", 0, 0, 0),
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-11-01", "2026-11-08"]);
    expect(points[0].adjustedRate).toBeCloseTo(394 / 400);
    expect(points[1]).toMatchObject({ rawRate: 0.94, adjustedRate: 0.93, byCategory: { bra: 0.93, top: null } });
  });
});

describe("salesFromOrder", () => {
  it("sums units per variant on the order's UTC day and skips lines it can't trust", () => {
    const sales = salesFromOrder({
      created_at: "2026-11-16T23:30:00-05:00",
      line_items: [
        { variant_id: 11, quantity: 2 },
        { variant_id: 11, quantity: 1 },
        { variant_id: null, quantity: 1 }, // custom item
        { variant_id: 12, quantity: -3 },
        { variant_id: 13, quantity: 1.5 },
      ],
    });
    expect(sales).toEqual([{ variantId: "gid://shopify/ProductVariant/11", date: new Date("2026-11-16T00:00:00Z"), units: 3 }]);
  });

  it("returns nothing for a payload with no usable date", () => {
    expect(salesFromOrder({ line_items: [{ variant_id: 1, quantity: 1 }] })).toEqual([]);
  });
});

describe("generated scan data", () => {
  const { files, messy } = generateScans();

  it("parses every generated scan cleanly", () => {
    for (const f of files) {
      const r = parseScanCsv(f.csv, new Date(`${f.date}T08:00:00Z`));
      expect(r.errors, f.name).toEqual([]);
      expect(r.duplicates, f.name).toBe(0);
    }
  });

  it("recovers the good rows from a messy reader export and reports the rest", () => {
    const r = parseScanCsv(messy.csv, new Date("2026-11-16T08:00:00Z"));
    expect(r.reads).toHaveLength(messy.expect.reads);
    expect(r.duplicates).toBe(messy.expect.duplicates);
    expect(r.errors).toHaveLength(messy.expect.badRows);
    expect(r.reads.filter((x) => x.epc.startsWith("E2801170"))).toHaveLength(messy.expect.unknown);
    expect(r.reads.every((x) => x.area && !Number.isNaN(x.readAt.getTime()))).toBe(true);
  });
});
