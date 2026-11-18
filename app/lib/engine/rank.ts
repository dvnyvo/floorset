// Ranks replacements for one slot: hard stock filters -> preferences -> visual standards -> soft score.
// Deterministic: the copilot can explain and adjust preferences but never override a hard rule.
import { defaultConfig } from "./config";
import { departmentFits, depth, fixtureTypeFits, fullSizeRun, notDamaged, notPlaced } from "./filters";
import { score, type ScoreParts } from "./score";
import { SIZES, fail, pass, type CadenceLookup, type Candidate, type ColorFamily, type EngineConfig, type FixtureContext, type Preferences, type RuleResult } from "./types";
import { categoryMix, colorAdjacency, neighbors, zoneTheme } from "./visual";

export type Stage = "stock" | "preference" | "visual";

export interface Pick {
  candidate: Candidate;
  score: number;
  parts: ScoreParts;
  reason: string;
}
export interface Rejection {
  candidate: Candidate;
  stage: Stage;
  rule: string;
  reason: string;
}
export interface RankInput {
  fixture: FixtureContext;
  slot: number;
  candidates: Candidate[];
  cadenceFor: CadenceLookup;
  prefs?: Preferences;
  config?: EngineConfig;
}

/**
 * Strict pass first (back stock refills the run 2x). If nothing passes, fall back to items that can
 * fill the size run at least once: a full run with no back-up beats a broken run left on the floor.
 */
export function rank(input: RankInput) {
  const strict = rankOnce(input, false);
  if (strict.picks.length) return strict;
  const lenient = rankOnce(input, true);
  return lenient.picks.length ? lenient : strict;
}

function rankOnce(
  { fixture, slot, candidates, cadenceFor, prefs = {}, config = defaultConfig }: RankInput,
  fallback: boolean,
) {
  if (fallback) config = { ...config, depthMultiplier: 1 };
  const weights = { ...config.weights, ...prefs.weights };
  const passed: Candidate[] = [];
  const rejected: Rejection[] = [];

  for (const c of candidates) {
    const cadence = cadenceFor(fixture.type, c.category);
    const stages: [Stage, () => RuleResult][] = [
      ["stock", () => fixtureTypeFits(c, fixture)],
      ["stock", () => notPlaced(c)],
      ["stock", () => departmentFits(c, fixture)],
      ["stock", () => (cadence ? pass : fail("no_cadence", `No size cadence for ${c.category} on a ${fixture.type}`))],
      ["stock", () => notDamaged(c, cadence!)],
      ["stock", () => fullSizeRun(c, cadence!)],
      ["stock", () => depth(c, cadence!, config.depthMultiplier)],
      ["preference", () => preferenceCategory(c, prefs)],
      ["preference", () => preferenceColor(c, prefs)],
      ["visual", () => zoneTheme(c, fixture)],
      ["visual", () => colorAdjacency(c, fixture, slot)],
      ["visual", () => categoryMix(c, fixture, slot, config.categoryCap)],
    ];
    let failed: Rejection | null = null;
    for (const [stage, rule] of stages) {
      const r = rule();
      if (!r.ok) {
        failed = { candidate: c, stage, rule: r.rule, reason: r.reason };
        break;
      }
    }
    if (failed) rejected.push(failed);
    else passed.push(c);
  }

  const picks: Pick[] = passed
    .map((c) => {
      const s = score(c, passed, fixture, slot, config, weights);
      const reason = explain(c, fixture, slot, s.parts, cadenceFor, candidates);
      return { candidate: c, score: s.total, parts: s.parts, reason: fallback ? `${reason}. Fallback: fills the size run once, no back-up stock` : reason };
    })
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, config.topN);

  // Most instructive rejections first: visual, then preference, then stock; best sellers first within a stage.
  const order: Record<Stage, number> = { visual: 0, preference: 1, stock: 2 };
  rejected.sort((a, b) => order[a.stage] - order[b.stage] || b.candidate.weeklyVelocity - a.candidate.weeklyVelocity);

  return { picks, rejected, passedCount: passed.length, fallback, weights };
}

