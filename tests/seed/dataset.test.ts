import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate } from "../../scripts/seed-data";

// The demo dataset is pinned: layout, stock, sales and the scans built from them must not shift as a side effect
// of other changes (a new color list, a floor plan, another random draw). Changing it on purpose means updating
// the fingerprint below and the README numbers.
describe("demo dataset", () => {
  const d = generate();

  it("keeps its headline counts", () => {
    expect(d.products).toHaveLength(163);
    expect(d.placements).toHaveLength(80);
    expect(d.units.filter((u) => u.status !== "sold")).toHaveLength(6730);
  });

  it("is byte-for-byte the same as before", () => {
    expect(createHash("sha1").update(JSON.stringify(d)).digest("hex")).toBe("c4f4063e73288b6f5a118334223da9208c084531");
  });

  it("names every product in one of the ten basic colors", () => {
    const basic = ["Black", "White", "Navy", "Red", "Dark Red", "Pink", "Brown", "Beige", "Grey", "Green", "Purple"];
    for (const p of d.products) expect(basic).toContain(p.colorName);
  });
});
