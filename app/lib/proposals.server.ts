// Every write goes propose -> approve -> apply -> audit log -> undo. Nothing touches Shopify or the
// layout until a person approves it, and every applied change can be reversed from its audit row.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { gql, type AdminClient } from "./shopify/catalog.server";

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

/** Approve and apply in one step: checks the fixture hasn't changed, writes Shopify, then the layout + audit row. */
export async function approveAndApply(admin: AdminClient, id: string) {
  // Claim the proposal first so a double click can't apply it twice.
  const { count } = await db.proposal.updateMany({ where: { id, status: "pending" }, data: { status: "approved" } });
  if (!count) throw new ProposalError("This proposal was already handled");
  const p = await db.proposal.findUniqueOrThrow({ where: { id } });
  const payload = p.payload as unknown as SwapPayload;
  const diff = p.diff as unknown as SwapDiff;

  try {
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

    // shortcut: Shopify write then local transaction; a crash between them leaves Shopify ahead (re-apply heals it).
    await db.$transaction([
      db.placement.update({ where: { id: pl.id }, data: after.placement }),
      db.proposal.update({ where: { id }, data: { status: "applied" } }),
      db.auditLog.create({ data: { proposalId: id, before: { ...before }, after: { ...after } } }),
    ]);
  } catch (e) {
    await db.proposal.update({ where: { id }, data: { status: "pending" } });
    throw e;
  }
}

/** Reverses an applied swap from its audit row, refusing if anything changed since. */
export async function undoProposal(admin: AdminClient, id: string) {
  const p = await db.proposal.findUnique({ where: { id }, include: { auditLogs: { where: { undoneAt: null } } } });
  const log = p?.auditLogs[0];
  if (p?.status !== "applied" || !log) throw new ProposalError("Only applied changes can be undone");
  const payload = p.payload as unknown as SwapPayload;
  const before = log.before as unknown as SwapSnapshot;
  const after = log.after as unknown as SwapSnapshot;

  const pl = await db.placement.findUnique({
    where: { fixtureId_slot: { fixtureId: payload.fixtureId, slot: payload.slot } },
  });
  if (pl?.productId !== after.placement.productId) throw new ProposalError("The fixture changed after this swap");
  if (await db.placement.findFirst({ where: { productId: before.placement.productId } }))
    throw new ProposalError("The original item has since been placed elsewhere");

  await writePlacements(admin, before.metafields, after.metafields);
  await db.$transaction([
    db.placement.update({ where: { id: pl.id }, data: before.placement }),
    db.proposal.update({ where: { id }, data: { status: "undone" } }),
    db.auditLog.update({ where: { id: log.id }, data: { undoneAt: new Date() } }),
  ]);
}

export function listProposals(fixtureId?: string) {
  return db.proposal
    .findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { auditLogs: true } })
    .then((ps) => ps.filter((p) => !fixtureId || (p.payload as unknown as SwapPayload).fixtureId === fixtureId));
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
