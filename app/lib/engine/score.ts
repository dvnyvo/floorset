// Stage 3: soft score used to rank candidates that pass every hard rule.
import { COLORS } from "./colors";
import { SIZES, type Candidate, type EngineConfig, type FixtureContext, type Weights } from "./types";
import { neighbors, others } from "./visual";


export type ScoreParts = Record<keyof Weights, number>;

/** Units sold per week, normalized against the fastest candidate in the same category. */
export function velocity(c: Candidate, pool: Candidate[]): number {
  const max = Math.max(0, ...pool.filter((p) => p.category === c.category).map((p) => p.weeklyVelocity));
  return max > 0 ? c.weeklyVelocity / max : 0;
}

/** Weeks of sales the back stock can cover, saturating at coverWeeksCap. */
export function cover(c: Candidate, coverWeeksCap: number): number {
  const total = SIZES.reduce((n, s) => n + (c.back[s] ?? 0), 0);
  const weeks = total / Math.max(c.weeklyVelocity, 0.1);
  return Math.min(weeks / coverWeeksCap, 1);
}

/** 1 when the fixture has none of this category yet, falling toward 0 as it nears the cap. */
export function balance(c: Candidate, fixture: FixtureContext, slot: number, categoryCap: number): number {
  const count = others(fixture, slot).filter((s) => s.category === c.category).length;
  return Math.max(0, 1 - count / categoryCap);
}

/** Mean tone distance from the neighbors (0.5 when the slot has no neighbors). */
export function contrast(c: Candidate, fixture: FixtureContext, slot: number): number {
  const { left, right } = neighbors(fixture, slot);
  const ns = [left, right].filter((n) => n !== null);
  if (!ns.length) return 0.5;
  return ns.reduce((sum, n) => sum + Math.abs(COLORS[c.colorFamily].tone - COLORS[n.colorFamily].tone), 0) / ns.length;
}

export function score(
  c: Candidate,
  pool: Candidate[],
  fixture: FixtureContext,
  slot: number,
  config: EngineConfig,
  weights: Weights,
): { total: number; parts: ScoreParts } {
  const parts: ScoreParts = {
    velocity: velocity(c, pool),
    cover: cover(c, config.coverWeeksCap),
    balance: balance(c, fixture, slot, config.categoryCap),
    contrast: contrast(c, fixture, slot),
  };
  const total = (Object.keys(parts) as (keyof Weights)[]).reduce((sum, k) => sum + weights[k] * parts[k], 0);
  return { total, parts };
}
