import { describe, expect, it } from "vitest";
import { rank } from "../../app/lib/engine/rank";
import { cadenceFor, candidate, deepBack, item, rail } from "./helpers";

// Zone 2 rail: black legging | [slot to fill] | black top | neutral bra
const fixture = rail([item("black", "legging", "L1"), null, item("black", "top", "T1"), item("neutral", "bra", "B1")]);

const pool = [
  candidate({ productId: "pastel-top", title: "Pastel Top", category: "top", colorFamily: "pastel", weeklyVelocity: 6 }),
  candidate({ productId: "neutral-legging", title: "Neutral Legging", category: "legging", colorFamily: "neutral", weeklyVelocity: 3 }),
  candidate({ productId: "black-legging", title: "Black Legging", colorFamily: "black", weeklyVelocity: 9 }),
  candidate({ productId: "bright-top", title: "Bright Top", category: "top", colorFamily: "bright", weeklyVelocity: 5 }),
  candidate({ productId: "broken", title: "Broken Run", colorFamily: "pastel", back: { ...deepBack(), S: 0 } }),
  candidate({ productId: "placed", title: "Placed", colorFamily: "pastel", placed: true }),
];

describe("rank", () => {
  const result = rank({ fixture, slot: 1, candidates: pool, cadenceFor });
  const rejection = (id: string) => result.rejected.find((r) => r.candidate.productId === id);

  it("only picks candidates that pass every hard rule", () => {
    expect(result.picks.map((p) => p.candidate.productId).sort()).toEqual(["neutral-legging", "pastel-top"]);
  });

  it("explains each rejection with the rule that failed", () => {
    expect(rejection("black-legging")).toMatchObject({ stage: "visual", reason: "Would put 3 black items in a row" });
    expect(rejection("bright-top")).toMatchObject({ stage: "visual", rule: "zone_palette" });
    expect(rejection("broken")).toMatchObject({ stage: "stock", rule: "size_run" });
    expect(rejection("placed")).toMatchObject({ stage: "stock", rule: "already_placed" });
  });

  it("lists visual rejections before stock rejections", () => {
    expect(result.rejected.map((r) => r.stage)).toEqual(["visual", "visual", "stock", "stock"]);
  });

  it("writes a one-line reason for each pick", () => {
    const top = result.picks.find((p) => p.candidate.productId === "pastel-top")!;
    expect(top.reason).toBe("Full XXS–XL run, 60 in back, fits Zone 2 palette, breaks up two blacks, 6.0 sold/week");
  });

  it("caps picks at topN", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ productId: `p${i}`, title: `P${i}`, category: "top", colorFamily: i % 2 ? "pastel" : "neutral" }),
    );
    expect(rank({ fixture, slot: 1, candidates: many, cadenceFor }).picks).toHaveLength(3);
  });

  it("applies a category preference as a filter, not an override", () => {
    const r = rank({ fixture, slot: 1, candidates: pool, cadenceFor, prefs: { category: "legging" } });
    expect(r.picks.map((p) => p.candidate.productId)).toEqual(["neutral-legging"]);
    expect(r.rejected.find((x) => x.candidate.productId === "pastel-top")).toMatchObject({ stage: "preference" });
  });

  it("a color preference can't bring back a hard-rule failure", () => {
    const r = rank({ fixture, slot: 1, candidates: pool, cadenceFor, prefs: { colorFamilies: ["bright"] } });
    expect(r.picks).toHaveLength(0);
    expect(r.rejected.find((x) => x.candidate.productId === "bright-top")).toMatchObject({ rule: "zone_palette" });
  });

  it("a contrast boost reorders picks", () => {
    const cands = [
      candidate({ productId: "fast-neutral", title: "Fast Neutral", category: "top", colorFamily: "neutral", weeklyVelocity: 10 }),
      candidate({ productId: "slow-pastel", title: "Slow Pastel", category: "top", colorFamily: "pastel", weeklyVelocity: 2 }),
    ];
    const base = rank({ fixture, slot: 1, candidates: cands, cadenceFor });
    expect(base.picks[0].candidate.productId).toBe("fast-neutral");
    const boosted = rank({ fixture, slot: 1, candidates: cands, cadenceFor, prefs: { weights: { contrast: 2 } } });
    expect(boosted.picks[0].candidate.productId).toBe("slow-pastel");
  });

  it("rejects categories with no cadence for the fixture type", () => {
    const table = { ...fixture, type: "table" as const };
    const r = rank({ fixture: table, slot: 1, candidates: [candidate({ category: "bra" })], cadenceFor });
    expect(r.rejected[0]).toMatchObject({ rule: "no_cadence", reason: "No size cadence for bra on a table" });
  });
});
