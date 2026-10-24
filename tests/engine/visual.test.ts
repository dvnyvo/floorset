import { describe, expect, it } from "vitest";
import { categoryMix, colorAdjacency, zoneTheme } from "../../app/lib/engine/visual";
import { candidate, item, rail } from "./helpers";

describe("zoneTheme", () => {
  it("accepts a color family in the zone palette", () => {
    expect(zoneTheme(candidate({ colorFamily: "pastel" }), rail([])).ok).toBe(true);
  });
  it("explains a palette miss", () => {
    expect(zoneTheme(candidate({ colorFamily: "bright" }), rail([], ["neutral", "pastel"]))).toEqual({
      ok: false,
      rule: "zone_palette",
      reason: "Bright isn't in Zone 2's palette (neutral, pastel)",
    });
  });
});

describe("colorAdjacency", () => {
  const fixture = rail([item("black"), null, item("black"), item("neutral")]);

  it("flags three in a row when both neighbors match", () => {
    expect(colorAdjacency(candidate({ colorFamily: "black" }), fixture, 1)).toMatchObject({
      ok: false,
      reason: "Would put 3 black items in a row",
    });
  });
  it("flags a single matching neighbor and says which side", () => {
    expect(colorAdjacency(candidate({ colorFamily: "neutral" }), fixture, 2)).toMatchObject({
      ok: false,
      reason: "Same color family (neutral) as the item to its right",
    });
  });
  it("passes a different family between two others", () => {
    expect(colorAdjacency(candidate({ colorFamily: "pastel" }), fixture, 1).ok).toBe(true);
  });
  it("ignores the item being replaced", () => {
    // slot 2 currently black; replacing it with black must only compare to slots 1 and 3
    expect(colorAdjacency(candidate({ colorFamily: "pastel" }), fixture, 2).ok).toBe(true);
  });
  it("handles end slots with one neighbor", () => {
    expect(colorAdjacency(candidate({ colorFamily: "neutral" }), fixture, 3).ok).toBe(true);
    expect(colorAdjacency(candidate({ colorFamily: "black" }), rail([null, item("black")]), 0).ok).toBe(false);
  });
});

describe("categoryMix", () => {
  const fixture = rail([item("black", "legging", "a"), item("neutral", "legging", "b"), item("pastel", "top")]);

  it("blocks a third legging style on the rail", () => {
    expect(categoryMix(candidate({ category: "legging" }), fixture, 2, 2)).toEqual({
      ok: false,
      rule: "category_cap",
      reason: "Rail already has 2 legging styles (max 2)",
    });
  });
  it("allows a legging when it replaces one of the two", () => {
    expect(categoryMix(candidate({ category: "legging" }), fixture, 0, 2).ok).toBe(true);
  });
  it("allows another category", () => {
    expect(categoryMix(candidate({ category: "top" }), fixture, 2, 2).ok).toBe(true);
  });
});
