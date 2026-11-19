// Stage 2: visual standards (hard). Each rule returns a plain-English reason on failure.
import { roleLabel, sequenceText, slotRoles } from "./roles";
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

/**
 * Outfit standard: the replacement must have the role its slot needs (rails repeat the department's outfit,
 * tables put tops and cover-ups left and bottoms right). Outerwear is rail-only.
 */
export function outfitRole(c: Candidate, fixture: FixtureContext, slot: number): RuleResult {
  if (fixture.type === "table" && c.category === "outerwear") return fail("outerwear_table", "Outerwear goes on rails, never on a table");
  const accepts = slotRoles(fixture.type, fixture.zone.department, fixture.slots.length)[slot] ?? [];
  if (accepts.includes(c.role)) return pass;
  const label = roleLabel(accepts);
  return fail(
    "outfit_role",
    `Slot ${slot + 1} is ${/^[aeiou]/.test(label) ? "an" : "a"} ${label} slot (${sequenceText(fixture.type, fixture.zone.department)})`,
  );
}

export function neighbors(fixture: FixtureContext, slot: number): { left: SlotItem | null; right: SlotItem | null } {
  return { left: fixture.slots[slot - 1] ?? null, right: fixture.slots[slot + 1] ?? null };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
