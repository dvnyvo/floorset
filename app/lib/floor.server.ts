// Loads what the pages need by combining Shopify (catalog, counts) with Floorset's DB (layout, scans, tags).
import db from "../db.server";
import { replenish } from "./engine/replenish";
import {
  SIZES,
  type CadenceLookup,
  type Candidate,
  type ColorFamily,
  type FixtureContext,
  type FixtureType,
  type SizeCounts,
  type SlotItem,
} from "./engine/types";
import { chronicShorts, readRates, trendPoints, type RateRow, type UnitInfo } from "./scans/reconcile";
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

/** Freezes the read rate of every full count that has no snapshot yet. Runs on upload, and on the dashboard as a backfill. */
// shortcut: a count snapshotted late (backfill) uses today's on-hand and loose-tag list; counts snapshotted on upload are exact.
export async function snapshotCounts(admin: AdminClient) {
  const counts = await db.scan.findMany({
    where: { type: "full_count", snapshots: { none: {} } },
    include: { tagReads: { select: { epc: true } } },
  });
  if (!counts.length) return;
  const [{ variants }, units, ghosts] = await Promise.all([fetchCatalog(admin), unitsByEpc(), ghostEpcs()]);
  for (const c of counts) {
    const { byCategory } = readRates({ variants, units, readEpcs: c.tagReads.map((t) => t.epc), ghostEpcs: ghosts });
    const data = byCategory.map((r) => ({ scanId: c.id, category: r.key, expected: r.expected, raw: r.raw, adjusted: r.adjusted }));
    // Two requests can race to snapshot the same count; the rows of the one that lost already exist.
    await db.readRateSnapshot.createMany({ data }).catch((e) => {
      if (e?.code !== "P2002") throw e;
    });
  }
}

export async function loadTrend() {
  const rows = await db.readRateSnapshot.findMany({ include: { scan: { select: { takenAt: true } } } });
  return trendPoints(rows.map((r) => ({ ...r, takenAt: r.scan.takenAt })));
}

export async function loadDashboard(admin: AdminClient) {
  const counts = await db.scan.findMany({
    where: { type: "full_count" },
    orderBy: { takenAt: "desc" },
    take: 3,
    include: { tagReads: { select: { epc: true } } },
  });
  if (!counts.length) return { scan: null };
  await snapshotCounts(admin);

  const [{ variants }, units, ghosts] = await Promise.all([fetchCatalog(admin), unitsByEpc(), ghostEpcs()]);
  // shortcut: the per-SKU "short week after week" check compares older counts to today's on-hand; snapshots are per category only.
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
    trend: await loadTrend(),
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

/** Latest floor scan + catalog + layout: the shared base for replenishment and the fixture view. */
async function floorState(admin: AdminClient) {
  const scan = await db.scan.findFirst({
    where: { type: "floor" },
    orderBy: { takenAt: "desc" },
    include: { tagReads: { select: { epc: true } } },
  });
  if (!scan) return null;

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
  const floorOf = (vs: CatalogVariant[]) => sizeCounts(vs, (v) => onFloor.get(v.variantId) ?? 0);
  const backOf = (vs: CatalogVariant[]) =>
    sizeCounts(vs, (v) => Math.max(0, v.available - (onFloor.get(v.variantId) ?? 0)));
  const cadenceFor: CadenceLookup = (type, category) =>
    rules.find((r) => r.fixtureType === type && r.category === category)?.sizeCounts as SizeCounts | undefined;

  return { scan, variants, byProduct: groupBy(variants, (v) => v.productId), fixtures, floorOf, backOf, cadenceFor };
}

/** Floor scan vs each fixture's cadence vs back stock (Shopify available minus what's on the floor). */
export async function loadReplenishment(admin: AdminClient) {
  const st = await floorState(admin);
  if (!st) return { scan: null, fixtures: [] };
  const { scan, byProduct, fixtures, floorOf, backOf, cadenceFor } = st;

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
        const floor = floorOf(vs);
        const back = backOf(vs);
        const cadence = cadenceFor(f.type as FixtureType, vs[0]?.category ?? "");
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

/** Everything the rules engine needs to fill one slot: fixture context, candidates and cadences. */
export async function loadFixture(admin: AdminClient, fixtureId: string) {
  const st = await floorState(admin);
  if (!st) return null;
  const { scan, byProduct, fixtures, backOf, cadenceFor } = st;
  const f = fixtures.find((x) => x.id === fixtureId);
  if (!f) return null;

  const placed = new Set((await db.placement.findMany({ select: { productId: true } })).map((p) => p.productId));
  const since = new Date(scan.takenAt.getTime() - VELOCITY_DAYS * 86_400_000);
  const sales = await db.salesDaily.groupBy({ by: ["variantId"], where: { date: { gte: since } }, _sum: { units: true } });
  const soldByVariant = new Map(sales.map((s) => [s.variantId, s._sum.units ?? 0]));

  const candidates: Candidate[] = [...byProduct.values()].map((vs) => ({
    productId: vs[0].productId,
    title: vs[0].productTitle,
    category: vs[0].category,
    department: vs[0].department,
    colorFamily: vs[0].colorFamily,
    fixtureType: vs[0].fixtureType,
    back: backOf(vs),
    damaged: sizeCounts(vs, (v) => v.damaged),
    placed: placed.has(vs[0].productId),
    weeklyVelocity: vs.reduce((n, v) => n + (soldByVariant.get(v.variantId) ?? 0), 0) / (VELOCITY_DAYS / 7),
  }));
  const byId = new Map(candidates.map((c) => [c.productId, c]));

  const slots: (SlotItem | null)[] = Array.from({ length: f.slotCount }, () => null);
  for (const pl of f.placements) {
    const c = byId.get(pl.productId);
    slots[pl.slot] = {
      productId: pl.productId,
      title: c?.title ?? "Unknown product",
      category: c?.category ?? "",
      colorFamily: pl.colorFamily as ColorFamily,
    };
  }
  const fixture: FixtureContext = {
    name: f.name,
    type: f.type as FixtureType,
    zone: { name: f.zone.name, department: f.zone.department, palette: f.zone.palette as ColorFamily[] },
    slots,
  };
  return { id: f.id, fixture, candidates, cadenceFor };
}

const VELOCITY_DAYS = 28;

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
