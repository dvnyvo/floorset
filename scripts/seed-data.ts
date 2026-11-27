// Deterministic synthetic store: catalog, layout, stock, sales and RFID units.
// Every name, number and rule value here is invented for the demo.
import { roleOf, slotRoles, type Role } from "../app/lib/engine/roles.ts";

export const SIZES = ["XXS", "XS", "S", "M", "L", "XL"] as const;
export type Size = (typeof SIZES)[number];
export type ColorFamily =
  | "black" | "white" | "navy" | "red" | "pink"
  | "brown" | "beige" | "grey" | "green" | "purple";
export type Category = "legging" | "bra" | "top" | "outerwear" | "short" | "jogger";
export type FixtureType = "rail" | "table";
export type { Role };
export type ProductFixtureType = FixtureType | "both";
export type Department = "womens" | "mens";

export interface SeedProduct {
  handle: string;
  title: string;
  styleNo: string;
  category: Category;
  role: Role; // outfit role, separate from category: a long sleeve is a top that works as a cover-up
  department: Department;
  colorName: string;
  colorFamily: ColorFamily;
  fixtureType: ProductFixtureType;
  price: string;
  skus: Record<Size, string>;
}
export interface SeedZone { name: string; department: Department; palette: ColorFamily[] }
export interface SeedFixture { name: string; zone: string; type: FixtureType; slotCount: number }
export interface SeedCadence { fixtureType: FixtureType; category: Category; sizeCounts: Record<Size, number> }
export interface SeedPlacement { fixture: string; slot: number; handle: string }
export interface SeedUnit { epc: string; sku: string; area: "floor" | "back"; status: "in_stock" | "sold" | "damaged" }
export interface SeedSale { sku: string; date: string; units: number }

export interface SeedData {
  products: SeedProduct[];
  zones: SeedZone[];
  fixtures: SeedFixture[];
  cadenceRules: SeedCadence[];
  placements: SeedPlacement[];
  units: SeedUnit[];
  sales: SeedSale[];
  planted: { brokenRuns: string[]; sameColorRail: string };
}

// mulberry32: tiny seeded PRNG so every run produces the same store.
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Basic colors only: each product's color name is its color family's name.
const COLORS: Record<ColorFamily, string[]> = {
  black: ["Black"],
  white: ["White"],
  navy: ["Navy"],
  red: ["Red"],
  pink: ["Pink"],
  brown: ["Brown"],
  beige: ["Beige"],
  grey: ["Grey"],
  green: ["Green"],
  purple: ["Purple"],
};
const FAMILIES = Object.keys(COLORS) as ColorFamily[];

const CATEGORY: Record<Category, { label: string; fixture: ProductFixtureType; price: string; depts: Department[] }> = {
  legging: { label: "Legging", fixture: "both", price: "98.00", depts: ["womens"] },
  bra: { label: "Bra", fixture: "rail", price: "68.00", depts: ["womens"] },
  top: { label: "Tee", fixture: "both", price: "58.00", depts: ["womens", "mens"] },
  outerwear: { label: "Jacket", fixture: "rail", price: "148.00", depts: ["womens", "mens"] },
  short: { label: "Short", fixture: "table", price: "64.00", depts: ["womens", "mens"] },
  jogger: { label: "Jogger", fixture: "both", price: "108.00", depts: ["mens"] },
};

const STYLE_NAMES = [
  "Contour", "Ridge", "Breeze", "Pulse", "Atlas", "Meridian", "Crest", "Lumen", "Vista", "Strata",
  "Ember", "Cove", "Arc", "Haven", "Nova", "Glide", "Quill", "Terra", "Solace", "Tempo",
  "Drift", "Summit", "Harbor", "Prism", "Canyon", "Willow", "Orbit", "Sable", "Fable", "Mesa",
  "Pebble", "Cirrus", "Alder", "Basin", "Delta", "Fjord", "Grove", "Inlet", "Juniper", "Kestrel",
  "Lagoon", "Marlow", "Nimbus", "Opal", "Pine", "Quarry", "Reef", "Sierra", "Tundra", "Upland",
];

// Relative sell-through by size: S and M move fastest.
export const SIZE_CURVE: Record<Size, number> = { XXS: 0.5, XS: 0.8, S: 1.3, M: 1.3, L: 0.9, XL: 0.5 };

