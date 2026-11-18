import { describe, expect, it } from "vitest";
import { roleOf } from "../../app/lib/engine/roles";
import type { Candidate, FixtureContext } from "../../app/lib/engine/types";
import { colorAdjacency, outfitRole, zoneTheme } from "../../app/lib/engine/visual";
import { candidate, item, rail, table } from "./helpers";

describe("zoneTheme", () => {
  it("accepts a color family in the zone palette", () => {
    expect(zoneTheme(candidate({ colorFamily: "white" }), rail([])).ok).toBe(true);
  });
  it("explains a palette miss", () => {
    expect(zoneTheme(candidate({ colorFamily: "red" }), rail([], ["grey", "white"]))).toEqual({
      ok: false,
      rule: "zone_palette",
      reason: "Red isn't in Zone 2's palette (grey, white)",
    });
  });
});

describe("colorAdjacency", () => {
  const fixture = rail([item("black"), null, item("black"), item("grey")]);

  it("flags three in a row when both neighbors match", () => {
    expect(colorAdjacency(candidate({ colorFamily: "black" }), fixture, 1)).toMatchObject({
      ok: false,
      reason: "Would put 3 black items in a row",
    });
  });
  it("flags a single matching neighbor and says which side", () => {
    expect(colorAdjacency(candidate({ colorFamily: "grey" }), fixture, 2)).toMatchObject({
      ok: false,
      reason: "Same color family (grey) as the item to its right",
    });
  });
  it("passes a different family between two others", () => {
    expect(colorAdjacency(candidate({ colorFamily: "white" }), fixture, 1).ok).toBe(true);
  });
  it("ignores the item being replaced", () => {
    // slot 2 currently black; replacing it with black must only compare to slots 1 and 3
    expect(colorAdjacency(candidate({ colorFamily: "white" }), fixture, 2).ok).toBe(true);
  });
  it("handles end slots with one neighbor", () => {
    expect(colorAdjacency(candidate({ colorFamily: "grey" }), fixture, 3).ok).toBe(true);
    expect(colorAdjacency(candidate({ colorFamily: "black" }), rail([null, item("black")]), 0).ok).toBe(false);
  });
});

describe("outfitRole", () => {
  const top = candidate({ category: "top" });
  const bottom = candidate({ category: "legging" });
  const coverup = candidate({ category: "outerwear" });
  const empty = (n: number) => Array.from({ length: n }, () => null);
  const fits = (fixture: FixtureContext, c: Candidate) => fixture.slots.map((_, i) => outfitRole(c, fixture, i).ok);

  it("follows top → bottom → cover-up on women's rails, repeating per outfit", () => {
    const fx = rail(empty(6));
    expect(fits(fx, top)).toEqual([true, false, false, true, false, false]);
    expect(fits(fx, bottom)).toEqual([false, true, false, false, true, false]);
    expect(fits(fx, coverup)).toEqual([false, false, true, false, false, true]);
    expect(outfitRole(top, fx, 2)).toEqual({ ok: false, rule: "outfit_role", reason: "Slot 3 is a cover-up slot (top → bottom → cover-up)" });
  });

  it("follows cover-up → top → bottom on men's rails, repeating per outfit", () => {
    const fx = rail(empty(6), undefined, "mens");
    expect(fits(fx, coverup)).toEqual([true, false, false, true, false, false]);
    expect(fits(fx, top)).toEqual([false, true, false, false, true, false]);
    expect(fits(fx, bottom)).toEqual([false, false, true, false, false, true]);
    expect(outfitRole(bottom, fx, 0)).toMatchObject({ reason: "Slot 1 is a cover-up slot (cover-up → top → bottom)" });
  });

  it("puts tops and cover-ups on the left half of a table, bottoms on the right", () => {
    for (const dept of ["womens", "mens"]) {
      expect(fits(table(empty(3), dept), top)).toEqual([true, true, false]);
      expect(fits(table(empty(3), dept), bottom)).toEqual([false, false, true]);
      expect(fits(table(empty(4), dept), bottom)).toEqual([false, false, true, true]);
    }
    expect(outfitRole(bottom, table(empty(3)), 0)).toMatchObject({
      reason: "Slot 1 is a top or cover-up slot (tops and cover-ups on the left, bottoms on the right)",
    });
    expect(outfitRole(top, table(empty(3)), 2)).toMatchObject({
      reason: "Slot 3 is a bottom slot (tops and cover-ups on the left, bottoms on the right)",
    });
  });

  it("never puts outerwear on a table, even on the cover-up side", () => {
    expect(fits(table(empty(3)), coverup)).toEqual([false, false, false]);
    expect(outfitRole(coverup, table(empty(3)), 0)).toEqual({
      ok: false,
      rule: "outerwear_table",
      reason: "Outerwear goes on rails, never on a table",
    });
  });

  it("counts a long sleeve as a cover-up, though its category is top", () => {
    expect(roleOf("Long Sleeve")).toBe("coverup");
    const longSleeve = candidate({ category: "top", role: roleOf("long sleeve") });
    expect(fits(rail(empty(3)), longSleeve)).toEqual([false, false, true]);
    expect(fits(table(empty(3)), longSleeve)).toEqual([true, true, false]); // not outerwear, so it may go on a table
  });
});
