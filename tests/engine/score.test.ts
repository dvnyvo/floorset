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
    expect(colorDistance("purple", "purple")).toBe(0);
    // close lightness, different hue: a lightness-only score would give 0.05
    expect(colorDistance("purple", "red")).toBeCloseTo(Math.hypot(0.05, 85 / 180));
    expect(colorDistance("navy", "red")).toBeGreaterThan(colorDistance("navy", "purple"));
    expect(colorDistance("pink", "beige")).toBeGreaterThan(0.5); // a hue against a neutral
    expect(colorDistance("black", "white")).toBe(1); // capped
    const zone2 = rail([item("pink"), null, item("beige")], ["beige", "pink", "purple", "grey"]);
    expect(contrast(candidate({ colorFamily: "purple" }), zone2, 1)).toBeGreaterThan(0.3);
  });
});
