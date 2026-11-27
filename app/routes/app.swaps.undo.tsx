// Undo for an applied swap, posted from the floor map's History and Replenishment's Recent changes.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ProposalError, undoProposal } from "../lib/proposals.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    await undoProposal(admin, String(form.get("proposalId") ?? ""));
    return { ok: "Swap undone" };
  } catch (e) {
    if (e instanceof ProposalError) return { error: e.message };
    throw e;
  }
};