function preferenceCategory(c: Candidate, prefs: Preferences): RuleResult {
  return !prefs.category || c.category === prefs.category
    ? pass
    : fail("pref_category", `Not ${withArticle(prefs.category)} (asked for ${plural(prefs.category)})`);
}

/** Where this item's sales sit among every item in its category: "top seller of 18 tops", "#14 of 18 outerwear by sales". */
export function salesStanding(c: Candidate, catalog: Candidate[]) {
  const same = catalog.filter((x) => x.category === c.category);
  if (same.length < 2) return null;
  const place = 1 + same.filter((x) => x.weeklyVelocity > c.weeklyVelocity).length;
  return place === 1 ? `top seller of ${same.length} ${plural(c.category)}` : `#${place} of ${same.length} ${plural(c.category)} by sales`;
}

/**
 * One line for when a color refinement can't do what its button says: the zone's palette allows few or none
 * of the colors, or the picks come out the same as with any color. kind is the button's word ("bright").
 */
export function colorNote(
  colors: ColorFamily[],
  zone: FixtureContext["zone"],
  samePicksAsAnyColor: boolean,
  kind?: string,
): string | null {
  const allowed = colors.filter((c) => zone.palette.includes(c));
  const palette = `${zone.name}'s palette`;
  if (!allowed.length) return `None of the ${kind ?? "requested"} colors (${listOf(colors)}) is in ${palette}, so nothing can pass.`;
  const is = allowed.length === 1 ? "is" : "are";
  const limit =
    allowed.length < colors.length
      ? `Only ${listOf(allowed)} ${kind ? `${is} both ${kind} and in` : `of the requested colors ${is} in`} ${palette}`
      : null;
  if (limit) return samePicksAsAnyColor ? `${limit}, so the picks are the same as with any color.` : `${limit}.`;
  return samePicksAsAnyColor ? `The top picks are already ${kind ?? "in the requested colors"}, so they don't change.` : null;
}

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// Categories that read as mass or plural nouns: "adds outerwear", "adds shorts".
const NOUN: Record<string, string> = { outerwear: "outerwear", short: "shorts" };
/** "a top", "an …", "outerwear", "shorts". */
export const withArticle = (category: string) => NOUN[category] ?? `${/^[aeiou]/.test(category) ? "an" : "a"} ${category}`;
/** "tops", "leggings", "outerwear", "shorts". */
export const plural = (category: string) => NOUN[category] ?? `${category}s`;

function preferenceColor(c: Candidate, prefs: Preferences): RuleResult {
  return !prefs.colorFamilies?.length || prefs.colorFamilies.includes(c.colorFamily)
    ? pass
    : fail("pref_color", `${c.colorFamily} isn't one of the requested colors (${prefs.colorFamilies.join(", ")})`);
}

/** One-line reason, e.g. "Full XXS–XL run, 28 in back, fits Zone 2 palette, breaks up two greys, adds a top". */
export function explain(
  c: Candidate,
  fixture: FixtureContext,
  slot: number,
  parts: ScoreParts,
  cadenceFor: CadenceLookup,
  catalog: Candidate[],
) {
  const cadence = cadenceFor(fixture.type, c.category) ?? {};
  const run = SIZES.filter((s) => (cadence[s] ?? 0) > 0);
  const inBack = SIZES.reduce((n, s) => n + (c.back[s] ?? 0), 0);
  const bits = [`Full ${run[0]}–${run[run.length - 1]} run`, `${inBack} in back`, `fits ${fixture.zone.name} palette`];

  const { left, right } = neighbors(fixture, slot);
  if (left && right && left.colorFamily === right.colorFamily) bits.push(`breaks up two ${left.colorFamily}s`);
  else if (left && right) bits.push(`${c.colorFamily} between ${left.colorFamily} and ${right.colorFamily}`);
  else if (left || right) bits.push(`${c.colorFamily} next to ${(left ?? right)!.colorFamily}`);

  if (parts.balance === 1) bits.push(`adds ${withArticle(c.category)} to the ${fixture.type}`);
  bits.push(`${c.weeklyVelocity.toFixed(1)} sold/week`);
  const standing = salesStanding(c, catalog);
  if (standing) bits.push(standing);
  const line = bits.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
