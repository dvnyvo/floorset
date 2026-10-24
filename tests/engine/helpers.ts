import type { CadenceLookup, Candidate, ColorFamily, FixtureContext, SizeCounts, SlotItem } from "../../app/lib/engine/types";

export const RAIL_CADENCE: SizeCounts = { XXS: 1, XS: 2, S: 3, M: 3, L: 2, XL: 1 };
export const cadenceFor: CadenceLookup = (type, category) =>
  category === "bra" && type === "table" ? undefined : RAIL_CADENCE;

/** Deep back stock: every size has 5x the rail cadence. */
export const deepBack = (): SizeCounts => Object.fromEntries(Object.entries(RAIL_CADENCE).map(([s, n]) => [s, n * 5]));

export function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    productId: over.productId ?? "p-cand",
    title: over.title ?? "Test Legging - Lilac",
    category: "legging",
    department: "womens",
    colorFamily: "pastel",
    fixtureType: "both",
    back: deepBack(),
    damaged: {},
    placed: false,
    weeklyVelocity: 4,
    ...over,
  };
}

export const item = (colorFamily: ColorFamily, category = "top", id = `${category}-${colorFamily}`): SlotItem => ({
  productId: id,
  title: id,
  category,
  colorFamily,
});

export function rail(slots: (SlotItem | null)[], palette: ColorFamily[] = ["neutral", "pastel", "black"]): FixtureContext {
  return { name: "Zone 2 Rail 1", type: "rail", zone: { name: "Zone 2", department: "womens", palette }, slots };
}
