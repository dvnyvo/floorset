// Stage 2: visual standards (hard). Each rule returns a plain-English reason on failure.
import { fail, pass, type Candidate, type FixtureContext, type RuleResult, type SlotItem } from "./types";

export function zoneTheme(c: Candidate, fixture: FixtureContext): RuleResult {
  const { name, palette } = fixture.zone;
  return palette.includes(c.colorFamily)
    ? pass
    : fail("zone_palette", `${cap(c.colorFamily)} isn't in ${name}'s palette (${palette.join(", ")})`);
}

/** The "fillers between" rule: never the same color family as either neighbor. */
export function colorAdjacency(c: Candidate, fixture: FixtureContext, slot: number): RuleResult {
  const { left, right } = neighbors(fixture, slot);
  const sameL = left?.colorFamily === c.colorFamily;
  const sameR = right?.colorFamily === c.colorFamily;
  if (sameL && sameR) return fail("adjacency", `Would put 3 ${c.colorFamily} items in a row`);
  if (sameL || sameR) {
    return fail("adjacency", `Same color family (${c.colorFamily}) as the item to its ${sameL ? "left" : "right"}`);
  }
  return pass;
}

/** Max N styles of one category per fixture, ignoring the item being swapped out. */
export function categoryMix(c: Candidate, fixture: FixtureContext, slot: number, categoryCap: number): RuleResult {
  const count = others(fixture, slot).filter((s) => s.category === c.category).length;
  return count < categoryCap
    ? pass
    : fail("category_cap", `${cap(fixture.type)} already has ${count} ${c.category} styles (max ${categoryCap})`);
}

export function neighbors(fixture: FixtureContext, slot: number): { left: SlotItem | null; right: SlotItem | null } {
  return { left: fixture.slots[slot - 1] ?? null, right: fixture.slots[slot + 1] ?? null };
}

export function others(fixture: FixtureContext, slot: number): SlotItem[] {
  return fixture.slots.filter((s, i): s is SlotItem => s !== null && i !== slot);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
