import { describe, expect, it } from "vitest";
import { fixtureStatus, onFillList } from "../../app/lib/engine/status";
import { shortStatus } from "../../app/components/FloorMap";

const ok = { swapOut: false, fill: {} };
const fill = { swapOut: false, fill: { S: 1 } };
const swap = { swapOut: true, fill: {} };

describe("fixtureStatus", () => {
  it("needs replacing when any slot is a swap-out, even with fills", () => {
    expect(fixtureStatus([ok, fill, swap])).toBe("replace");
  });
  it("needs fill when a slot is on the fill list and nothing needs replacing", () => {
    expect(fixtureStatus([ok, fill])).toBe("fill");
  });
  it("is OK when every slot is full", () => {
    expect(fixtureStatus([ok, ok])).toBe("ok");
    expect(fixtureStatus([])).toBe("ok");
  });
  it("leaves a swap-out's partial refill off the fill list, as the Replenishment page does", () => {
    expect(onFillList({ swapOut: true, fill: { S: 1 } })).toBe(false);
    expect(fixtureStatus([{ swapOut: true, fill: { S: 1 } }])).toBe("replace");
  });
});

describe("shortStatus", () => {
  it("labels each status in words that fit on a table", () => {
    expect(shortStatus({ status: "replace", replace: 2, fill: 1 })).toBe("2 swap");
    expect(shortStatus({ status: "fill", replace: 0, fill: 3 })).toBe("3 fill");
    expect(shortStatus({ status: "ok", replace: 0, fill: 0 })).toBe("OK");
    expect(shortStatus({ status: null, replace: 0, fill: 0 })).toBe("");
  });
});
