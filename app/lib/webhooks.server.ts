import type { Prisma } from "@prisma/client";
import db from "../db.server";

/**
 * Records a webhook delivery together with the writes it causes, in one transaction.
 * Returns false if this delivery was already handled (Shopify retries and can deliver twice).
 */
export async function handleOnce(webhookId: string, topic: string, ops: Prisma.PrismaPromise<unknown>[] = []) {
  try {
    await db.$transaction([db.webhookEvent.create({ data: { id: webhookId, topic } }), ...ops]);
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}
