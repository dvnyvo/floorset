import { describe, expect, it } from "vitest";
import { replenish } from "../../app/lib/engine/replenish";
import { RAIL_CADENCE } from "./helpers";

describe("replenish", () => {
  it("is full when the floor matches the cadence", () => {
    expect(replenish(RAIL_CADENCE, RAIL_CADENCE, {})).toMatchObject({ fill: {}, swapOut: false, reason: "Full" });
  });

  it("refills from back stock", () => {
    const r = replenish(RAIL_CADENCE, { ...RAIL_CADENCE, S: 1, M: 2 }, { S: 5, M: 5 });
    expect(r).toMatchObject({ fill: { S: 2, M: 1 }, short: {}, swapOut: false, reason: "Refill from back stock" });
  });

  it("flags a swap-out when back stock can't restore a size", () => {
    const r = replenish(RAIL_CADENCE, { ...RAIL_CADENCE, S: 0 }, { S: 1 });
    expect(r).toMatchObject({ fill: { S: 1 }, short: { S: 2 }, swapOut: true });
    expect(r.reason).toBe("Needs 2 more S beyond the 1 S in back");
  });

  it("combines short sizes with nothing in back", () => {
    const r = replenish(RAIL_CADENCE, { ...RAIL_CADENCE, S: RAIL_CADENCE.S! - 2, M: RAIL_CADENCE.M! - 2 }, {});
    expect(r.reason).toBe("Needs 2 more S and 2 more M, none in back");
  });

  it("treats negative back counts as zero", () => {
    expect(replenish(RAIL_CADENCE, { ...RAIL_CADENCE, XL: 0 }, { XL: -3 }).short).toEqual({ XL: 1 });
  });

  it("handles a missing cadence", () => {
    expect(replenish(undefined, {}, {}).swapOut).toBe(false);
  });
});
