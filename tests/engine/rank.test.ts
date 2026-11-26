import { describe, expect, it } from "vitest";
import { colorNote, rank, withArticle } from "../../app/lib/engine/rank";
import type { ColorFamily } from "../../app/lib/engine/types";
import { RAIL_CADENCE, cadenceFor, candidate, deepBack, item, rail } from "./helpers";

// Women's rail, outfit top -> bottom -> cover-up: black top | [bottom slot to fill] | black jacket | grey bra
const fixture = rail([item("black", "top", "T0"), null, item("black", "outerwear", "J1"), item("grey", "bra", "B1")]);

const pool = [
  candidate({ productId: "white-legging", title: "White Legging", colorFamily: "white", weeklyVelocity: 6 }),
  candidate({ productId: "grey-legging", title: "Grey Legging", colorFamily: "grey", weeklyVelocity: 3 }),
  candidate({ productId: "black-legging", title: "Black Legging", colorFamily: "black", weeklyVelocity: 9 }),
  candidate({ productId: "red-legging", title: "Red Legging", colorFamily: "red", weeklyVelocity: 5 }),
  candidate({ productId: "white-top", title: "White Top", category: "top", colorFamily: "white", weeklyVelocity: 6 }),
  candidate({ productId: "broken", title: "Broken Run", colorFamily: "white", back: { ...deepBack(), S: 0 } }),
  candidate({ productId: "placed", title: "Placed", colorFamily: "white", placed: true }),
];

