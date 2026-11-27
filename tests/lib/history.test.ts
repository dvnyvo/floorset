import { describe, expect, it } from "vitest";
import { toHistory, type ProposalRow } from "../../app/lib/history";

const t = (min: number) => new Date(Date.UTC(2026, 10, 27, 10, min));
const row = (id: string, fixtureId: string, status: string, createdAt: Date, logs: ProposalRow["auditLogs"] = []): ProposalRow => ({
  id,
  status,
  payload: { fixtureId, slot: 2, productId: `in-${id}` },
  diff: { fixture: `Fixture ${fixtureId}`, slot: 2, out: { title: `Old ${id}` }, in: { title: `New ${id}` } },
  createdAt,
  auditLogs: logs,
});

const rows = [
  row("a", "f1", "applied", t(0), [{ appliedAt: t(5), undoneAt: null }]),
  row("b", "f1", "undone", t(1), [{ appliedAt: t(2), undoneAt: t(30) }]),
  row("c", "f2", "pending", t(10)),
  row("d", "f1", "rejected", t(3)),
  row("e", "f2", "approved", t(20)),
];

describe("toHistory", () => {
  it("lists the newest change first, timed by its latest status change", () => {
    const h = toHistory(rows);
    expect(h.map((e) => e.id)).toEqual(["b", "e", "c", "a", "d"]);
    expect(h.find((e) => e.id === "a")!.at).toBe(t(5).toISOString()); // applied: audit row
    expect(h.find((e) => e.id === "b")!.at).toBe(t(30).toISOString()); // undone: undo time
    expect(h.find((e) => e.id === "d")!.at).toBe(t(3).toISOString()); // rejected: proposed time
  });

  it("names each status in words, with a mid-apply proposal still proposed", () => {
    const status = Object.fromEntries(toHistory(rows).map((e) => [e.id, e.status]));
    expect(status).toEqual({ a: "applied", b: "undone", c: "proposed", d: "rejected", e: "proposed" });
  });

  it("filters to one fixture", () => {
    expect(toHistory(rows, "f1").map((e) => e.id)).toEqual(["b", "a", "d"]);
    expect(toHistory(rows, "f3")).toEqual([]);
  });

  it("carries the slot and the old and new item", () => {
    expect(toHistory(rows, "f2")[1]).toMatchObject({ fixture: "Fixture f2", slot: 2, out: "Old c", in: "New c" });
  });
});
