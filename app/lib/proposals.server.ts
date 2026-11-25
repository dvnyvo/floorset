// Every write goes propose -> approve -> apply -> audit log -> undo. Nothing touches Shopify or the
// layout until a person approves it, and every applied change can be reversed from its audit row.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { gql, invalidateCatalog, primaryLocationId, type AdminClient } from "./shopify/catalog.server";

export interface SwapPayload {
  fixtureId: string;
  slot: number;
  productId: string; // the replacement
}
interface Side {
  productId: string;
  title: string;
  colorFamily: string;
}
export interface SwapDiff {
  fixture: string;
  slot: number;
  out: Side;
  in: Side;
}
/** Shopify state a swap changes: the $app.placement metafield per product (null = not set). */
type PlacementValues = Record<string, string | null>;
interface SwapSnapshot {
  placement: { productId: string; colorFamily: string };
  metafields: PlacementValues;
}

export class ProposalError extends Error {}

/** Stages a fixture swap. Re-proposing the same swap returns the open proposal instead of a duplicate. */
export async function proposeSwap(payload: SwapPayload, diff: SwapDiff) {
  const open = await db.proposal.findMany({ where: { kind: "fixture_swap", status: "pending" } });
  const same = open.find((p) => JSON.stringify(p.payload) === JSON.stringify(payload));
  if (same) return same;
  return db.proposal.create({
    data: { kind: "fixture_swap", payload: { ...payload }, diff: diff as unknown as Prisma.InputJsonObject, idempotencyKey: randomUUID() },
  });
}

export async function rejectProposal(id: string) {
  const { count } = await db.proposal.updateMany({ where: { id, status: "pending" }, data: { status: "rejected" } });
  if (!count) throw new ProposalError("Only pending proposals can be rejected");
}

type Proposal = Prisma.ProposalGetPayload<object>;
type Snapshot = Prisma.InputJsonObject;
/** Each kind checks its preconditions, writes Shopify, and returns the local writes to commit with the audit row. */
interface Handler {
  apply(admin: AdminClient, p: Proposal): Promise<{ before: Snapshot; after: Snapshot; ops: Prisma.PrismaPromise<unknown>[] }>;
  undo(admin: AdminClient, p: Proposal, before: Snapshot, after: Snapshot): Promise<Prisma.PrismaPromise<unknown>[]>;
}

/** Approve and apply in one step: preconditions, Shopify write, then local writes + audit row together. */
export async function approveAndApply(admin: AdminClient, id: string) {
  // Claim the proposal first so a double click can't apply it twice.
  const { count } = await db.proposal.updateMany({ where: { id, status: "pending" }, data: { status: "approved" } });
  if (!count) throw new ProposalError("This proposal was already handled");
  const p = await db.proposal.findUniqueOrThrow({ where: { id } });
  try {
    const { before, after, ops } = await handler(p.kind).apply(admin, p);
    invalidateCatalog(); // Shopify just changed; no need to wait for the webhook
    // shortcut: Shopify write then local transaction; a crash between them leaves Shopify ahead (re-apply heals it).
    await db.$transaction([
      ...ops,
      db.proposal.update({ where: { id }, data: { status: "applied" } }),
      db.auditLog.create({ data: { proposalId: id, before, after } }),
    ]);
  } catch (e) {
    await db.proposal.update({ where: { id }, data: { status: "pending" } });
    throw e;
  }
}

/** Reverses an applied change from its audit row, refusing if anything changed since. */
export async function undoProposal(admin: AdminClient, id: string) {
  const p = await db.proposal.findUnique({ where: { id }, include: { auditLogs: { where: { undoneAt: null } } } });
  const log = p?.auditLogs[0];
  if (p?.status !== "applied" || !log) throw new ProposalError("Only applied changes can be undone");
  const ops = await handler(p.kind).undo(admin, p, log.before as Snapshot, log.after as Snapshot);
  invalidateCatalog();
  await db.$transaction([
    ...ops,
    db.proposal.update({ where: { id }, data: { status: "undone" } }),
    db.auditLog.update({ where: { id: log.id }, data: { undoneAt: new Date() } }),
  ]);
}

export function listProposals({ kind, fixtureId }: { kind: string; fixtureId?: string }) {
  return db.proposal
    .findMany({ where: { kind }, orderBy: { createdAt: "desc" }, take: 100 })
    .then((ps) => ps.filter((p) => !fixtureId || (p.payload as unknown as SwapPayload).fixtureId === fixtureId));
}

function handler(kind: string): Handler {
  if (kind === "fixture_swap") return swapHandler;
  if (kind === "inventory_correction") return correctionHandler;
  throw new ProposalError(`Unknown proposal kind ${kind}`);
}

