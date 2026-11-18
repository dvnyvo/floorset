import { describe, expect, it } from "vitest";
import { colorNote, rank, withArticle } from "../../app/lib/engine/rank";
import type { ColorFamily } from "../../app/lib/engine/types";
import { RAIL_CADENCE, cadenceFor, candidate, deepBack, item, rail } from "./helpers";

// Zone 2 rail: black legging | [slot to fill] | black top | grey bra
const fixture = rail([item("black", "legging", "L1"), null, item("black", "top", "T1"), item("grey", "bra", "B1")]);

const pool = [
  candidate({ productId: "white-top", title: "White Top", category: "top", colorFamily: "white", weeklyVelocity: 6 }),
  candidate({ productId: "grey-legging", title: "Grey Legging", category: "legging", colorFamily: "grey", weeklyVelocity: 3 }),
  candidate({ productId: "black-legging", title: "Black Legging", colorFamily: "black", weeklyVelocity: 9 }),
  candidate({ productId: "red-top", title: "Red Top", category: "top", colorFamily: "red", weeklyVelocity: 5 }),
  candidate({ productId: "broken", title: "Broken Run", colorFamily: "white", back: { ...deepBack(), S: 0 } }),
  candidate({ productId: "placed", title: "Placed", colorFamily: "white", placed: true }),
];

describe("rank", () => {
  const result = rank({ fixture, slot: 1, candidates: pool, cadenceFor });
  const rejection = (id: string) => result.rejected.find((r) => r.candidate.productId === id);

  it("only picks candidates that pass every hard rule", () => {
    expect(result.picks.map((p) => p.candidate.productId).sort()).toEqual(["grey-legging", "white-top"]);
  });

  it("explains each rejection with the rule that failed", () => {
    expect(rejection("black-legging")).toMatchObject({ stage: "visual", reason: "Would put 3 black items in a row" });
    expect(rejection("red-top")).toMatchObject({ stage: "visual", rule: "zone_palette" });
    expect(rejection("broken")).toMatchObject({ stage: "stock", rule: "size_run" });
    expect(rejection("placed")).toMatchObject({ stage: "stock", rule: "already_placed" });
  });

  it("lists visual rejections before stock rejections", () => {
    expect(result.rejected.map((r) => r.stage)).toEqual(["visual", "visual", "stock", "stock"]);
  });

  it("writes a one-line reason for each pick", () => {
    const top = result.picks.find((p) => p.candidate.productId === "white-top")!;
    expect(top.reason).toBe(
      "Full XXS–XL run, 60 in back, fits Zone 2 palette, breaks up two blacks, 6.0 sold/week, top seller of 2 tops",
    );
  });

  it("ranks sales against every item in the category, not only the ones that pass", () => {
    const legging = result.picks.find((p) => p.candidate.productId === "grey-legging")!;
    // Black Legging (9/week) is rejected but still sells faster; Broken Run and Placed sell 4/week.
    expect(legging.reason).toContain("3.0 sold/week, #4 of 4 leggings by sales");
  });

  it("scores velocity against every item in the category, not only the ones that pass", () => {
    // Slow Jacket is the only outerwear that passes; Fast Jacket outsells it 10x but is already on the floor.
    const r = rank({
      fixture,
      slot: 1,
      cadenceFor,
      candidates: [
        candidate({ productId: "slow", category: "outerwear", colorFamily: "white", weeklyVelocity: 1 }),
        candidate({ productId: "fast", category: "outerwear", colorFamily: "white", weeklyVelocity: 10, placed: true }),
      ],
    });
    expect(r.picks.map((p) => p.candidate.productId)).toEqual(["slow"]);
    expect(r.picks[0].parts.velocity).toBeCloseTo(0.1);
  });

  it("returns the score parts and the weights used, so the UI can show the breakdown", () => {
    const top = result.picks[0];
    const total = (Object.keys(top.parts) as (keyof typeof top.parts)[]).reduce((n, k) => n + result.weights[k] * top.parts[k], 0);
    expect(total).toBeCloseTo(top.score);
    expect(result.weights).toEqual({ velocity: 0.35, cover: 0.25, balance: 0.25, contrast: 0.15 });
  });

  it("caps picks at topN", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ productId: `p${i}`, title: `P${i}`, category: "top", colorFamily: i % 2 ? "white" : "grey" }),
    );
    expect(rank({ fixture, slot: 1, candidates: many, cadenceFor }).picks).toHaveLength(3);
  });

  it("applies a category preference as a filter, not an override", () => {
    const r = rank({ fixture, slot: 1, candidates: pool, cadenceFor, prefs: { category: "legging" } });
    expect(r.picks.map((p) => p.candidate.productId)).toEqual(["grey-legging"]);
    expect(r.rejected.find((x) => x.candidate.productId === "white-top")).toMatchObject({ stage: "preference" });
  });

  it("a color preference can't bring back a hard-rule failure", () => {
    const r = rank({ fixture, slot: 1, candidates: pool, cadenceFor, prefs: { colorFamilies: ["red"] } });
    expect(r.picks).toHaveLength(0);
    expect(r.rejected.find((x) => x.candidate.productId === "red-top")).toMatchObject({ rule: "zone_palette" });
  });

  it("a contrast boost reorders picks", () => {
    const cands = [
      candidate({ productId: "fast-grey", title: "Fast Grey", category: "top", colorFamily: "grey", weeklyVelocity: 10 }),
      candidate({ productId: "slow-white", title: "Slow White", category: "top", colorFamily: "white", weeklyVelocity: 2 }),
    ];
    const base = rank({ fixture, slot: 1, candidates: cands, cadenceFor });
    expect(base.picks[0].candidate.productId).toBe("fast-grey");
    const boosted = rank({ fixture, slot: 1, candidates: cands, cadenceFor, prefs: { weights: { contrast: 2 } } });
    expect(boosted.picks[0].candidate.productId).toBe("slow-white");
  });

  it("rejects categories with no cadence for the fixture type", () => {
    const table = { ...fixture, type: "table" as const };
    const r = rank({ fixture: table, slot: 1, candidates: [candidate({ category: "bra" })], cadenceFor });
    expect(r.rejected[0]).toMatchObject({ rule: "no_cadence", reason: "No size cadence for bra on a table" });
  });
});

