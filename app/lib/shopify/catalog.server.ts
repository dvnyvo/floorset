// Reads the catalog and per-location inventory from Shopify (the source of truth for counts).
import type { ColorFamily, FixtureType } from "../engine/types";

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
// shortcut: re-fetches the catalog per page load (~6 calls); cache or sync via webhooks at scale.
export async function fetchCatalog(admin: AdminClient): Promise<{ locationId: string; variants: CatalogVariant[] }> {
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
