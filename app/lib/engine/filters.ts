// Stage 1: stock filters (hard). Each rule is pure and returns a plain-English reason on failure.
import { SIZES, fail, pass, type Candidate, type FixtureContext, type RuleResult, type SizeCounts } from "./types";

const needed = (cadence: SizeCounts) => SIZES.filter((s) => (cadence[s] ?? 0) > 0);

export function fixtureTypeFits(c: Candidate, fixture: FixtureContext): RuleResult {
  return c.fixtureType === "both" || c.fixtureType === fixture.type
    ? pass
    : fail("fixture_type", `${cap(c.fixtureType)} item, can't go on a ${fixture.type}`);
}

export function notPlaced(c: Candidate): RuleResult {
  return c.placed ? fail("already_placed", "Already on the floor") : pass;
}

export function departmentFits(c: Candidate, fixture: FixtureContext): RuleResult {
  return c.department === fixture.zone.department
    ? pass
    : fail("department", `${cap(c.department)} style, ${fixture.zone.name} is ${fixture.zone.department}`);
}

/** The run must be complete without counting damaged units. */
export function notDamaged(c: Candidate, cadence: SizeCounts): RuleResult {
  const s = needed(cadence).find(
    (size) => (c.back[size] ?? 0) < cadence[size]! && (c.back[size] ?? 0) + (c.damaged[size] ?? 0) >= cadence[size]!,
  );
  return s ? fail("damaged", `${s} is only complete with damaged units`) : pass;
}

export function fullSizeRun(c: Candidate, cadence: SizeCounts): RuleResult {
  const missing = needed(cadence).filter((s) => (c.back[s] ?? 0) < cadence[s]!);
  if (!missing.length) return pass;
  const detail = missing.map((s) => `${s} (${c.back[s] ?? 0} of ${cadence[s]})`).join(", ");
  return fail("size_run", `Broken size run: short ${detail}`);
}

export function depth(c: Candidate, cadence: SizeCounts, multiplier: number): RuleResult {
  const shallow = needed(cadence).find((s) => (c.back[s] ?? 0) < cadence[s]! * multiplier);
  return shallow
    ? fail(
        "depth",
        `Only ${c.back[shallow] ?? 0} ${shallow} in back, needs ${cadence[shallow]! * multiplier} to refill ${multiplier}x`,
      )
    : pass;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
