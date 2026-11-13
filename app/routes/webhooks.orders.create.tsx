import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { salesFromOrder, type OrderPayload } from "../lib/sales";
import { handleOnce } from "../lib/webhooks.server";

// Adds each new order to the daily sales rollup that drives sales velocity in the rules engine.
// shortcut: counts units ordered; subtract refunds and cancellations (refunds/create, orders/cancelled) for net sales.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, webhookId, payload } = await authenticate.webhook(request);
  const lines = salesFromOrder(payload as OrderPayload);
  // Only variants Floorset tracks (ones with tagged units).
  const known = await db.unit.findMany({
    where: { variantId: { in: lines.map((l) => l.variantId) } },
    select: { variantId: true },
    distinct: ["variantId"],
  });
  const tracked = new Set(known.map((u) => u.variantId));
  await handleOnce(
    webhookId,
    topic,
    lines
      .filter((l) => tracked.has(l.variantId))
      .map(({ variantId, date, units }) =>
        db.salesDaily.upsert({
          where: { variantId_date: { variantId, date } },
          create: { variantId, date, units },
          update: { units: { increment: units } },
        }),
      ),
  );
  return new Response();
};
