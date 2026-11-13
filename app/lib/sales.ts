// Turns an orders/create webhook payload into per-variant daily sales. Pure, so it can be tested.

export interface OrderPayload {
  created_at?: string;
  line_items?: { variant_id?: number | null; quantity?: number }[];
}

export function salesFromOrder(order: OrderPayload): { variantId: string; date: Date; units: number }[] {
  const day = new Date(`${(order.created_at ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return [];
  const units = new Map<string, number>();
  for (const li of order.line_items ?? []) {
    // Custom line items have no variant; a webhook payload is outside data, so check the numbers too.
    const qty = li.quantity ?? 0;
    if (!li.variant_id || !Number.isInteger(qty) || qty <= 0) continue;
    const id = `gid://shopify/ProductVariant/${li.variant_id}`;
    units.set(id, (units.get(id) ?? 0) + qty);
  }
  return [...units].map(([variantId, n]) => ({ variantId, date: day, units: n }));
}