const ZONES: SeedZone[] = [
  { name: "Zone 1", department: "womens", palette: ["black", "grey", "white", "navy"] },
  { name: "Zone 2", department: "womens", palette: ["beige", "pink", "purple", "grey"] },
  { name: "Zone 3", department: "womens", palette: ["black", "red", "navy", "white"] },
  { name: "Zone 4", department: "womens", palette: ["brown", "green", "beige", "red"] },
  { name: "Men's", department: "mens", palette: ["black", "navy", "grey", "green", "brown"] },
];

const RAIL_CADENCE: Record<Size, number> = { XXS: 1, XS: 2, S: 3, M: 3, L: 2, XL: 1 };
const TABLE_CADENCE: Record<Size, number> = { XXS: 1, XS: 2, S: 2, M: 2, L: 2, XL: 1 };
const OUTERWEAR_CADENCE: Record<Size, number> = { XXS: 1, XS: 1, S: 2, M: 2, L: 2, XL: 1 };

// Styles added after the original 50, appended so the originals keep their colorways.
// Fill styles give the outfit layout enough tops to complete every fixture. Bench styles stay off the starting
// layout so Zone 1's swap-outs have replacements.
const EXTRA_STYLES: { name: string; department: Department; category: Category; kind?: string; families: ColorFamily[]; bench?: boolean }[] = [
  { name: "Aster", department: "womens", category: "top", kind: "Tank", families: ["white", "red", "navy"] },
  { name: "Bloom", department: "womens", category: "top", families: ["navy", "grey", "green"] },
  { name: "Cobble", department: "mens", category: "top", families: ["black", "navy", "green"] },
  { name: "Halo", department: "womens", category: "top", kind: "Long Sleeve", families: ["grey", "navy", "white"], bench: true },
  { name: "Rook", department: "womens", category: "top", kind: "Tank", families: ["black"], bench: true },
];

const BROKEN_RUN_SLOTS: [string, number][] = [
  ["Zone 4 Table 1", 0], ["Zone 1 Table 1", 1], ["Zone 1 Rail 2", 1], ["Zone 2 Rail 1", 0],
  ["Zone 1 Table 1", 0], ["Zone 1 Rail 1", 1], ["Zone 1 Rail 1", 3], ["Zone 2 Rail 2", 4],
];
export const SEED_DATE = "2026-11-15";
const SALES_DAYS = 56;
const SOLD_UNIT_DAYS = 7; // recent sales keep an EPC row (status sold) for ghost detection

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fits = (p: ProductFixtureType, f: FixtureType) => p === "both" || p === f;

