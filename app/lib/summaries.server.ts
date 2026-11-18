// Compact, precomputed answers for Sidekick. Sidekick data tools must answer within 1 second and
// 4,000 tokens, so pages save a trimmed summary as they load and the tools only read it back.
// shortcut: refreshed when a page loads (plus "asOf"), not on a schedule; add a cron or webhook refresh at scale.
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import type { loadGhosts } from "./ghosts.server";
import type { loadDashboard, loadReplenishment } from "./floor.server";

export type SummaryKey = "read_rate" | "swap_outs" | "loose_tags";

const pct = (n: number | null | undefined) => (n == null ? null : Math.round(n * 1000) / 10);

async function save(key: SummaryKey, data: object) {
  const json = { ...data, asOf: new Date().toISOString() } as Prisma.InputJsonObject;
  await db.summary.upsert({ where: { key }, create: { key, data: json }, update: { data: json } });
}

export async function getSummary(key: SummaryKey) {
  return (await db.summary.findUnique({ where: { key } }))?.data ?? null;
}

export function saveReadRate(d: Awaited<ReturnType<typeof loadDashboard>>) {
  if (!d.scan) return;
  return save("read_rate", {
    target: 95,
    countDate: d.scan.takenAt.slice(0, 10),
    rawPct: pct(d.total?.rawRate),
    adjustedPct: pct(d.total?.adjustedRate),
    looseTagsExcluded: d.ghostCount,
    byCategory: d.byCategory?.map((c) => ({
      category: c.label,
      rawPct: pct(c.rawRate),
      adjustedPct: pct(c.adjustedRate),
      belowTarget: c.belowTarget,
    })),
    skusBelowTarget: d.flaggedSkuCount,
    chronicShortSkus: d.chronic?.slice(0, 15).map((r) => r.label),
    trend: d.trend?.slice(-12).map((p) => ({ date: p.date, adjustedPct: pct(p.adjustedRate) })),
  });
}

// shortcut: assumes the app handle "floorset"; read it from the app config if the handle changes.
const fixtureLink = (shop: string, fixtureId: string, slot: number) =>
  `https://${shop}/admin/apps/floorset/app/replenish/fixtures/${fixtureId}?slot=${slot}`;

export function saveSwapOuts(r: Awaited<ReturnType<typeof loadReplenishment>>, shop: string) {
  if (!r.scan) return;
  const slots = r.fixtures.flatMap((f) => f.slots.map((s) => ({ ...s, fixture: f })));
  return save("swap_outs", {
    floorScanDate: r.scan.takenAt.slice(0, 10),
    swapOuts: slots
      .filter((s) => s.swapOut)
      .map((s) => ({
        item: s.productTitle,
        fixture: s.fixture.name,
        slot: s.slot + 1,
        why: s.reason,
        findReplacementUrl: fixtureLink(shop, s.fixture.id, s.slot),
      })),
    itemsToRefill: slots.filter((s) => !s.swapOut && Object.keys(s.fill).length).length,
  });
}

export function saveLooseTags(g: Awaited<ReturnType<typeof loadGhosts>>) {
  return save("loose_tags", {
    ...g.stats,
    hotspots: g.hotspots.slice(0, 10),
    topSuspects: g.open.slice(0, 15).map((s) => ({
      item: s.title,
      sku: s.sku,
      area: s.area,
      confidencePct: Math.round(s.confidence * 100),
      signals: s.signals,
    })),
    pendingCorrections: g.corrections.filter((c) => c.status === "pending").length,
  });
}
