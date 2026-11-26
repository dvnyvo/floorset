// A fixture's status on the floor map, from the replenishment result of each of its slots.
import type { SizeCounts } from "./types";

export type FixtureStatus = "replace" | "fill" | "ok";

export const STATUS_LABEL: Record<FixtureStatus, string> = {
  replace: "Needs replacing",
  fill: "Needs fill",
  ok: "OK",
};

/** True when the slot is on the fill list: not a swap-out, and something to bring out (as on the Replenishment page). */
export const onFillList = (s: { swapOut: boolean; fill: SizeCounts }) => !s.swapOut && Object.keys(s.fill).length > 0;

/** "replace" if any slot is a swap-out, else "fill" if any slot is on the fill list, else "ok". */
export function fixtureStatus(slots: { swapOut: boolean; fill: SizeCounts }[]): FixtureStatus {
  if (slots.some((s) => s.swapOut)) return "replace";
  if (slots.some(onFillList)) return "fill";
  return "ok";
}
