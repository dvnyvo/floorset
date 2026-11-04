// Loose-tag ("ghost") detection: a tag that keeps reading after its garment is gone hides shrink,
// because the read rate still counts it. Pure function over scan history; no DB or Shopify here.

export const SIGNALS = {
  sold_but_read: { weight: 0.9, label: "Sold, but the tag still reads" },
  wrong_area: { weight: 0.4, label: "Read outside the sales floor and stockroom" },
  never_moves: { weight: 0.6, label: "Same off-floor spot in 3+ scans" },
  read_but_not_found: { weight: 0.5, label: "Staff searched the spot and found nothing" },
} as const;
export type Signal = keyof typeof SIGNALS;

export const NEVER_MOVES_SCANS = 3;

export interface GhostInput {
  /** Scans oldest first; each is the list of (epc, area) reads. */
  scans: { epc: string; area: string | null }[][];
  units: Map<string, { variantId: string; status: string }>;
  /**
   * Areas where stock legitimately sits: every sales zone plus the stockroom. Any zone counts, not just
   * the item's own, because re-merchandising moves stock between zones between scans.
   */
  stockAreas: Set<string>;
}

export interface Suspect {
  epc: string;
  signals: Signal[];
  confidence: number;
  lastSeenArea: string | null;
  reads: number;
}

/** Combines independent signals: 1 - product of (1 - weight). */
export function confidence(signals: Signal[]) {
  return 1 - signals.reduce((p, s) => p * (1 - SIGNALS[s].weight), 1);
}

export function detectGhosts({ scans, units, stockAreas }: GhostInput): Suspect[] {
  const history = new Map<string, (string | null)[]>(); // epc -> area per scan it was read in
  for (const reads of scans) {
    for (const { epc, area } of reads) history.set(epc, [...(history.get(epc) ?? []), area]);
  }

  const out: Suspect[] = [];
  for (const [epc, areas] of history) {
    const u = units.get(epc);
    if (!u) continue; // unknown tags are reported separately on the dashboard
    const off = areas.filter((a): a is string => !!a && !stockAreas.has(a));
    const signals: Signal[] = [];
    if (u.status === "sold") signals.push("sold_but_read");
    if (off.length) signals.push("wrong_area");
    const spots = new Map<string, number>();
    for (const a of off) spots.set(a, (spots.get(a) ?? 0) + 1);
    if ([...spots.values()].some((n) => n >= NEVER_MOVES_SCANS)) signals.push("never_moves");
    if (!signals.length) continue;
    out.push({ epc, signals, confidence: confidence(signals), lastSeenArea: areas.at(-1) ?? null, reads: areas.length });
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.epc.localeCompare(b.epc));
}