const swapHandler: Handler = {
  async apply(admin, p) {
    const payload = p.payload as unknown as SwapPayload;
    const diff = p.diff as unknown as SwapDiff;
    const pl = await db.placement.findUnique({
      where: { fixtureId_slot: { fixtureId: payload.fixtureId, slot: payload.slot } },
    });
    if (pl?.productId !== diff.out.productId) throw new ProposalError("The fixture changed since this was proposed");
    if (await db.placement.findFirst({ where: { productId: diff.in.productId } }))
      throw new ProposalError(`${diff.in.title} is already on the floor`);

    const label = `${diff.fixture} · slot ${diff.slot + 1}`;
    const before: SwapSnapshot = {
      placement: { productId: pl.productId, colorFamily: pl.colorFamily },
      metafields: await readPlacements(admin, [diff.out.productId, diff.in.productId]),
    };
    const after: SwapSnapshot = {
      placement: { productId: diff.in.productId, colorFamily: diff.in.colorFamily },
      metafields: { [diff.out.productId]: null, [diff.in.productId]: label },
    };
    await writePlacements(admin, after.metafields, before.metafields);
    return {
      before: before as unknown as Snapshot,
      after: after as unknown as Snapshot,
      ops: [db.placement.update({ where: { id: pl.id }, data: after.placement })],
    };
  },
  async undo(admin, p, b, a) {
    const payload = p.payload as unknown as SwapPayload;
    const before = b as unknown as SwapSnapshot;
    const after = a as unknown as SwapSnapshot;
    const pl = await db.placement.findUnique({
      where: { fixtureId_slot: { fixtureId: payload.fixtureId, slot: payload.slot } },
    });
    if (pl?.productId !== after.placement.productId) throw new ProposalError("The fixture changed after this swap");
    if (await db.placement.findFirst({ where: { productId: before.placement.productId } }))
      throw new ProposalError("The original item has since been placed elsewhere");
    await writePlacements(admin, before.metafields, after.metafields);
    return [db.placement.update({ where: { id: pl.id }, data: before.placement })];
  },
};

// --- Inventory corrections: a confirmed loose tag means the garment is gone, so Shopify is 1 too high ---

export interface CorrectionPayload {
  epc: string;
  variantId: string;
  inventoryItemId: string;
}
export interface CorrectionDiff {
  sku: string;
  title: string;
  epc: string;
  area: string | null;
  delta: number;
}
interface CorrectionSnapshot {
  available: number;
  unitStatus: string;
}

/** One correction per tag; re-proposing the same tag returns the existing open proposal. */
export async function proposeCorrection(payload: CorrectionPayload, diff: CorrectionDiff) {
  const open = await db.proposal.findMany({ where: { kind: "inventory_correction", status: "pending" } });
  const same = open.find((p) => (p.payload as unknown as CorrectionPayload).epc === payload.epc);
  if (same) return same;
  return db.proposal.create({
    data: { kind: "inventory_correction", payload: { ...payload }, diff: { ...diff }, idempotencyKey: randomUUID() },
  });
}

const correctionHandler: Handler = {
  async apply(admin, p) {
    const payload = p.payload as unknown as CorrectionPayload;
    const diff = p.diff as unknown as CorrectionDiff;
    const unit = await db.unit.findUnique({ where: { epc: payload.epc } });
    if (!unit) throw new ProposalError("That RFID tag is no longer in the system");
    if (unit.status === "missing") throw new ProposalError("This unit was already written off");
    const locationId = await primaryLocationId(admin);
    const available = await readAvailable(admin, payload.inventoryItemId, locationId);
    await adjustAvailable(admin, {
      inventoryItemId: payload.inventoryItemId,
      locationId,
      delta: diff.delta,
      from: available,
      key: p.idempotencyKey,
      reason: "shrinkage",
      ref: `floorset://loose-tag/${payload.epc}`,
    });
    const before: CorrectionSnapshot = { available, unitStatus: unit.status };
    const after: CorrectionSnapshot = { available: available + diff.delta, unitStatus: "missing" };
    return {
      before: { ...before },
      after: { ...after },
      ops: [db.unit.update({ where: { epc: payload.epc }, data: { status: "missing" } })],
    };
  },
  async undo(admin, p, b, a) {
    const payload = p.payload as unknown as CorrectionPayload;
    const before = b as unknown as CorrectionSnapshot;
    const after = a as unknown as CorrectionSnapshot;
    const locationId = await primaryLocationId(admin);
    // changeFromQuantity makes Shopify refuse the undo if the count moved since (a sale, a receipt).
    await adjustAvailable(admin, {
      inventoryItemId: payload.inventoryItemId,
      locationId,
      delta: before.available - after.available,
      from: after.available,
      key: `${p.idempotencyKey}-undo`,
      reason: "correction",
      ref: `floorset://loose-tag/${payload.epc}`,
    });
    return [db.unit.update({ where: { epc: payload.epc }, data: { status: before.unitStatus } })];
  },
};