export function generate(seed = 42): SeedData {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // --- Catalog: 50 styles x 3 colorways = 150 products, then the extra styles below, XXS-XL each ---
  // [category, label]: the label names the product kind, which sets its outfit role.
  const womensCats: [Category, string?][] = [["legging"], ["legging"], ["bra"], ["top"], ["top", "Long Sleeve"], ["outerwear"], ["short"]];
  const mensCats: [Category, string?][] = [["top"], ["short"], ["jogger"], ["outerwear"]];
  const products: SeedProduct[] = [];
  const addProduct = (name: string, styleIndex: number, department: Department, category: Category, kind: string | undefined, family: ColorFamily) => {
    const styleNo = String(1000 + styleIndex * 7);
    const colorName = pick(COLORS[family]);
    const c = CATEGORY[category];
    const label = kind ?? c.label;
    const product: SeedProduct = {
      handle: slug(`${name} ${department === "mens" ? "mens " : ""}${label} ${colorName}`),
      title: `${name} ${department === "mens" ? "Men's " : ""}${label} - ${colorName}`,
      styleNo,
      category,
      role: roleOf(label)!,
      department,
      colorName,
      colorFamily: family,
      fixtureType: c.fixture,
      price: c.price,
      skus: Object.fromEntries(SIZES.map((s) => [s, `FS-${styleNo}-${slug(colorName).toUpperCase().slice(0, 4)}-${s}`])) as Record<Size, string>,
    };
    products.push(product);
    return product;
  };
  const addExtras = (bench: boolean) =>
    EXTRA_STYLES.forEach((x, k) => {
      if (Boolean(x.bench) === bench) for (const f of x.families) addProduct(x.name, STYLE_NAMES.length + k, x.department, x.category, x.kind, f);
    });
  STYLE_NAMES.forEach((name, i) => {
    const department: Department = i < 38 ? "womens" : "mens";
    const [category, kind] = department === "womens" ? womensCats[i % womensCats.length] : mensCats[i % mensCats.length];
    // Men's colorways lean on their zone's palette so the department has candidates.
    const familyPool = department === "mens" ? (["black", "navy", "grey", "green", "brown", "white"] as ColorFamily[]) : FAMILIES;
    for (const family of shuffle([...familyPool]).slice(0, 3)) addProduct(name, i, department, category, kind, family);
  });

  addExtras(false);

  // --- Layout: per zone 2 rails (5 slots) + 2 tables (3 slots) ---
  const fixtures: SeedFixture[] = ZONES.flatMap((z) => [
    { name: `${z.name} Rail 1`, zone: z.name, type: "rail" as const, slotCount: 5 },
    { name: `${z.name} Rail 2`, zone: z.name, type: "rail" as const, slotCount: 5 },
    { name: `${z.name} Table 1`, zone: z.name, type: "table" as const, slotCount: 3 },
    { name: `${z.name} Table 2`, zone: z.name, type: "table" as const, slotCount: 3 },
  ]);

  const cadenceRules: SeedCadence[] = [];
  for (const [cat, info] of Object.entries(CATEGORY) as [Category, (typeof CATEGORY)[Category]][]) {
    for (const ft of ["rail", "table"] as FixtureType[]) {
      if (!fits(info.fixture, ft)) continue;
      const base = cat === "outerwear" ? OUTERWEAR_CADENCE : ft === "rail" ? RAIL_CADENCE : TABLE_CADENCE;
      cadenceRules.push({ fixtureType: ft, category: cat, sizeCounts: { ...base } });
    }
  }
  const cadenceFor = (ft: FixtureType, cat: Category) =>
    cadenceRules.find((c) => c.fixtureType === ft && c.category === cat)!.sizeCounts;

  // --- Placements: greedy, obeying department, palette, fixture type, adjacency and the outfit sequence ---
  const SAME_COLOR_RAIL = "Zone 1 Rail 2"; // planted violation: two same-family neighbors
  const placed = new Set<string>();
  const placements: SeedPlacement[] = [];
  const placedOn = new Map<string, FixtureType>(); // handle -> fixture type it sits on
  for (const f of fixtures) {
    const zone = ZONES.find((z) => z.name === f.zone)!;
    const roles = slotRoles(f.type, zone.department, f.slotCount);
    const onFixture: SeedProduct[] = [];
    for (let slot = 0; slot < f.slotCount; slot++) {
      const prev = onFixture.at(-1);
      const plantDup = f.name === SAME_COLOR_RAIL && onFixture.length === 2 && prev;
      const candidates = shuffle(
        products.filter(
          (p) =>
            !placed.has(p.handle) &&
            p.department === zone.department &&
            zone.palette.includes(p.colorFamily) &&
            fits(p.fixtureType, f.type) &&
            roles[slot].includes(p.role) &&
            !(f.type === "table" && p.category === "outerwear") &&
            (plantDup ? p.colorFamily === prev.colorFamily : !prev || p.colorFamily !== prev.colorFamily),
        ),
      );
      const p = candidates[0];
      if (!p) continue; // an empty slot is a valid "needs filling" state
      placed.add(p.handle);
      placedOn.set(p.handle, f.type);
      onFixture.push(p);
      placements.push({ fixture: f.name, slot, handle: p.handle });
    }
  }

  // Bench styles join the catalog after the layout, so none of them start on the floor.
  addExtras(true);
  const bench = new Set(products.filter((p) => EXTRA_STYLES.some((x) => x.bench && p.title.startsWith(`${x.name} `))).map((p) => p.handle));

  // --- Stock: RFID units per variant ---
  let epcCounter = 0;
  const nextEpc = () => "3034" + (++epcCounter).toString(16).toUpperCase().padStart(20, "0");
  const units: SeedUnit[] = [];
  const addUnits = (sku: string, n: number, area: SeedUnit["area"], status: SeedUnit["status"] = "in_stock") => {
    for (let i = 0; i < n; i++) units.push({ epc: nextEpc(), sku, area, status });
  };

  // Planted: 8 placed products whose back stock ran out in 1-2 sizes -> swap-outs, at fixed slots. Zone 1 Rail 1
  // slot 2 is the deliberate dead end: no unplaced bottom in Zone 1's palette fits between its neighbors.
  const brokenRuns = BROKEN_RUN_SLOTS.map(([fixture, slot]) => placements.find((p) => p.fixture === fixture && p.slot === slot)!.handle);
  for (const p of products) {
    const ft = placedOn.get(p.handle);
    for (const size of SIZES) {
      const sku = p.skus[size];
      if (ft) {
        const cadence = cadenceFor(ft, p.category)[size];
        const broken = brokenRuns.includes(p.handle) && (size === "S" || (size === "M" && r() < 0.5));
        addUnits(sku, broken ? Math.max(0, cadence - 2) : cadence, "floor");
        addUnits(sku, broken ? 0 : Math.round(cadence * (1.5 + r() * 2.5)), "back");
      } else if (bench.has(p.handle)) {
        // Bench styles: full size run with at least 2x the deepest cadence in back.
        addUnits(sku, Math.round(RAIL_CADENCE[size] * (2 + r())), "back");
      } else {
        // Unplaced styles are the bench a swap draws from: mostly deep back stock, some with natural size gaps.
        const n = r() < 0.08 ? 0 : Math.round(SIZE_CURVE[size] * (4 + r() * 10));
        addUnits(sku, n, "back");
      }
    }
  }
  // A few damaged units in the back.
  for (let i = 0; i < 12; i++) addUnits(pick(products).skus[pick(SIZES)], 1, "back", "damaged");

  // --- Sales: 8 weeks of daily units, size curve x style popularity ---
  const sales: SeedSale[] = [];
  const end = new Date(`${SEED_DATE}T00:00:00Z`);
  for (const p of products) {
    const popularity = 0.15 + r() * r() * 1.4;
    for (const size of SIZES) {
      const lambda = popularity * SIZE_CURVE[size] * 0.35;
      for (let d = SALES_DAYS; d >= 1; d--) {
        // Poisson draw (Knuth); lambda is small
        let k = 0;
        for (let prod = r(), L = Math.exp(-lambda); prod > L; prod *= r()) k++;
        if (!k) continue;
        const date = new Date(end.getTime() - d * 86_400_000).toISOString().slice(0, 10);
        sales.push({ sku: p.skus[size], date, units: k });
        if (d <= SOLD_UNIT_DAYS) addUnits(p.skus[size], k, "floor", "sold");
      }
    }
  }

  const data: SeedData = {
    products,
    zones: ZONES,
    fixtures,
    cadenceRules,
    placements,
    units,
    sales,
    planted: { brokenRuns, sameColorRail: SAME_COLOR_RAIL },
  };
  selfCheck(data);
  return data;
}

