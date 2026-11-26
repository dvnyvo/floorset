import { describe, expect, it } from "vitest";
import { departmentFits, depth, fixtureTypeFits, fullSizeRun, notDamaged, notPlaced } from "../../app/lib/engine/filters";
import { RAIL_CADENCE, candidate, deepBack, rail } from "./helpers";

describe("fullSizeRun", () => {
  it("passes when every size covers the cadence", () => {
    expect(fullSizeRun(candidate(), RAIL_CADENCE).ok).toBe(true);
  });
  it("names each short size", () => {
    const r = fullSizeRun(candidate({ back: { ...deepBack(), S: 1, XL: 0 } }), RAIL_CADENCE);
    expect(r).toEqual({ ok: false, rule: "size_run", reason: "Broken size run: short S (1 of 3), XL (0 of 1)" });
  });
  it("ignores sizes the cadence doesn't need", () => {
    const noXxs = { ...deepBack(), XXS: undefined };
    expect(fullSizeRun(candidate({ back: noXxs }), { ...RAIL_CADENCE, XXS: 0 }).ok).toBe(true);
  });
});

describe("depth", () => {
  it("needs enough to refill the cadence twice", () => {
    const back = { ...deepBack(), M: 5 }; // M cadence 3 -> needs 6
    const r = depth(candidate({ back }), RAIL_CADENCE, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("Only 5 M in backstock, needs 6 to refill 2x");
  });
  it("passes at exactly 2x", () => {
    const back = Object.fromEntries(Object.entries(RAIL_CADENCE).map(([s, n]) => [s, n * 2]));
    expect(depth(candidate({ back }), RAIL_CADENCE, 2).ok).toBe(true);
  });
});

describe("notDamaged", () => {
  it("fails when a size is only complete by counting damaged units", () => {
    const r = notDamaged(candidate({ back: { ...deepBack(), S: 2 }, damaged: { S: 1 } }), RAIL_CADENCE);
    expect(r).toMatchObject({ ok: false, rule: "damaged", reason: "S is only complete with damaged units" });
  });
  it("passes when damaged units are extra", () => {
    expect(notDamaged(candidate({ damaged: { S: 4 } }), RAIL_CADENCE).ok).toBe(true);
  });
});

describe("fixture, placement and department", () => {
  it("rejects a table-only item for a rail", () => {
    expect(fixtureTypeFits(candidate({ fixtureType: "table" }), rail([]))).toMatchObject({
      ok: false,
      reason: "Table item, can't go on a rail",
    });
  });
  it("accepts 'both' on a rail", () => {
    expect(fixtureTypeFits(candidate({ fixtureType: "both" }), rail([])).ok).toBe(true);
  });
  it("rejects items already on the floor", () => {
    expect(notPlaced(candidate({ placed: true })).ok).toBe(false);
  });
  it("keeps men's styles out of women's zones", () => {
    expect(departmentFits(candidate({ department: "mens" }), rail([]))).toMatchObject({
      ok: false,
      reason: "Mens style, Zone 2 is womens",
    });
  });
});
