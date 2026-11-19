import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../app/lib/engine/config";
import { colorDistance, contrast, cover, velocity } from "../../app/lib/engine/score";
import { candidate, item, rail } from "./helpers";

describe("score parts", () => {
  it("normalizes velocity within the category", () => {
    const pool = [candidate({ weeklyVelocity: 8 }), candidate({ weeklyVelocity: 2 }), candidate({ category: "top", weeklyVelocity: 50 })];
    expect(velocity(pool[1], pool)).toBe(0.25);
    expect(velocity(candidate({ weeklyVelocity: 0 }), [candidate({ weeklyVelocity: 0 })])).toBe(0);
  });

  it("caps cover at 4 weeks of supply", () => {
    expect(defaultConfig.coverWeeksCap).toBe(4);
    expect(cover(candidate({ back: { S: 4 }, weeklyVelocity: 2 }), 4)).toBe(0.5); // 2 weeks
    expect(cover(candidate({ back: { S: 100 }, weeklyVelocity: 1 }), 4)).toBe(1);
  });

  it("measures contrast from the neighbors", () => {
    const fixture = rail([item("black"), null, item("black")]);
    expect(contrast(candidate({ colorFamily: "white" }), fixture, 1)).toBe(1);
    expect(contrast(candidate({ colorFamily: "black" }), fixture, 1)).toBe(0);
    expect(contrast(candidate(), rail([null]), 0)).toBe(0.5);
  });

  it("counts hue as well as lightness", () => {
    expect(colorDistance("pink", "pink")).toBe(0);
    expect(colorDistance("lilac", "lilac")).toBe(0);
    // same lightness, different hue: the old lightness-only score gave 0
    expect(colorDistance("lilac", "pink")).toBeCloseTo(65 / 180);
    expect(colorDistance("blue", "red")).toBeGreaterThan(colorDistance("navy", "blue"));
    expect(colorDistance("pink", "cream")).toBeGreaterThan(0.5); // a hue against a neutral
    expect(colorDistance("black", "white")).toBe(1); // capped
    const zone2 = rail([item("pink"), null, item("cream")], ["cream", "pink", "lilac", "grey"]);
    expect(contrast(candidate({ colorFamily: "lilac" }), zone2, 1)).toBeGreaterThan(0.3);
  });
});