async function readAvailable(admin: AdminClient, inventoryItemId: string, locationId: string) {
  const d = await gql<{ inventoryItem: { inventoryLevel: { quantities: { quantity: number }[] } | null } | null }>(
    admin,
    `#graphql
    query Available($id: ID!, $loc: ID!) {
      inventoryItem(id: $id) { inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { quantity } } }
    }`,
    { id: inventoryItemId, loc: locationId },
  );
  const q = d.inventoryItem?.inventoryLevel?.quantities[0]?.quantity;
  if (q === undefined) throw new ProposalError("Item isn't stocked at this location");
  return q;
}

async function adjustAvailable(
  admin: AdminClient,
  c: { inventoryItemId: string; locationId: string; delta: number; from: number; key: string; reason: string; ref: string },
) {
  const d = await gql<{ inventoryAdjustQuantities: { userErrors: { message: string }[] } }>(
    admin,
    `#graphql
    mutation Adjust($input: InventoryAdjustQuantitiesInput!, $key: String!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
    }`,
    {
      key: c.key,
      input: {
        reason: c.reason,
        name: "available",
        referenceDocumentUri: c.ref,
        changes: [{ inventoryItemId: c.inventoryItemId, locationId: c.locationId, delta: c.delta, changeFromQuantity: c.from }],
      },
    },
  );
  const errs = d.inventoryAdjustQuantities.userErrors;
  if (errs.length) throw new ProposalError(`Shopify refused the adjustment: ${errs[0].message}`);
}

// --- Shopify: $app.placement metafield with compare-and-swap ---

const READ = `#graphql
  query Placements($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { id placement: metafield(namespace: "$app", key: "placement") { value compareDigest } }
    }
  }`;
const SET = `#graphql
  mutation SetPlacement($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message code } }
  }`;
const DELETE = `#graphql
  mutation DeletePlacement($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) { userErrors { field message } }
  }`;

type ReadResult = { nodes: ({ id: string; placement: { value: string; compareDigest: string } | null } | null)[] };

async function readRaw(admin: AdminClient, ids: string[]) {
  const { nodes } = await gql<ReadResult>(admin, READ, { ids });
  return new Map(nodes.filter((n) => n).map((n) => [n!.id, n!.placement]));
}

async function readPlacements(admin: AdminClient, ids: string[]): Promise<PlacementValues> {
  const raw = await readRaw(admin, ids);
  return Object.fromEntries(ids.map((id) => [id, raw.get(id)?.value ?? null]));
}

/** Sets each product's placement to `target`, failing if Shopify no longer holds `expected`. */
async function writePlacements(admin: AdminClient, target: PlacementValues, expected: PlacementValues) {
  const ids = Object.keys(target);
  const current = await readRaw(admin, ids);
  for (const id of ids) {
    if ((current.get(id)?.value ?? null) !== expected[id])
      throw new ProposalError("Placement changed in Shopify since this was proposed");
  }

  const sets = ids
    .filter((id) => target[id] !== null)
    .map((id) => ({
      ownerId: id,
      namespace: "$app",
      key: "placement",
      type: "single_line_text_field",
      value: target[id],
      compareDigest: current.get(id)?.compareDigest ?? null, // null = must not exist yet
    }));
  if (sets.length) {
    const r = await gql<{ metafieldsSet: { userErrors: { message: string }[] } }>(admin, SET, { metafields: sets });
    if (r.metafieldsSet.userErrors.length) throw new ProposalError(r.metafieldsSet.userErrors[0].message);
  }

  // shortcut: metafieldsDelete has no compareDigest; the read above is the check. Fine for one store manager.
  const dels = ids
    .filter((id) => target[id] === null && current.get(id))
    .map((id) => ({ ownerId: id, namespace: "$app", key: "placement" }));
  if (dels.length) {
    const r = await gql<{ metafieldsDelete: { userErrors: { message: string }[] } }>(admin, DELETE, { metafields: dels });
    if (r.metafieldsDelete.userErrors.length) throw new ProposalError(r.metafieldsDelete.userErrors[0].message);
  }
}

/** The proposal for putting `c` into `slot`, from the engine's view of the fixture. */
export function swapFor(
  fx: { id: string; fixture: { name: string; slots: ({ productId: string; title: string; colorFamily: string } | null)[] } },
  slot: number,
  c: { productId: string; title: string; colorFamily: string },
): { payload: SwapPayload; diff: SwapDiff } {
  const out = fx.fixture.slots[slot];
  if (!out) throw new ProposalError("That slot is empty");
  return {
    payload: { fixtureId: fx.id, slot, productId: c.productId },
    diff: {
      fixture: fx.fixture.name,
      slot,
      out: { productId: out.productId, title: out.title, colorFamily: out.colorFamily },
      in: { productId: c.productId, title: c.title, colorFamily: c.colorFamily },
    },
  };
}