describe("rank", () => {
  const result = rank({ fixture, slot: 1, candidates: pool, cadenceFor });
  const rejection = (id: string) => result.rejected.find((r) => r.candidate.productId === id);

  it("only picks candidates that pass every hard rule", () => {
    expect(result.picks.map((p) => p.candidate.productId).sort()).toEqual(["grey-legging", "white-legging"]);
  });

  it("explains each rejection with the rule that failed", () => {
    expect(rejection("black-legging")).toMatchObject({ stage: "visual", reason: "Would put 3 black items in a row" });
    expect(rejection("red-legging")).toMatchObject({ stage: "visual", rule: "zone_palette" });
    expect(rejection("white-top")).toMatchObject({ stage: "visual", reason: "Slot 2 is a bottom slot (top → bottom → cover-up)" });
    expect(rejection("broken")).toMatchObject({ stage: "stock", rule: "size_run" });
    expect(rejection("placed")).toMatchObject({ stage: "stock", rule: "already_placed" });
  });

  it("lists visual rejections before stock rejections", () => {
    expect(result.rejected.map((r) => r.stage)).toEqual(["visual", "visual", "visual", "stock", "stock"]);
  });

  it("writes a one-line reason for each pick", () => {
    const pick = result.picks.find((p) => p.candidate.productId === "white-legging")!;
    expect(pick.reason).toBe(
      "Full XXS–XL run, 60 in backstock, fits Zone 2's palette, breaks up two blacks, 6.0 sold/week, #2 of 6 leggings by sales",
    );
  });

  it("ranks sales against every item in the category, not only the ones that pass", () => {
    const legging = result.picks.find((p) => p.candidate.productId === "grey-legging")!;
    // Black and Red Legging are rejected but still sell faster; Broken Run and Placed sell 4/week.
    expect(legging.reason).toContain("3.0 sold/week, #6 of 6 leggings by sales");
  });

  it("scores velocity against every item in the category, not only the ones that pass", () => {
    // Slow Jacket is the only outerwear that passes; Fast Jacket outsells it 10x but is already on the floor.
    const r = rank({
      fixture,
      slot: 2, // the cover-up slot
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
    expect(result.weights).toEqual({ velocity: 0.35, cover: 0.25, contrast: 0.4 });
  });

  it("caps picks at topN", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ productId: `p${i}`, title: `P${i}`, colorFamily: i % 2 ? "white" : "grey" }),
    );
    expect(rank({ fixture, slot: 1, candidates: many, cadenceFor }).picks).toHaveLength(3);
  });

  it("applies a category preference as a filter, not an override", () => {
    const jogger = candidate({ productId: "white-jogger", category: "jogger" });
    const r = rank({ fixture, slot: 1, candidates: [...pool, jogger], cadenceFor, prefs: { category: "legging" } });
    expect(r.picks.map((p) => p.candidate.productId).sort()).toEqual(["grey-legging", "white-legging"]);
    expect(r.rejected.find((x) => x.candidate.productId === "white-jogger")).toMatchObject({ stage: "preference" });
  });

  it("a color preference can't bring back a hard-rule failure", () => {
    const r = rank({ fixture, slot: 1, candidates: pool, cadenceFor, prefs: { colorFamilies: ["red"] } });
    expect(r.picks).toHaveLength(0);
    expect(r.rejected.find((x) => x.candidate.productId === "red-legging")).toMatchObject({ rule: "zone_palette" });
  });

  it("a contrast boost reorders picks", () => {
    const cands = [
      candidate({ productId: "fast-grey", title: "Fast Grey", colorFamily: "grey", weeklyVelocity: 10 }),
      candidate({ productId: "slow-white", title: "Slow White", colorFamily: "white", weeklyVelocity: 2 }),
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
    const { picks } = rank({ fixture: fx, slot: 0, candidates: [candidate({ category: "top", colorFamily: "black" })], cadenceFor });
    expect(picks[0].reason).toContain("black next to grey");
  });

  it("uses the right article for each category", () => {
    expect(withArticle("outerwear")).toBe("outerwear");
    expect(withArticle("short")).toBe("shorts");
    expect(withArticle("top")).toBe("a top");
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

describe("closest options when nothing fits", () => {
  // Bottom slot between a black top and a black jacket; Zone 2 palette here is grey, white, black.
  const nearMisses = [
    candidate({ productId: "red", title: "Red Legging", colorFamily: "red", weeklyVelocity: 6 }), // palette only
    candidate({ productId: "black", title: "Black Legging", colorFamily: "black", weeklyVelocity: 9 }), // adjacency only
  ];
  const never = [
    candidate({ productId: "top", title: "White Top", category: "top", colorFamily: "white" }), // wrong role for the slot
    candidate({ productId: "broken", title: "Broken", colorFamily: "red", back: { ...deepBack(), S: 0 } }), // stock rule
    candidate({ productId: "placed", title: "Placed", colorFamily: "red", placed: true }), // stock rule
  ];
  const r = rank({ fixture, slot: 1, candidates: [...nearMisses, ...never], cadenceFor });

  it("lists items that break exactly one palette or adjacency rule, labeled with that rule", () => {
    expect(r.picks).toEqual([]);
    expect(Object.fromEntries(r.closest.map((c) => [c.candidate.productId, c.label]))).toEqual({
      red: "Fits everything except Zone 2's palette",
      black: "Fits everything except color spacing: black next to black",
    });
  });

  it("never relaxes a stock rule or the slot's role", () => {
    const ids = r.closest.map((c) => c.candidate.productId);
    for (const id of ["top", "broken", "placed"]) expect(ids).not.toContain(id);
  });

  it("leaves out items that break both the palette and adjacency", () => {
    const greyOnly = rail([item("red", "top", "T0"), null, item("grey", "outerwear", "J1")], ["grey", "white"]);
    const both = candidate({ productId: "red-legging", colorFamily: "red" }); // off palette and next to red
    expect(rank({ fixture: greyOnly, slot: 1, candidates: [both], cadenceFor }).closest).toEqual([]);
  });

  it("shows at most topN, best score first", () => {
    const many = ["red", "blue", "pink", "olive", "navy"].map((c, i) =>
      candidate({ productId: c, title: c, colorFamily: c as ColorFamily, weeklyVelocity: i + 1 }),
    );
    const closest = rank({ fixture, slot: 1, candidates: many, cadenceFor }).closest;
    expect(closest).toHaveLength(3);
    expect(closest.map((c) => c.score)).toEqual([...closest.map((c) => c.score)].sort((a, b) => b - a));
  });

  it("is empty when a valid pick exists", () => {
    expect(rank({ fixture, slot: 1, candidates: pool, cadenceFor }).closest).toEqual([]);
  });
});
