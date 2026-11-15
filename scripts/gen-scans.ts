// Generates synthetic RFID scan CSVs (epc,area,read_at) from the seed data:
// 8 weekly full counts and 4 morning floor scans, with planted shrink and loose tags,
// plus one deliberately messy reader export for exercising the parser.
// Usage: npm run gen-scans   -> writes scans/*.csv, scans/messy/reader_export.csv and scans/truth.json

import { mkdirSync, writeFileSync } from "node:fs";
import { generate, rng, type SeedUnit } from "./seed-data.ts";

export const FITTING_ROOM = "Fitting Room";
export const ENTRANCE_CORNER = "Entrance Corner";
export const STOCKROOM = "Stockroom";

// Earlier history: bra theft builds up week by week, before any loose tags appear.
const EARLIER_COUNTS = ["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];
const FULL_COUNTS = ["2026-11-01", "2026-11-08", "2026-11-15"];
const FLOOR_SCANS = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
const READ_RATE = 0.965; // chance a present, tagged unit is read
const LOOSE_SHARE = 0.04; // share of stock stolen with the tag cut off and left in the store
export const DUMP_AREAS = [FITTING_ROOM, ENTRANCE_CORNER, "Cash Wrap", "Back Corridor"]; // where cut tags get dropped

type Scan = { date: string; type: "full_count" | "floor" };
const SCANS: Scan[] = [
  ...FULL_COUNTS.map((date) => ({ date, type: "full_count" as const })),
  ...FLOOR_SCANS.map((date) => ({ date, type: "floor" as const })),
].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

export function generateScans(seed = 7) {
  const data = generate();
  const r = rng(seed);
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Where each SKU's floor units live (the zone of its placement).
  const skuZone = new Map<string, string>();
  for (const pl of data.placements) {
    const zone = data.fixtures.find((f) => f.name === pl.fixture)!.zone;
    const p = data.products.find((x) => x.handle === pl.handle)!;
    for (const sku of Object.values(p.skus)) skuZone.set(sku, zone);
  }
  const category = new Map(data.products.flatMap((p) => Object.values(p.skus).map((s) => [s, p.category] as const)));
  const homeArea = (u: SeedUnit) => (u.area === "floor" ? (skuZone.get(u.sku) ?? STOCKROOM) : STOCKROOM);

  const inStock = data.units.filter((u) => u.status !== "sold");
  const sold = data.units.filter((u) => u.status === "sold");

  // Planted shrink 1: ~5% of bra units stolen before the first count, tags gone with them.
  // The same SKUs come up short week after week and bras fall below the 95% read rate.
  const stolenSilent = new Set<string>();
  const bras = inStock.filter((u) => category.get(u.sku) === "bra");
  for (const u of shuffle([...bras]).slice(0, Math.round(bras.length * 0.05))) stolenSilent.add(u.epc);

  // Planted shrink 2: loose tags. Legging units stolen with the tag cut off and left behind,
  // so the tag keeps reading and hides the loss (raw read rate looks healthy).
  const leggings = shuffle(inStock.filter((u) => category.get(u.sku) === "legging" && u.area === "floor"));
  const ghosts: { epc: string; area: string; fromScan: number; kind: string }[] = [];
  // One tag stationary in the fitting room for the 4 floor scans (its style is placed elsewhere).
  const firstFloor = SCANS.findIndex((s) => s.type === "floor");
  ghosts.push({ epc: leggings[0].epc, area: FITTING_ROOM, fromScan: firstFloor, kind: "stationary_fitting_room" });
  // A cluster of 6 tags dumped in one corner of the floor.
  for (const u of leggings.slice(1, 7)) ghosts.push({ epc: u.epc, area: ENTRANCE_CORNER, fromScan: 1, kind: "corner_cluster" });
  // More loose legging tags, some in the fitting room, some dropped near their own fixture (hard to catch).
  for (const [i, u] of leggings.slice(7, 40).entries()) {
    ghosts.push({ epc: u.epc, area: i % 3 === 0 ? FITTING_ROOM : homeArea(u), fromScan: i % 3, kind: "loose_tag" });
  }
  // Planted shrink 3: theft from back stock, building up scan by scan. The cut tags are dumped away from
  // the stock, so they keep reading. This is what opens the gap between the raw and adjusted read rate.
  const taken = new Set(ghosts.map((g) => g.epc));
  const backStock = shuffle(inStock.filter((u) => u.area === "back" && u.status === "in_stock" && !stolenSilent.has(u.epc) && !taken.has(u.epc)));
  for (const [i, u] of backStock.slice(0, Math.round(inStock.length * LOOSE_SHARE) - ghosts.length).entries()) {
    ghosts.push({ epc: u.epc, area: DUMP_AREAS[i % DUMP_AREAS.length], fromScan: i % SCANS.length, kind: "back_stock_theft" });
  }
  // Sold items whose tags are still in the store.
  for (const [i, u] of shuffle([...sold]).slice(0, 8).entries()) {
    ghosts.push({ epc: u.epc, area: i % 2 ? FITTING_ROOM : (skuZone.get(u.sku) ?? FITTING_ROOM), fromScan: 0, kind: "sold_but_read" });
  }
  const ghostBy = new Map(ghosts.map((g) => [g.epc, g]));

  const files: { name: string; type: Scan["type"]; date: string; csv: string }[] = [];
  SCANS.forEach((scan, i) => {
    const rows: string[] = ["epc,area,read_at"];
    const t0 = new Date(`${scan.date}T${scan.type === "floor" ? "08:30" : "07:00"}:00Z`).getTime();
    let n = 0;
    const read = (epc: string, area: string) =>
      rows.push(`${epc},${area},${new Date(t0 + n++ * 150).toISOString()}`);
    for (const u of inStock) {
      if (stolenSilent.has(u.epc)) continue;
      const g = ghostBy.get(u.epc);
      if (g && i >= g.fromScan) {
        // Item is gone; only the loose tag is left. Floor scans skip the stockroom.
        if (scan.type === "full_count" || g.area !== STOCKROOM) read(u.epc, g.area);
        continue;
      }
      if (scan.type === "floor" && u.area !== "floor") continue;
      if (r() < READ_RATE) read(u.epc, homeArea(u));
    }
    for (const g of ghosts) {
      if (g.kind === "sold_but_read" && i >= g.fromScan) read(g.epc, g.area);
    }
    files.push({ name: `${scan.date}_${scan.type}.csv`, type: scan.type, date: scan.date, csv: rows.join("\n") + "\n" });
  });

  // Earlier counts use their own random stream so the scans above stay byte-for-byte stable.
  const r2 = rng(seed + 1000);
  const stolenOrder = [...stolenSilent];
  const earlier = EARLIER_COUNTS.map((date, k) => {
    const gone = new Set(stolenOrder.slice(0, Math.ceil((stolenOrder.length * (k + 1)) / (EARLIER_COUNTS.length + 1))));
    const t0 = new Date(`${date}T07:00:00Z`).getTime();
    const rows = ["epc,area,read_at"];
    for (const u of inStock) {
      if (!gone.has(u.epc) && r2() < READ_RATE) rows.push(`${u.epc},${homeArea(u)},${new Date(t0 + rows.length * 150).toISOString()}`);
    }
    return { name: `${date}_full_count.csv`, type: "full_count" as const, date, csv: rows.join("\n") + "\n" };
  });
  files.unshift(...earlier);

  return { files, truth: { stolenSilent: [...stolenSilent], ghosts }, messy: messyExport(files[files.length - 1].csv) };
}

/** A reader export with everything that goes wrong in real files, and the counts a parser should report. */
function messyExport(cleanCsv: string) {
  const rows = cleanCsv.trim().split("\n").slice(1).map((l) => l.split(","));
  const good = rows.slice(0, 300);
  const out = [" read_at , EPC ,Area,rssi"]; // reordered columns, stray spaces and capitals, an extra column
  const line = (epc: string, area: string, at: string, i: number) => out.push(`${at}, ${epc} ,${area},-${50 + (i % 30)}`);
  good.forEach(([epc, area, at], i) => {
    line(epc, area, at, i);
    if (i % 8 === 0) line(epc.toLowerCase(), area, at, i); // the wand read it twice
    if (i % 50 === 0) out.push(""); // blank lines
  });
  const badEpcs = ["30340000ZZ", "", "303400000000000000000", "NOT-A-TAG"];
  badEpcs.forEach((e, i) => line(e, "Zone 1", good[0][2], i));
  const badTimes = ["yesterday", "32/13/2026", "--"];
  badTimes.forEach((t, i) => line(rows[300 + i][0], "Zone 1", t, i));
  const unknown = 12; // valid tags that aren't in the unit list (another retailer's, or untagged-in-system stock)
  for (let i = 0; i < unknown; i++) line(`E2801170${i.toString(16).toUpperCase().padStart(16, "0")}`, "Zone 2", good[0][2], i);
  return {
    csv: out.join("\r\n") + "\r\n",
    expect: { reads: good.length + unknown, duplicates: Math.ceil(good.length / 8), badRows: badEpcs.length + badTimes.length, unknown },
  };
}

if (import.meta.main) {
  const { files, truth, messy } = generateScans();
  mkdirSync("scans/messy", { recursive: true });
  writeFileSync("scans/messy/reader_export.csv", messy.csv);
  for (const f of files) writeFileSync(`scans/${f.name}`, f.csv);
  writeFileSync("scans/truth.json", JSON.stringify(truth, null, 2));
  for (const f of files) console.log(`scans/${f.name}: ${f.csv.split("\n").length - 2} reads`);
  console.log(`scans/messy/reader_export.csv: expect ${JSON.stringify(messy.expect)}`);
  console.log(`planted: ${truth.stolenSilent.length} silent thefts, ${truth.ghosts.length} loose tags`);
}
