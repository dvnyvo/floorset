import { describe, expect, it } from "vitest";
import { generate } from "../../scripts/seed-data";
import { AREAS, fixtureRect, PLAN_SIZE, ZONE_RECTS, type Rect } from "../../scripts/floor-plan";

const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const pairs = <T,>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

describe("floor plan", () => {
  const { zones, fixtures } = generate();
  const plan = { x: 0, y: 0, ...PLAN_SIZE };
  const placed = fixtures.map((f) => ({ name: f.name, type: f.type, zone: f.zone, rect: fixtureRect(f.zone, f.name) }));

  it("places every seeded zone and fixture", () => {
    expect(zones.map((z) => z.name).sort()).toEqual(Object.keys(ZONE_RECTS).sort());
    expect(placed).toHaveLength(20);
  });

  it("puts every fixture inside its own zone", () => {
    for (const f of placed) expect(inside(f.rect, ZONE_RECTS[f.zone]), f.name).toBe(true);
  });

  it("has no overlapping fixtures", () => {
    for (const [a, b] of pairs(placed)) expect(overlap(a.rect, b.rect), `${a.name} / ${b.name}`).toBe(false);
  });

  it("has no overlapping zones or areas, all inside the store", () => {
    const blocks = [...Object.entries(ZONE_RECTS).map(([name, rect]) => ({ name, rect })), ...AREAS.map((a) => ({ name: a.name, rect: a }))];
    for (const b of blocks) expect(inside(b.rect, plan), b.name).toBe(true);
    for (const [a, b] of pairs(blocks)) expect(overlap(a.rect, b.rect), `${a.name} / ${b.name}`).toBe(false);
  });

  it("draws rails long and thin and tables square-ish", () => {
    for (const f of placed) {
      const ratio = f.rect.w / f.rect.h;
      if (f.type === "rail") expect(ratio, f.name).toBeGreaterThanOrEqual(4);
      else expect(ratio, f.name).toBeCloseTo(1, 0);
    }
  });

  it("names areas the way the scanner does, so loose-tag counts match", () => {
    expect(AREAS.map((a) => a.name).sort()).toEqual(["Back Corridor", "Cash Wrap", "Entrance Corner", "Fitting Room"]);
  });
});
