import { describe, expect, it } from "vitest";
import { generate } from "../../scripts/seed-data";
import { colorAdjacency, outfitRole, zoneTheme } from "../../app/lib/engine/visual";
import type { FixtureContext } from "../../app/lib/engine/types";

// The seeded layout must pass the same visual standards the app enforces on a replacement, planted swap-outs included.
describe("seeded floor layout", () => {
  const d = generate();
  // The visual rules read color, category and role only; the stock fields are there to make a Candidate.
  const products = new Map(
    d.products.map((p) => [p.handle, { ...p, productId: p.handle, back: {}, damaged: {}, placed: true, weeklyVelocity: 0 }]),
  );

  it.each(d.fixtures.map((f) => [f.name, f] as const))("%s passes palette, outfit role and color adjacency", (_, f) => {
    const zone = d.zones.find((z) => z.name === f.zone)!;
    const slots = Array.from({ length: f.slotCount }, (_, i) => {
      const pl = d.placements.find((p) => p.fixture === f.name && p.slot === i);
      return pl ? products.get(pl.handle)! : null;
    });
    const fixture: FixtureContext = { name: f.name, type: f.type, zone, slots };
    const failures = slots.flatMap((p, i) =>
      !p
        ? [`slot ${i + 1} is empty`]
        : [zoneTheme(p, fixture), outfitRole(p, fixture, i), colorAdjacency(p, fixture, i)].flatMap((r) =>
            r.ok ? [] : [`slot ${i + 1} ${p.title}: ${r.reason}`],
          ),
    );
    expect(failures).toEqual([]);
  });
});
