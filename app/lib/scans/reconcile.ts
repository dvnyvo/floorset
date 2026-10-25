// Reconciles a full-count scan against Shopify on-hand. Pure: callers pass in the data.

export const READ_RATE_TARGET = 0.95;

export interface VariantStock {
  variantId: string;
  sku: string;
  productTitle: string;
  size: string;
  category: string;
  onHand: number; // Shopify on_hand (available + damaged etc.)
}
export interface UnitInfo {
  variantId: string;
  status: string;
}
export interface RateRow {
  key: string; // variantId or category
  label: string;
  expected: number;
  raw: number; // reads of this key's tags, loose tags included
  adjusted: number; // reads excluding suspected loose (ghost) tags
  rawRate: number | null;
  adjustedRate: number | null;
  belowTarget: boolean;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : null);

function row(key: string, label: string, expected: number, raw: number, adjusted: number): RateRow {
  const adjustedRate = rate(adjusted, expected);
  return { key, label, expected, raw, adjusted, rawRate: rate(raw, expected), adjustedRate, belowTarget: adjustedRate !== null && adjustedRate < READ_RATE_TARGET };
}

export function readRates(input: {
  variants: VariantStock[];
  units: Map<string, UnitInfo>; // epc -> unit
  readEpcs: Iterable<string>;
  ghostEpcs: Set<string>;
}) {
  const raw = new Map<string, number>();
  const adj = new Map<string, number>();
  let unknown = 0;
  for (const epc of input.readEpcs) {
    const u = input.units.get(epc);
    if (!u) {
      unknown++;
      continue;
    }
    raw.set(u.variantId, (raw.get(u.variantId) ?? 0) + 1);
    if (!input.ghostEpcs.has(epc)) adj.set(u.variantId, (adj.get(u.variantId) ?? 0) + 1);
  }

  const bySku = input.variants.map((v) =>
    row(v.variantId, `${v.productTitle} / ${v.size}`, v.onHand, raw.get(v.variantId) ?? 0, adj.get(v.variantId) ?? 0),
  );

  const cats = new Map<string, { e: number; r: number; a: number }>();
  input.variants.forEach((v, i) => {
    const c = cats.get(v.category) ?? { e: 0, r: 0, a: 0 };
    c.e += v.onHand;
    c.r += bySku[i].raw;
    c.a += bySku[i].adjusted;
    cats.set(v.category, c);
  });
  const byCategory = [...cats].map(([k, c]) => row(k, k, c.e, c.r, c.a)).sort((a, b) => a.key.localeCompare(b.key));

  const t = byCategory.reduce((s, c) => ({ e: s.e + c.expected, r: s.r + c.raw, a: s.a + c.adjusted }), { e: 0, r: 0, a: 0 });
  return { total: row("total", "All", t.e, t.r, t.a), byCategory, bySku, unknownEpcs: unknown };
}

/** Variants read short (fewer tags than on-hand) in every one of the given counts. */
export function chronicShorts(perCount: RateRow[][], minCounts = 2): string[] {
  if (perCount.length < minCounts) return [];
  const [first, ...rest] = perCount.map((rows) => new Set(rows.filter((r) => r.adjusted < r.expected).map((r) => r.key)));
  return [...first].filter((k) => rest.every((s) => s.has(k)));
}
