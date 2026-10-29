// Ranks replacements for one slot: hard stock filters -> preferences -> visual standards -> soft score.
// Deterministic: the copilot can explain and adjust preferences but never override a hard rule.
import { defaultConfig } from "./config";
import { departmentFits, depth, fixtureTypeFits, fullSizeRun, notDamaged, notPlaced } from "./filters";
import { score, type ScoreParts } from "./score";
import { SIZES, fail, pass, type CadenceLookup, type Candidate, type EngineConfig, type FixtureContext, type Preferences, type RuleResult } from "./types";
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

export function rank({ fixture, slot, candidates, cadenceFor, prefs = {}, config = defaultConfig }: RankInput) {
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
      return { candidate: c, score: s.total, parts: s.parts, reason: explain(c, fixture, slot, s.parts, cadenceFor) };
    })
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, config.topN);

  // Most instructive rejections first: visual, then preference, then stock; best sellers first within a stage.
  const order: Record<Stage, number> = { visual: 0, preference: 1, stock: 2 };
  rejected.sort((a, b) => order[a.stage] - order[b.stage] || b.candidate.weeklyVelocity - a.candidate.weeklyVelocity);

  return { picks, rejected, passedCount: passed.length };
}

function preferenceCategory(c: Candidate, prefs: Preferences): RuleResult {
  return !prefs.category || c.category === prefs.category
    ? pass
    : fail("pref_category", `Not a ${prefs.category} (asked for ${prefs.category}s)`);
}

function preferenceColor(c: Candidate, prefs: Preferences): RuleResult {
  return !prefs.colorFamilies?.length || prefs.colorFamilies.includes(c.colorFamily)
    ? pass
    : fail("pref_color", `${c.colorFamily} isn't one of the requested colors (${prefs.colorFamilies.join(", ")})`);
}

/** One-line reason, e.g. "Full XXS–XL run, 28 in back, fits Zone 2 palette, breaks up two neutrals, adds a top". */
export function explain(c: Candidate, fixture: FixtureContext, slot: number, parts: ScoreParts, cadenceFor: CadenceLookup) {
  const cadence = cadenceFor(fixture.type, c.category) ?? {};
  const run = SIZES.filter((s) => (cadence[s] ?? 0) > 0);
  const inBack = SIZES.reduce((n, s) => n + (c.back[s] ?? 0), 0);
  const bits = [`Full ${run[0]}–${run[run.length - 1]} run`, `${inBack} in back`, `fits ${fixture.zone.name} palette`];

  const { left, right } = neighbors(fixture, slot);
  if (left && right && left.colorFamily === right.colorFamily) bits.push(`breaks up two ${left.colorFamily}s`);
  else if (left && right) bits.push(`${c.colorFamily} between ${left.colorFamily} and ${right.colorFamily}`);
  else if (left || right) bits.push(`${c.colorFamily} next to ${(left ?? right)!.colorFamily}`);

  if (parts.balance === 1) bits.push(`adds a ${c.category} to the ${fixture.type}`);
  bits.push(`${c.weeklyVelocity.toFixed(1)} sold/week`);
  const line = bits.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
