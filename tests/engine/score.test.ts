import { describe, expect, it } from "vitest";
import { balance, contrast, cover, velocity } from "../../app/lib/engine/score";
import { candidate, item, rail } from "./helpers";

describe("score parts", () => {
  it("normalizes velocity within the category", () => {
    const pool = [candidate({ weeklyVelocity: 8 }), candidate({ weeklyVelocity: 2 }), candidate({ category: "top", weeklyVelocity: 50 })];
    expect(velocity(pool[1], pool)).toBe(0.25);
    expect(velocity(candidate({ weeklyVelocity: 0 }), [candidate({ weeklyVelocity: 0 })])).toBe(0);
  });

  it("caps cover at the configured weeks", () => {
    expect(cover(candidate({ back: { S: 12 }, weeklyVelocity: 2 }), 12)).toBe(0.5); // 6 weeks
    expect(cover(candidate({ back: { S: 100 }, weeklyVelocity: 1 }), 12)).toBe(1);
  });

  it("rewards categories the fixture lacks", () => {
    const fixture = rail([item("black", "legging"), null, item("white", "top")]);
    expect(balance(candidate({ category: "bra" }), fixture, 1, 2)).toBe(1);
    expect(balance(candidate({ category: "legging" }), fixture, 1, 2)).toBe(0.5);
  });

  it("measures tone distance from neighbors", () => {
    const fixture = rail([item("black"), null, item("black")]);
    expect(contrast(candidate({ colorFamily: "white" }), fixture, 1)).toBe(1);
    expect(contrast(candidate({ colorFamily: "black" }), fixture, 1)).toBe(0);
    expect(contrast(candidate(), rail([null]), 0)).toBe(0.5);
  });
});
