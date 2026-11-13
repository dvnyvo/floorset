import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { invalidateCatalog } from "../lib/shopify/catalog.server";
import { handleOnce } from "../lib/webhooks.server";

// inventory_levels/update, products/update, products/delete: stock or the catalog changed in Shopify,
// so the next page load reads it fresh.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, webhookId } = await authenticate.webhook(request);
  invalidateCatalog();
  await handleOnce(webhookId, topic);
  return new Response();
};
