// Reads the catalog and per-location inventory from Shopify (the source of truth for counts).
import { roleOf } from "../engine/roles";
import type { ColorFamily, FixtureType, Role } from "../engine/types";

/** The slice of the Admin API client we use; matches `admin` from authenticate.admin(). */
export interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface CatalogVariant {
  variantId: string;
  inventoryItemId: string;
  sku: string;
  size: string;
  productId: string;
  productTitle: string;
  category: string;
  role: Role;
  colorFamily: ColorFamily;
  fixtureType: FixtureType | "both";
  department: string;
  available: number;
  damaged: number;
  onHand: number;
}

export const CATALOG_QUERY = `#graphql
  query FloorsetCatalog($cursor: String, $locationId: ID!) {
    products(first: 25, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        category: metafield(namespace: "$app", key: "category") { value }
        role: metafield(namespace: "$app", key: "role") { value }
        colorFamily: metafield(namespace: "$app", key: "color_family") { value }
        fixtureType: metafield(namespace: "$app", key: "fixture_type") { value }
        department: metafield(namespace: "$app", key: "department") { value }
        variants(first: 20) {
          nodes {
            id
            sku
            title
            inventoryItem {
              id
              inventoryLevel(locationId: $locationId) {
                quantities(names: ["available", "damaged", "on_hand"]) { name quantity }
              }
            }
          }
        }
      }
    }
  }`;

export async function gql<T>(admin: AdminClient, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await admin.graphql(query, { variables });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

// shortcut: single-location store (first location); add a location picker for multi-location retailers.
export async function primaryLocationId(admin: AdminClient): Promise<string> {
  const d = await gql<{ locations: { nodes: { id: string }[] } }>(admin, `#graphql
    query FloorsetLocation { locations(first: 1) { nodes { id } } }`);
  return d.locations.nodes[0].id;
}

type ProductNode = {
  id: string;
  title: string;
  category: { value: string } | null;
  role: { value: string } | null;
  colorFamily: { value: string } | null;
  fixtureType: { value: string } | null;
  department: { value: string } | null;
  variants: {
    nodes: {
      id: string;
      sku: string | null;
      title: string;
      inventoryItem: {
        id: string;
        inventoryLevel: { quantities: { name: string; quantity: number }[] } | null;
      };
    }[];
  };
};

/** Every variant of every product Floorset knows (has a category metafield), with quantities. */
// Cached, because a full read is ~6 Admin API calls. Product and inventory webhooks drop the cache,
// as do Floorset's own writes; the time limit only covers a missed webhook.
// shortcut: in-memory and single-store; use a shared cache keyed by shop if the app runs on several instances.
type Catalog = { locationId: string; variants: CatalogVariant[] };
const CACHE_MS = 5 * 60_000;
let cached: { at: number; data: Promise<Catalog> } | null = null;

export function invalidateCatalog() {
  cached = null;
}

export function fetchCatalog(admin: AdminClient): Promise<Catalog> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const data = readCatalog(admin);
  cached = { at: Date.now(), data };
  data.catch(() => cached?.data === data && invalidateCatalog()); // never cache a failed read
  return data;
}

async function readCatalog(admin: AdminClient): Promise<Catalog> {
  const locationId = await primaryLocationId(admin);
  const variants: CatalogVariant[] = [];
  let cursor: string | null = null;
  do {
    const d: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductNode[] } } =
      await gql(admin, CATALOG_QUERY, { cursor, locationId });
    for (const p of d.products.nodes) {
      if (!p.category?.value) continue;
      for (const v of p.variants.nodes) {
        const q = Object.fromEntries((v.inventoryItem.inventoryLevel?.quantities ?? []).map((x) => [x.name, x.quantity]));
        variants.push({
          variantId: v.id,
          inventoryItemId: v.inventoryItem.id,
          sku: v.sku ?? "",
          size: v.title,
          productId: p.id,
          productTitle: p.title,
          category: p.category.value,
          // Older products have no role metafield: derive it from the category.
          role: (p.role?.value ?? roleOf(p.category.value) ?? "top") as Role,
          colorFamily: (p.colorFamily?.value ?? "grey") as ColorFamily,
          fixtureType: (p.fixtureType?.value ?? "both") as FixtureType | "both",
          department: p.department?.value ?? "womens",
          available: q.available ?? 0,
          damaged: q.damaged ?? 0,
          onHand: q.on_hand ?? 0,
        });
      }
    }
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cursor);
  return { locationId, variants };
}