function selfCheck(d: SeedData) {
  const assert = (ok: unknown, msg: string) => {
    if (!ok) throw new Error(`seed self-check failed: ${msg}`);
  };
  assert(d.products.length === 150 + EXTRA_STYLES.reduce((n, x) => n + x.families.length, 0), "150 products plus the extra styles");
  assert(d.placements.length === d.fixtures.reduce((n, f) => n + f.slotCount, 0), `every slot filled (${d.placements.length})`);
  assert(new Set(d.products.map((p) => p.handle)).size === d.products.length, "unique handles");
  const skus = d.products.flatMap((p) => Object.values(p.skus));
  assert(new Set(skus).size === skus.length, "unique SKUs");
  assert(new Set(d.units.map((u) => u.epc)).size === d.units.length, "unique EPCs");
  assert(d.planted.brokenRuns.every(Boolean) && d.planted.brokenRuns.length === 8, "8 planted broken runs");
  for (const pl of d.placements) {
    const f = d.fixtures.find((x) => x.name === pl.fixture)!;
    const z = d.zones.find((x) => x.name === f.zone)!;
    const p = d.products.find((x) => x.handle === pl.handle)!;
    assert(p.department === z.department, `${p.handle} department fits ${z.name}`);
    assert(z.palette.includes(p.colorFamily), `${p.handle} in ${z.name} palette`);
    assert(fits(p.fixtureType, f.type), `${p.handle} fits ${f.type}`);
    assert(slotRoles(f.type, z.department, f.slotCount)[pl.slot].includes(p.role), `${p.handle} has the role ${f.name} slot ${pl.slot + 1} needs`);
    assert(!(f.type === "table" && p.category === "outerwear"), `no outerwear on ${f.name}`);
  }
  const dup = d.placements.filter((p) => p.fixture === d.planted.sameColorRail).sort((a, b) => a.slot - b.slot);
  const fam = (h: string) => d.products.find((p) => p.handle === h)!.colorFamily;
  assert(dup.length >= 3 && fam(dup[1].handle) === fam(dup[2].handle), "planted same-color neighbors");
}
