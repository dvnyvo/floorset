// Swap history, read from the proposals and audit rows that approveAndApply / undoProposal already write.
import type { SwapDiff, SwapPayload } from "./proposals.server";

export type HistoryStatus = "proposed" | "applied" | "undone" | "rejected";

export interface HistoryEntry {
  id: string; // proposal id, what Undo posts
  fixtureId: string;
  fixture: string;
  slot: number; // 0-based, as in the payload
  out: string; // old item
  in: string; // new item
  status: HistoryStatus;
  at: string; // ISO time of the latest status change
}

// "approved" only lasts while a swap is being applied, so it still reads as proposed.
const STATUS: Record<string, HistoryStatus> = {
  pending: "proposed",
  approved: "proposed",
  applied: "applied",
  undone: "undone",
  rejected: "rejected",
};

export interface ProposalRow {
  id: string;
  status: string;
  payload: unknown;
  diff: unknown;
  createdAt: Date;
  auditLogs: { appliedAt: Date; undoneAt: Date | null }[];
}

/** Fixture swaps as history entries, newest change first, optionally for one fixture. */
export function toHistory(rows: ProposalRow[], fixtureId?: string): HistoryEntry[] {
  return rows
    .flatMap((p) => {
      const payload = p.payload as SwapPayload;
      if (fixtureId && payload.fixtureId !== fixtureId) return [];
      const diff = p.diff as SwapDiff;
      const status = STATUS[p.status] ?? "proposed";
      const log = [...p.auditLogs].sort((a, b) => +b.appliedAt - +a.appliedAt)[0];
      // shortcut: rejecting writes no timestamp, so a rejected entry shows when it was proposed.
      const at = (status === "applied" ? log?.appliedAt : status === "undone" ? log?.undoneAt : null) ?? p.createdAt;
      return [
        {
          id: p.id,
          fixtureId: payload.fixtureId,
          fixture: diff.fixture,
          slot: diff.slot,
          out: diff.out.title,
          in: diff.in.title,
          status,
          at: at.toISOString(),
        },
      ];
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
