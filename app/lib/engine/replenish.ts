// Floor replenishment for one placed item: compare the floor scan to the fixture's size cadence
// and the back stock. If back stock can't restore the cadence, the item is a swap-out.
import { SIZES, type SizeCounts } from "./types";

export interface ReplenishResult {
  fill: SizeCounts; // units to bring out, per size
  short: SizeCounts; // units the back can't cover, per size
  swapOut: boolean;
  reason: string;
}

export function replenish(cadence: SizeCounts | undefined, floor: SizeCounts, back: SizeCounts): ReplenishResult {
  if (!cadence) return { fill: {}, short: {}, swapOut: false, reason: "No cadence for this category on this fixture" };
  const fill: SizeCounts = {};
  const short: SizeCounts = {};
  for (const s of SIZES) {
    const need = Math.max(0, (cadence[s] ?? 0) - (floor[s] ?? 0));
    if (!need) continue;
    const canFill = Math.min(need, Math.max(0, back[s] ?? 0));
    if (canFill) fill[s] = canFill;
    if (need > canFill) short[s] = need - canFill;
  }
  const shortSizes = SIZES.filter((s) => short[s]);
  const reason = shortSizes.length
    ? `Can't hold the size run: ${shortSizes.map((s) => `${s} short ${short[s]} (${back[s] ?? 0} in back)`).join(", ")}`
    : Object.keys(fill).length
      ? "Refill from back stock"
      : "Full";
  return { fill, short, swapOut: shortSizes.length > 0, reason };
}