describe("explain wording", () => {
  it("says 'next to' for an edge slot", () => {
    const fx = rail([null, item("grey", "bra", "B9")]);
    const { picks } = rank({ fixture: fx, slot: 0, candidates: [candidate({ colorFamily: "black" })], cadenceFor });
    expect(picks[0].reason).toContain("black next to grey");
  });

  it("uses the right article for each category", () => {
    const fx = rail([null, item("grey", "bra", "B9")]);
    const adds = (category: string) =>
      rank({ fixture: fx, slot: 0, candidates: [candidate({ category, colorFamily: "black" })], cadenceFor }).picks[0].reason;
    expect(adds("outerwear")).toContain("adds outerwear to the rail");
    expect(adds("short")).toContain("adds shorts to the rail");
    expect(adds("top")).toContain("adds a top to the rail");
    expect(adds("legging")).toContain("adds a legging to the rail");
    expect(withArticle("anorak")).toBe("an anorak");
  });

  it("words a category preference rejection naturally", () => {
    const fx = rail([null, item("grey", "bra", "B9")]);
    const r = rank({ fixture: fx, slot: 0, candidates: [candidate({ colorFamily: "black" })], cadenceFor, prefs: { category: "outerwear" } });
    expect(r.rejected[0].reason).toBe("Not outerwear (asked for outerwear)");
    const t = rank({ fixture: fx, slot: 0, candidates: [candidate({ colorFamily: "black" })], cadenceFor, prefs: { category: "top" } });
    expect(t.rejected[0].reason).toBe("Not a top (asked for tops)");
  });
});

describe("fallback when nothing has 2x depth", () => {
  const shallow = Object.fromEntries(Object.entries(RAIL_CADENCE).map(([s, n]) => [s, n])); // exactly one run
  it("offers items that fill the size run once, flagged as fallback", () => {
    const r = rank({ fixture, slot: 1, candidates: [candidate({ productId: "once", colorFamily: "white", back: shallow })], cadenceFor });
    expect(r.fallback).toBe(true);
    expect(r.picks.map((p) => p.candidate.productId)).toEqual(["once"]);
    expect(r.picks[0].reason).toContain("no back-up stock");
  });
  it("still never offers a broken size run", () => {
    const r = rank({ fixture, slot: 1, candidates: [candidate({ colorFamily: "white", back: { ...shallow, S: 1 } })], cadenceFor });
    expect(r.picks).toEqual([]);
    expect(r.fallback).toBe(false);
    expect(r.rejected[0].rule).toBe("size_run");
  });
  it("prefers strict picks when any exist", () => {
    expect(rank({ fixture, slot: 1, candidates: pool, cadenceFor }).fallback).toBe(false);
  });
});

describe("colorNote", () => {
  const zone2 = { name: "Zone 2", department: "womens", palette: ["cream", "pink", "lilac", "grey"] as ColorFamily[] };
  const bright: ColorFamily[] = ["blue", "red", "pink"];

  it("says when the zone palette leaves one color and the picks don't change", () => {
    expect(colorNote(bright, zone2, true, "bright")).toBe(
      "Only pink is both bright and in Zone 2's palette, so the picks are the same as with any color.",
    );
  });
  it("says when the palette limits the colors even if the picks change", () => {
    expect(colorNote(["blue", "pink", "lilac"], zone2, false)).toBe("Only pink and lilac of the requested colors are in Zone 2's palette.");
  });
  it("says when no requested color is in the palette", () => {
    expect(colorNote(["blue", "red"], zone2, false, "bright")).toBe(
      "None of the bright colors (blue and red) is in Zone 2's palette, so nothing can pass.",
    );
  });
  it("says when every color fits but the picks are unchanged", () => {
    expect(colorNote(["cream", "grey"], zone2, true, "light")).toBe("The top picks are already light, so they don't change.");
  });
  it("stays quiet when the refinement works as expected", () => {
    expect(colorNote(["cream", "grey"], zone2, false, "light")).toBeNull();
  });
});
