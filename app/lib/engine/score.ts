// Stage 3: soft score used to rank candidates that pass every hard rule.
import { COLORS, type ColorFamily } from "./colors";
import { SIZES, type Candidate, type EngineConfig, type FixtureContext, type Weights } from "./types";
import { neighbors } from "./visual";

export type ScoreParts = Record<keyof Weights, number>;

/**
 * Units sold per week, normalized against the fastest item in the same category across the whole catalog.
 * Pass every candidate, not only the ones that passed the rules: otherwise a slow seller that is the only
 * passing item in its category scores 1.0.
 */
export function velocity(c: Candidate, catalog: Candidate[]): number {
  const max = Math.max(0, ...catalog.filter((p) => p.category === c.category).map((p) => p.weeklyVelocity));
  return max > 0 ? c.weeklyVelocity / max : 0;
}

/** Weeks of sales the back stock can cover, saturating at coverWeeksCap. */
export function cover(c: Candidate, coverWeeksCap: number): number {
  const total = SIZES.reduce((n, s) => n + (c.back[s] ?? 0), 0);
  const weeks = total / Math.max(c.weeklyVelocity, 0.1);
  return Math.min(weeks / coverWeeksCap, 1);
}

/** Hue gap 0 to 1: opposite hues 1, a hue against a neutral 0.5, two neutrals 0. */
function hueGap(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : 0.5;
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d) / 180;
}

/** How far apart two color families look: lightness and hue combined, 0 for the same family, capped at 1. */
export function colorDistance(a: ColorFamily, b: ColorFamily): number {
  const x = COLORS[a], y = COLORS[b];
  return Math.min(1, Math.hypot(x.tone - y.tone, hueGap(x.hue, y.hue)));
}

/** Mean color distance from the neighbors (0.5 when the slot has no neighbors). */
export function contrast(c: Candidate, fixture: FixtureContext, slot: number): number {
  const { left, right } = neighbors(fixture, slot);
  const ns = [left, right].filter((n) => n !== null);
  if (!ns.length) return 0.5;
  return ns.reduce((sum, n) => sum + colorDistance(c.colorFamily, n.colorFamily), 0) / ns.length;
}

export function score(
  c: Candidate,
  catalog: Candidate[],
  fixture: FixtureContext,
  slot: number,
  config: EngineConfig,
  weights: Weights,
): { total: number; parts: ScoreParts } {
  const parts: ScoreParts = {
    velocity: velocity(c, catalog),
    cover: cover(c, config.coverWeeksCap),
    contrast: contrast(c, fixture, slot),
  };
  const total = (Object.keys(parts) as (keyof Weights)[]).reduce((sum, k) => sum + weights[k] * parts[k], 0);
  return { total, parts };
}
