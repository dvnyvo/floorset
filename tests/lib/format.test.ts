import { describe, expect, it } from "vitest";
import { cap, pct } from "../../app/lib/format";

describe("pct", () => {
  it("always shows one decimal", () => {
    expect(pct(0.95)).toBe("95.0%");
    expect(pct(0.96)).toBe("96.0%");
    expect(pct(0.89)).toBe("89.0%");
    expect(pct(0.9612)).toBe("96.1%");
    expect(pct(1)).toBe("100.0%");
    expect(pct(0)).toBe("0.0%");
  });
  it("shows a dash when there is no rate", () => {
    expect(pct(null)).toBe("—");
  });
});

describe("cap", () => {
  it("capitalizes a category or color name", () => {
    expect(cap("bra")).toBe("Bra");
  });
});
