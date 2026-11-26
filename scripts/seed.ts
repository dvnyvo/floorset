// Seeds the dev store (products, size variants, metafields, inventory) and
// Floorset's own database (layout, cadences, RFID units, sales).
// Usage: npm run seed -- <store>.myshopify.com
// Talks to Shopify through the Shopify CLI, so it uses the app's own credentials.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { generate, SIZES, type SeedProduct } from "./seed-data.ts";
import { AREAS, fixtureRect, ZONE_RECTS } from "./floor-plan.ts";

const store = process.argv[2] ?? process.env.SHOPIFY_STORE;
if (!store?.endsWith(".myshopify.com")) {
  console.error("usage: npm run seed -- <store>.myshopify.com");
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "floorset-seed-"));
let fileNo = 0;
const tmp = (name: string, body: string) => {
  const p = join(dir, `${fileNo++}-${name}`);
  writeFileSync(p, body);
  return p;
};

function cli(args: string[]) {
  const all = [...args, "--store", store!, "--no-input", "--no-color"];
  // On Windows the CLI is a .cmd shim, which needs a shell; quote every arg.
  const win = process.platform === "win32";
  execFileSync("shopify", win ? all.map((a) => JSON.stringify(a)) : all, {
    stdio: ["ignore", "ignore", "inherit"],
    shell: win,
  });
}

function execute<T>(query: string, variables: object = {}): T {
  const out = join(dir, `${fileNo++}-out.json`);
  cli(["app", "execute", "--query-file", tmp("q.graphql", query), "--variable-file", tmp("v.json", JSON.stringify(variables)), "--output-file", out]);
  try {
    return JSON.parse(readFileSync(out, "utf8")) as T;
  } catch {
    throw new Error("Shopify call failed, see the CLI output above");
  }
}

const PRODUCT_SET = /* GraphQL */ `
  mutation seedProduct($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
    productSet(identifier: $identifier, input: $input, synchronous: true) {
      product { id handle variants(first: 10) { nodes { id sku inventoryItem { id } } } }
      userErrors { field message }
    }
  }`;

function productInput(p: SeedProduct, locationId: string, qty: Map<string, number>) {
  const meta = (key: string, value: string) => ({ namespace: "$app", key, type: "single_line_text_field", value });
  return {
    identifier: { handle: p.handle },
    input: {
      handle: p.handle,
      title: p.title,
      vendor: "Floorset Demo",
      productType: p.category,
      status: "ACTIVE",
      tags: ["floorset-seed", `style-${p.styleNo}`],
      metafields: [
        meta("color_family", p.colorFamily),
        meta("category", p.category),
        meta("role", p.role),
        meta("fixture_type", p.fixtureType),
        meta("department", p.department),
      ],
      productOptions: [{ name: "Size", values: SIZES.map((name) => ({ name })) }],
      variants: SIZES.map((size) => ({
        optionValues: [{ optionName: "Size", name: size }],
        sku: p.skus[size],
        price: p.price,
        inventoryItem: { tracked: true },
        inventoryQuantities: [{ locationId, name: "available", quantity: qty.get(p.skus[size]) ?? 0 }],
      })),
    },
  };
}

