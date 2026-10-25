// Loads what the pages need by combining Shopify (catalog, counts) with Floorset's DB (layout, scans, tags).
import db from "../db.server";
import { replenish } from "./engine/replenish";
import { SIZES, type FixtureType, type SizeCounts } from "./engine/types";
import { chronicShorts, readRates, type RateRow, type UnitInfo } from "./scans/reconcile";
import { fetchCatalog, type AdminClient, type CatalogVariant } from "./shopify/catalog.server";

export async function unitsByEpc() {
  const rows = await db.unit.findMany({ select: { epc: true, variantId: true, status: true } });
  return new Map<string, UnitInfo>(rows.map((u) => [u.epc, u]));
}

/** EPCs currently treated as loose tags: open suspects and confirmed loose tags. */
export async function ghostEpcs() {
  const rows = await db.ghostSuspect.findMany({
    where: { OR: [{ resolution: null }, { resolution: "loose_tag" }] },
    select: { epc: true },
  });
  return new Set(rows.map((r) => r.epc));
}

export async function loadDashboard(admin: AdminClient) {
  const counts = await db.scan.findMany({
    where: { type: "full_count" },
    orderBy: { takenAt: "desc" },
    take: 3,
    include: { tagReads: { select: { epc: true } } },
  });
  if (!counts.length) return { scan: null };

  const [{ variants }, units, ghosts] = await Promise.all([fetchCatalog(admin), unitsByEpc(), ghostEpcs()]);
  // shortcut: older counts are compared to today's on-hand; store on-hand snapshots per count for exact history.
  const perCount = counts.map((c) =>
    readRates({ variants, units, readEpcs: c.tagReads.map((t) => t.epc), ghostEpcs: ghosts }),
  );
  const latest = perCount[0];
  const label = new Map(latest.bySku.map((r) => [r.key, r]));
  const worst = (rows: RateRow[]) =>
    rows.filter((r) => r.belowTarget).sort((a, b) => (a.adjustedRate ?? 1) - (b.adjustedRate ?? 1));

  return {
    scan: { id: counts[0].id, takenAt: counts[0].takenAt.toISOString(), reads: counts[0].tagReads.length },
    countsCompared: counts.length,
    total: latest.total,
    byCategory: latest.byCategory,
    flaggedSkus: worst(latest.bySku).slice(0, 25),
    flaggedSkuCount: worst(latest.bySku).length,
    chronic: chronicShorts(perCount.map((p) => p.bySku)).map((k) => label.get(k)!),
    unknownEpcs: latest.unknownEpcs,
    ghostCount: ghosts.size,
  };
}

export interface SlotRow {
  slot: number;
  productId: string;
  productTitle: string;
  category: string;
  colorFamily: string;
  cadence: SizeCounts;
  floor: SizeCounts;
  back: SizeCounts;
  fill: SizeCounts;
  short: SizeCounts;
  swapOut: boolean;
  reason: string;
}

/** Floor scan vs each fixture's cadence vs back stock (Shopify available minus what's on the floor). */
export async function loadReplenishment(admin: AdminClient) {
  const scan = await db.scan.findFirst({
    where: { type: "floor" },
    orderBy: { takenAt: "desc" },
    include: { tagReads: { select: { epc: true } } },
  });
  if (!scan) return { scan: null, fixtures: [] };

  const [{ variants }, units, ghosts, fixtures, rules] = await Promise.all([
    fetchCatalog(admin),
    unitsByEpc(),
    ghostEpcs(),
    db.fixture.findMany({ include: { zone: true, placements: { orderBy: { slot: "asc" } } }, orderBy: { name: "asc" } }),
    db.cadenceRule.findMany(),
  ]);

  const onFloor = new Map<string, number>(); // variantId -> units read on the floor
  for (const { epc } of scan.tagReads) {
    const u = units.get(epc);
    if (!u || u.status === "sold" || ghosts.has(epc)) continue; // a sold or loose tag isn't stock on the floor
    onFloor.set(u.variantId, (onFloor.get(u.variantId) ?? 0) + 1);
  }
  const byProduct = groupBy(variants, (v) => v.productId);
  const cadenceFor = (type: string, category: string) =>
    rules.find((r) => r.fixtureType === type && r.category === category)?.sizeCounts as SizeCounts | undefined;

  return {
    scan: { id: scan.id, takenAt: scan.takenAt.toISOString(), reads: scan.tagReads.length },
    fixtures: fixtures.map((f) => ({
      id: f.id,
      name: f.name,
      zone: f.zone.name,
      type: f.type as FixtureType,
      slotCount: f.slotCount,
      slots: f.placements.map((pl): SlotRow => {
        const vs = byProduct.get(pl.productId) ?? [];
        const floor = sizeCounts(vs, (v) => onFloor.get(v.variantId) ?? 0);
        const back = sizeCounts(vs, (v) => Math.max(0, v.available - (onFloor.get(v.variantId) ?? 0)));
        const cadence = cadenceFor(f.type, vs[0]?.category ?? "");
        const r = replenish(cadence, floor, back);
        return {
          slot: pl.slot,
          productId: pl.productId,
          productTitle: vs[0]?.productTitle ?? "Unknown product",
          category: vs[0]?.category ?? "",
          colorFamily: pl.colorFamily,
          cadence: cadence ?? {},
          floor,
          back,
          ...r,
        };
      }),
    })),
  };
}

function sizeCounts(vs: CatalogVariant[], n: (v: CatalogVariant) => number): SizeCounts {
  const out: SizeCounts = {};
  for (const v of vs) if ((SIZES as readonly string[]).includes(v.size)) out[v.size as keyof SizeCounts] = n(v);
  return out;
}

function groupBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}
