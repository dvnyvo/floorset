// Swap history table: the floor map's fixture History and Replenishment's Recent changes.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { HistoryEntry, HistoryStatus } from "../lib/history";
import type { action } from "../routes/app.swaps.undo";

const TONE: Record<HistoryStatus, "info" | "success" | "neutral"> = {
  proposed: "info",
  applied: "success",
  undone: "neutral",
  rejected: "neutral",
};

/** Local date and time, set after hydration so the server's time zone never shows. */
function When({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), [iso]);
  return <time dateTime={iso}>{text}</time>;
}

export function ChangeList({
  entries,
  shown,
  withFixture = false,
  from,
}: {
  entries: HistoryEntry[];
  shown?: number; // rows before "Show all (N)"
  withFixture?: boolean; // the cross-fixture list of applied swaps: names the fixture, no status column
  from?: "map"; // where the replacement view's back link returns to
}) {
  const shopify = useAppBridge();
  const undo = useFetcher<typeof action>();
  const [all, setAll] = useState(false);
  const rows = all || !shown ? entries : entries.slice(0, shown);

  useEffect(() => {
    const r = undo.data;
    if (r && "ok" in r && r.ok) shopify.toast.show(r.ok);
    if (r && "error" in r && r.error) shopify.toast.show(r.error, { isError: true });
  }, [undo.data, shopify]);

  const view = (e: HistoryEntry) => `/app/replenish/fixtures/${e.fixtureId}?slot=${e.slot}${from ? `&from=${from}` : ""}`;

  return (
    <s-stack gap="small">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Change</s-table-header>
          {!withFixture && <s-table-header>Status</s-table-header>}
          <s-table-header>When</s-table-header>
          <s-table-header>Action</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rows.map((e) => (
            <s-table-row key={e.id}>
              <s-table-cell>
                <s-stack gap="small-300">
                  <s-text>
                    {e.out} → {e.in}
                  </s-text>
                  <s-text color="subdued">
                    {withFixture ? `${e.fixture}, slot` : "Slot"} {e.slot + 1}
                  </s-text>
                </s-stack>
              </s-table-cell>
              {!withFixture && (
                <s-table-cell>
                  <s-badge tone={TONE[e.status]}>{e.status}</s-badge>
                </s-table-cell>
              )}
              <s-table-cell>
                <When iso={e.at} />
              </s-table-cell>
              <s-table-cell>
                {e.status === "applied" && (
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-button
                      disabled={undo.state !== "idle"}
                      onClick={() => undo.submit({ proposalId: e.id }, { method: "post", action: "/app/swaps/undo" })}
                    >
                      Undo
                    </s-button>
                    <s-link href={view(e)}>Replacement view</s-link>
                  </s-stack>
                )}
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
      {shown && entries.length > shown && (
        <s-button variant="tertiary" onClick={() => setAll((a) => !a)}>
          {all ? `Show last ${shown}` : `Show all (${entries.length})`}
        </s-button>
      )}
    </s-stack>
  );
}