async function main() {
  const data = generate();
  const t0 = Date.now();

  // 1. Location
  const { locations } = execute<{ locations: { nodes: { id: string; name: string }[] } }>(
    `{ locations(first: 1) { nodes { id name } } }`,
  );
  const locationId = locations.nodes[0].id;
  console.log(`location: ${locations.nodes[0].name}`);

  // 2. Start clean: delete products from a previous seed so quantities (and the damaged move) start from zero.
  const old = execute<{ products: { nodes: { id: string }[] } }>(
    `{ products(first: 250, query: "tag:floorset-seed") { nodes { id } } }`,
  ).products.nodes;
  if (old.length) {
    console.log(`deleting ${old.length} previously seeded products...`);
    const del = /* GraphQL */ `mutation del($input: ProductDeleteInput!) { productDelete(input: $input) { userErrors { message } } }`;
    const rows = old.map((p) => JSON.stringify({ input: { id: p.id } })).join("\n");
    cli(["app", "bulk", "execute", "--query-file", tmp("del.graphql", del), "--variable-file", tmp("del.jsonl", rows), "--watch", "--output-file", join(dir, "del-out.jsonl")]);
  }

  // 3. Products via one bulk productSet. Shopify "available" = sellable + damaged for now;
  //    damaged units are moved to the damaged state in step 3.
  const qty = new Map<string, number>();
  for (const u of data.units) if (u.status !== "sold") qty.set(u.sku, (qty.get(u.sku) ?? 0) + 1);
  const vars = data.products.map((p) => JSON.stringify(productInput(p, locationId, qty))).join("\n");
  const out = join(dir, "bulk-out.jsonl");
  console.log(`bulk productSet: ${data.products.length} products...`);
  cli(["app", "bulk", "execute", "--query-file", tmp("set.graphql", PRODUCT_SET), "--variable-file", tmp("vars.jsonl", vars), "--watch", "--output-file", out]);

  const productId = new Map<string, string>();
  const variant = new Map<string, { id: string; inventoryItemId: string }>();
  const errors: string[] = [];
  for (const line of readFileSync(out, "utf8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    const res = row.data?.productSet;
    if (!res?.product) {
      errors.push(JSON.stringify(res?.userErrors ?? row.errors ?? row));
      continue;
    }
    productId.set(res.product.handle, res.product.id);
    for (const v of res.product.variants.nodes) variant.set(v.sku, { id: v.id, inventoryItemId: v.inventoryItem.id });
  }
  if (errors.length) throw new Error(`productSet failed for ${errors.length} rows:\n${errors.slice(0, 5).join("\n")}`);
  if (productId.size !== data.products.length) throw new Error(`expected ${data.products.length} products, got ${productId.size}`);
  console.log(`products in Shopify: ${productId.size}, variants: ${variant.size}`);

  // 4. Damaged units -> Shopify's damaged inventory state.
  // Compare-and-swap: expects available = seeded qty and damaged = 0, so a half-finished run fails loudly instead of double counting.
  const damaged = new Map<string, number>();
  for (const u of data.units) if (u.status === "damaged") damaged.set(u.sku, (damaged.get(u.sku) ?? 0) + 1);
  const move = execute<{ inventoryMoveQuantities: { userErrors: { message: string }[] } }>(
    `mutation move($input: InventoryMoveQuantitiesInput!, $key: String!) {
       inventoryMoveQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
     }`,
    {
      key: randomUUID(),
      input: {
        reason: "damaged",
        referenceDocumentUri: "floorset://seed/damaged",
        changes: [...damaged].map(([sku, quantity]) => ({
          inventoryItemId: variant.get(sku)!.inventoryItemId,
          quantity,
          from: { locationId, name: "available", changeFromQuantity: qty.get(sku) },
          to: { locationId, name: "damaged", changeFromQuantity: 0, ledgerDocumentUri: "floorset://seed/damaged" },
        })),
      },
    },
  );
  if (move.inventoryMoveQuantities.userErrors.length) throw new Error(JSON.stringify(move.inventoryMoveQuantities.userErrors));
  console.log(`damaged units moved: ${data.units.filter((u) => u.status === "damaged").length}`);

  // 5. Floorset database: replace all Floorset rows (sessions untouched).
  const db = new PrismaClient();
  try {
    await db.$transaction([
      db.auditLog.deleteMany(),
      db.proposal.deleteMany(),
      db.ghostSuspect.deleteMany(),
      db.tagRead.deleteMany(),
      db.scan.deleteMany(),
      db.unit.deleteMany(),
      db.salesDaily.deleteMany(),
      db.placement.deleteMany(),
      db.fixture.deleteMany(),
      db.zone.deleteMany(),
      db.floorArea.deleteMany(),
      db.cadenceRule.deleteMany(),
    ]);
    for (const z of data.zones) {
      await db.zone.create({
        data: {
          name: z.name,
          department: z.department,
          palette: z.palette,
          ...ZONE_RECTS[z.name],
          fixtures: {
            create: data.fixtures
              .filter((f) => f.zone === z.name)
              .map(({ name, type, slotCount }) => ({ name, type, slotCount, ...fixtureRect(z.name, name) })),
          },
        },
      });
    }
    await db.floorArea.createMany({ data: AREAS });
    const fixtureId = new Map((await db.fixture.findMany()).map((f) => [f.name, f.id]));
    await db.cadenceRule.createMany({ data: data.cadenceRules });
    await db.placement.createMany({
      data: data.placements.map((pl) => ({
        fixtureId: fixtureId.get(pl.fixture)!,
        slot: pl.slot,
        productId: productId.get(pl.handle)!,
        colorFamily: data.products.find((p) => p.handle === pl.handle)!.colorFamily,
      })),
    });
    await db.unit.createMany({
      data: data.units.map((u) => ({ epc: u.epc, variantId: variant.get(u.sku)!.id, area: u.area, status: u.status })),
    });
    // Sales history is a synthetic rollup, not real orders (dev stores rate-limit order creation). New orders are added by the orders/create webhook.
    await db.salesDaily.createMany({
      data: data.sales.map((s) => ({ variantId: variant.get(s.sku)!.id, date: new Date(`${s.date}T00:00:00Z`), units: s.units })),
    });
    const counts = {
      zones: await db.zone.count(),
      fixtures: await db.fixture.count(),
      placements: await db.placement.count(),
      units: await db.unit.count(),
      salesRows: await db.salesDaily.count(),
    };
    console.log("database:", counts);
  } finally {
    await db.$disconnect();
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
