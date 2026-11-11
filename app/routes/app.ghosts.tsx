import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { saveLooseTags } from "../lib/summaries.server";
import { loadGhosts, resolveSuspect, runDetection, type Resolution } from "../lib/ghosts.server";
import { approveAndApply, ProposalError, rejectProposal, undoProposal } from "../lib/proposals.server";
import { SIGNALS, type Signal } from "../lib/scans/ghosts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const g = await loadGhosts(admin);
  await saveLooseTags(g);
  return g;
};

const RESOLUTIONS: Resolution[] = ["loose_tag", "item_found", "not_found"];

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") ?? "");
  try {
    switch (intent) {
      case "detect": {
        const { open } = await runDetection();
        return { ok: `Detection re-run: ${open} open suspects` };
      }
      case "resolve": {
        const resolution = String(form.get("resolution")) as Resolution;
        if (!RESOLUTIONS.includes(resolution)) return { error: "Unknown resolution" };
        const { proposed } = await resolveSuspect(admin, id, resolution);
        return { ok: proposed ? "Marked as a loose tag. Inventory correction proposed below." : "Updated" };
      }
      case "apply":
        await approveAndApply(admin, id);
        return { ok: "Shopify inventory corrected" };
      case "apply_all": {
        // Sequential on purpose: each correction reads then compare-and-swaps the current count.
        const ids = form.getAll("ids").map(String);
        for (const pid of ids) await approveAndApply(admin, pid);
        return { ok: `${ids.length} corrections applied` };
      }
      case "reject":
        await rejectProposal(id);
        return { ok: "Correction rejected" };
      case "undo":
        await undoProposal(admin, id);
        return { ok: "Correction undone" };
      default:
        return { error: "Unknown action" };
    }
  } catch (e) {
    if (e instanceof ProposalError) return { error: e.message };
    throw e;
  }
};

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{detail}</s-text>
      </s-stack>
    </s-box>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const STATUS_TONE = { pending: "info", applied: "success", undone: "neutral", rejected: "neutral", approved: "info" } as const;

export default function Ghosts() {
  const d = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const act = useFetcher<typeof action>();
  const busy = act.state !== "idle";
  const post = (fields: Record<string, string>) => act.submit(fields, { method: "post" });

  useEffect(() => {
    const r = act.data;
    if (r && "ok" in r && r.ok) shopify.toast.show(r.ok);
    if (r && "error" in r && r.error) shopify.toast.show(r.error, { isError: true });
  }, [act.data, shopify]);

  // Sweep list: walk one area at a time, most suspicious tags first.
  const areas = new Map<string, typeof d.open>();
  for (const s of d.open) areas.set(s.area ?? "Unknown", [...(areas.get(s.area ?? "Unknown") ?? []), s]);
  const pending = d.corrections.filter((c) => c.status === "pending");

  const applyAll = () => {
    const fd = new FormData();
    fd.set("intent", "apply_all");
    for (const c of pending) fd.append("ids", c.id);
    act.submit(fd, { method: "post" });
  };

  return (
    <s-page heading="Loose tags">
      <s-button slot="primary-action" variant="primary" disabled={busy} onClick={() => post({ intent: "detect" })}>
        Re-run detection
      </s-button>

      <s-section>
        <s-paragraph>
          A tag that keeps reading after its garment is gone hides shrink: the read rate still counts it and Shopify still
          shows it as sellable. These tags are excluded from the adjusted read rate and from floor counts until resolved.
        </s-paragraph>
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <Stat label="To check" value={d.stats.open} detail={`${d.stats.likely} likely (70%+)`} />
          <Stat label="Confirmed loose tags" value={d.stats.confirmed} detail="garment gone" />
          <Stat label="False alarms" value={d.stats.falseAlarms} detail="garment was there" />
          <Stat label="Written off in Shopify" value={d.stats.writtenOff} detail="approved corrections" />
        </s-grid>
      </s-section>

      <s-section heading="Hotspots">
        {d.hotspots.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Area</s-table-header>
              <s-table-header format="numeric">To check</s-table-header>
              <s-table-header format="numeric">Confirmed</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.hotspots.map((h) => (
                <s-table-row key={h.area}>
                  <s-table-cell>{h.area}</s-table-cell>
                  <s-table-cell>{h.open}</s-table-cell>
                  <s-table-cell>{h.confirmed}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-paragraph>No loose tags detected.</s-paragraph>
        )}
      </s-section>

      {[...areas].map(([area, rows]) => (
        <s-section key={area} heading={`Sweep: ${area} (${rows.length})`}>
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Item</s-table-header>
              <s-table-header>Why</s-table-header>
              <s-table-header format="numeric">Confidence</s-table-header>
              <s-table-header>What did you find?</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((s) => (
                <s-table-row key={s.epc}>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      <s-text>{s.title}</s-text>
                      <s-text color="subdued">
                        {s.sku} · {s.epc}
                      </s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-300">
                      {s.signals.map((sig: Signal) => (
                        <s-text key={sig}>{SIGNALS[sig].label}</s-text>
                      ))}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={s.confidence >= 0.7 ? "critical" : "warning"}>{pct(s.confidence)}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button disabled={busy} onClick={() => post({ intent: "resolve", id: s.epc, resolution: "loose_tag" })}>
                        Tag only
                      </s-button>
                      <s-button disabled={busy} onClick={() => post({ intent: "resolve", id: s.epc, resolution: "item_found" })}>
                        Garment here
                      </s-button>
                      <s-button disabled={busy} variant="tertiary" onClick={() => post({ intent: "resolve", id: s.epc, resolution: "not_found" })}>
                        Nothing there
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      ))}

      <s-section heading="Inventory corrections">
        {pending.length > 1 && (
          <s-button variant="primary" disabled={busy} onClick={applyAll}>
            Approve all {pending.length}
          </s-button>
        )}
        {d.corrections.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Item</s-table-header>
              <s-table-header>Change</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.corrections.map((c) => (
                <s-table-row key={c.id}>
                  <s-table-cell>
                    {String(c.diff.title)} ({String(c.diff.sku)})
                  </s-table-cell>
                  <s-table-cell>Available {Number(c.diff.delta)} (loose tag in {String(c.diff.area ?? "unknown area")})</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>{c.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {c.status === "pending" && (
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="primary" disabled={busy} onClick={() => post({ intent: "apply", id: c.id })}>
                          Approve &amp; apply
                        </s-button>
                        <s-button disabled={busy} onClick={() => post({ intent: "reject", id: c.id })}>
                          Reject
                        </s-button>
                      </s-stack>
                    )}
                    {c.status === "applied" && (
                      <s-button disabled={busy} onClick={() => post({ intent: "undo", id: c.id })}>
                        Undo
                      </s-button>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-paragraph>Mark a tag as &quot;Tag only&quot; to propose writing that unit off in Shopify.</s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
