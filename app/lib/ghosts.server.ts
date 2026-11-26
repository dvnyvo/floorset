// Loose-tag detection over stored scans, the sweep list, and resolving what staff find.
import db from "../db.server";
import { confidence, detectGhosts, type Signal } from "./scans/ghosts";
import { proposeCorrection, ProposalError } from "./proposals.server";
import { fetchCatalog, type AdminClient, type CatalogVariant } from "./shopify/catalog.server";

export const STOCKROOM = "Stockroom"; // where back stock reads; must match the scanner's area name

/** Re-runs detection over every scan. Resolved tags stay resolved; a "searched, not found" signal is kept. */
export async function runDetection() {
  const [scans, units, zones, existing] = await Promise.all([
    db.scan.findMany({ orderBy: { takenAt: "asc" }, include: { tagReads: { select: { epc: true, area: true } } } }),
    db.unit.findMany({ select: { epc: true, variantId: true, status: true } }),
    db.zone.findMany({ select: { name: true } }),
    db.ghostSuspect.findMany(),
  ]);

  const resolved = new Set(existing.filter((e) => e.resolution).map((e) => e.epc));
  const notFound = new Set(
    existing.filter((e) => !e.resolution && (e.signals as Signal[]).includes("read_but_not_found")).map((e) => e.epc),
  );
  const found = detectGhosts({
    scans: scans.map((s) => s.tagReads),
    units: new Map(units.map((u) => [u.epc, u])),
    stockAreas: new Set([...zones.map((z) => z.name), STOCKROOM]),
  }).filter((s) => !resolved.has(s.epc));

  const rows = found.map((s) => {
    const signals: Signal[] = notFound.has(s.epc) ? [...s.signals, "read_but_not_found"] : s.signals;
    return { epc: s.epc, signals, confidence: confidence(signals), lastSeenArea: s.lastSeenArea };
  });
  await db.$transaction([
    db.ghostSuspect.deleteMany({ where: { resolution: null } }),
    db.ghostSuspect.createMany({ data: rows }),
  ]);
  return { open: rows.length };
}

export type Resolution = "loose_tag" | "item_found" | "not_found";

/**
 * What staff found at the spot:
 * - loose_tag: a tag with no garment. The garment is gone, so an inventory correction is proposed.
 * - item_found: the garment is there (a try-on, a misplaced item). Not shrink.
 * - not_found: nothing at the spot. Raises confidence and stays on the list.
 */
export async function resolveSuspect(admin: AdminClient, epc: string, resolution: Resolution) {
  const s = await db.ghostSuspect.findUnique({ where: { epc } });
  if (!s || s.resolution) throw new ProposalError("That RFID tag isn't on the open list");

  if (resolution === "not_found") {
    const signals = [...new Set([...(s.signals as Signal[]), "read_but_not_found" as const])];
    await db.ghostSuspect.update({ where: { epc }, data: { signals, confidence: confidence(signals) } });
    return { proposed: false };
  }

  await db.ghostSuspect.update({ where: { epc }, data: { resolution, resolvedAt: new Date() } });
  if (resolution === "item_found") return { proposed: false };

  // A sold unit's count already left Shopify at the sale; only in-stock units need a correction.
  const unit = await db.unit.findUnique({ where: { epc } });
  if (unit?.status !== "in_stock") return { proposed: false };
  const v = (await fetchCatalog(admin)).variants.find((x) => x.variantId === unit.variantId);
  if (!v) throw new ProposalError("That RFID tag's product is no longer in Shopify");
  await proposeCorrection(
    { epc, variantId: v.variantId, inventoryItemId: v.inventoryItemId },
    { sku: v.sku, title: `${v.productTitle} / ${v.size}`, epc, area: s.lastSeenArea, delta: -1 },
  );
  return { proposed: true };
}

export async function loadGhosts(admin: AdminClient) {
  const [{ variants }, suspects, units, corrections] = await Promise.all([
    fetchCatalog(admin),
    db.ghostSuspect.findMany({ orderBy: [{ confidence: "desc" }, { epc: "asc" }] }),
    db.unit.findMany({ select: { epc: true, variantId: true, status: true } }),
    db.proposal.findMany({ where: { kind: "inventory_correction" }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const byVariant = new Map<string, CatalogVariant>(variants.map((v) => [v.variantId, v]));
  const unitOf = new Map(units.map((u) => [u.epc, u]));
  const label = (epc: string) => {
    const u = unitOf.get(epc);
    const v = u && byVariant.get(u.variantId);
    return { sku: v?.sku ?? "unknown", title: v ? `${v.productTitle} / ${v.size}` : "Unknown item", unitStatus: u?.status ?? "" };
  };

  const open = suspects.filter((s) => !s.resolution);
  const confirmed = suspects.filter((s) => s.resolution === "loose_tag");
  const hotspots = new Map<string, { area: string; open: number; confirmed: number }>();
  for (const s of [...open, ...confirmed]) {
    const area = s.lastSeenArea ?? "Unknown";
    const h = hotspots.get(area) ?? { area, open: 0, confirmed: 0 };
    if (s.resolution) h.confirmed++;
    else h.open++;
    hotspots.set(area, h);
  }

  return {
    open: open.map((s) => ({
      epc: s.epc,
      signals: s.signals as Signal[],
      confidence: s.confidence,
      area: s.lastSeenArea,
      ...label(s.epc),
    })),
    stats: {
      open: open.length,
      likely: open.filter((s) => s.confidence >= 0.7).length,
      confirmed: confirmed.length,
      falseAlarms: suspects.filter((s) => s.resolution === "item_found").length,
      writtenOff: corrections.filter((c) => c.status === "applied").length,
    },
    hotspots: [...hotspots.values()].sort((a, b) => b.open + b.confirmed - (a.open + a.confirmed)),
    corrections: corrections.map((c) => ({ id: c.id, status: c.status, diff: c.diff as Record<string, unknown> })),
  };
}
