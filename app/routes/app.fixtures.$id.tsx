import { useEffect, useState, type FormEvent } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { rank } from "../lib/engine/rank";
import type { ColorFamily, Preferences } from "../lib/engine/types";
import { loadFixture } from "../lib/floor.server";
import { CATEGORIES, prefsFromParams, prefsToParams } from "../lib/prefs";
import {
  approveAndApply,
  listProposals,
  ProposalError,
  proposeSwap,
  rejectProposal,
  swapFor,
  undoProposal,
  type SwapDiff,
} from "../lib/proposals.server";
import {
  cleanHistory,
  runCopilot,
  type ChatMessage,
} from "../lib/copilot.server";

async function load(request: Request, id: string) {
  const { admin } = await authenticate.admin(request);
  const fx = await loadFixture(admin, id);
  if (!fx)
    throw data("Fixture not found, or no floor scan yet", { status: 404 });
  const url = new URL(request.url);
  const slot = Math.min(
    Math.max(0, Number(url.searchParams.get("slot")) || 0),
    fx.fixture.slots.length - 1,
  );
  const prefs = prefsFromParams(url.searchParams);
  return { admin, fx, slot, prefs };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { fx, slot, prefs } = await load(request, params.id!);
  const r = rank({
    fixture: fx.fixture,
    slot,
    candidates: fx.candidates,
    cadenceFor: fx.cadenceFor,
    prefs,
  });
  const proposals = await listProposals(fx.id);
  return {
    fixture: fx.fixture,
    slot,
    prefs,
    picks: r.picks.map((p) => ({
      ...p.candidate,
      score: p.score,
      reason: p.reason,
    })),
    passedCount: r.passedCount,
    rejected: r.rejected
      .slice(0, 25)
      .map((x) => ({ ...x.candidate, stage: x.stage, reason: x.reason })),
    rejectedCount: r.rejected.length,
    proposals: proposals.map((p) => ({
      id: p.id,
      status: p.status,
      diff: p.diff as unknown as SwapDiff,
      createdAt: p.createdAt.toISOString(),
    })),
    copilot: !!process.env.ANTHROPIC_API_KEY,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, fx, slot, prefs } = await load(request, params.id!);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const proposalId = String(form.get("proposalId") ?? "");
  try {
    switch (intent) {
      case "propose": {
        const r = rank({
          fixture: fx.fixture,
          slot,
          candidates: fx.candidates,
          cadenceFor: fx.cadenceFor,
          prefs,
        });
        const pick = r.picks.find(
          (p) => p.candidate.productId === form.get("productId"),
        );
        if (!pick)
          return {
            error:
              "That item is no longer a valid pick. Refresh and try again.",
          };
        const { payload, diff } = swapFor(fx, slot, pick.candidate);
        await proposeSwap(payload, diff);
        return { ok: "Swap proposed. Approve it below to apply." };
      }
      case "apply":
        await approveAndApply(admin, proposalId);
        return { ok: "Swap applied to the floor layout and Shopify" };
      case "reject":
        await rejectProposal(proposalId);
        return { ok: "Proposal rejected" };
      case "undo":
        await undoProposal(admin, proposalId);
        return { ok: "Swap undone" };
      case "chat": {
        let raw: unknown;
        try {
          raw = JSON.parse(String(form.get("messages") ?? "[]"));
        } catch {
          raw = [];
        }
        return { chat: await runCopilot(fx, slot, prefs, cleanHistory(raw)) };
      }
      default:
        return { error: "Unknown action" };
    }
  } catch (e) {
    if (e instanceof ProposalError) return { error: e.message };
    throw e;
  }
};

const SWATCH: Record<ColorFamily, string> = {
  black: "#1f1f1f",
  neutral: "#d9cfc1",
  bright: "#e4572e",
  pastel: "#f2c4d6",
  earth: "#8b6a4b",
};

function Block({
  item,
  highlight,
}: {
  item: { title: string; colorFamily: string; category: string } | null;
  highlight?: boolean;
}) {
  return (
    <div
      title={item ? `${item.title} (${item.colorFamily})` : "Empty"}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "8px 6px",
        borderRadius: 6,
        background: item
          ? SWATCH[item.colorFamily as ColorFamily]
          : "transparent",
        color:
          item && ["black", "bright", "earth"].includes(item.colorFamily)
            ? "#fff"
            : "#1f1f1f",
        outline: highlight ? "3px solid #2c6ecb" : "1px solid #c9cccf",
        outlineOffset: highlight ? 2 : 0,
        fontSize: 12,
        textAlign: "center",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {item ? `${item.category} · ${item.colorFamily}` : "empty"}
    </div>
  );
}

const STATUS_TONE = {
  pending: "info",
  applied: "success",
  undone: "neutral",
  rejected: "neutral",
  approved: "info",
} as const;

export default function FixtureView() {
  const d = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const act = useFetcher<typeof action>();
  const chat = useFetcher<typeof action>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const top = d.picks[0];
  const after = d.fixture.slots.map((s, i) => (i === d.slot && top ? top : s));
  const link = (p: Preferences, slot = d.slot) => {
    const sp = prefsToParams(p, new URLSearchParams(params));
    sp.set("slot", String(slot));
    return `?${sp}`;
  };

  useEffect(() => {
    const r = act.data;
    if (r && "ok" in r && r.ok) shopify.toast.show(r.ok);
    if (r && "error" in r && r.error)
      shopify.toast.show(r.error, { isError: true });
  }, [act.data, shopify]);

  useEffect(() => {
    const r = chat.data && "chat" in chat.data ? chat.data.chat : null;
    if (!r) return;
    if (r.error) {
      const error = r.error;
      setMessages((m) => [...m, { role: "assistant", content: error }]);
      return;
    }
    if (r.reply && r.prefs) {
      const reply = r.reply;
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      // Show what the copilot ranked with; navigating also reloads picks and any new proposal.
      navigate(link(r.prefs), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.data]);

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = String(
      new FormData(e.currentTarget).get("message") ?? "",
    ).trim();
    if (!text) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    e.currentTarget.reset();
    chat.submit(
      { intent: "chat", messages: JSON.stringify(next) },
      { method: "post" },
    );
  };
  const post = (fields: Record<string, string>) =>
    act.submit(fields, { method: "post" });
  const busy = act.state !== "idle";

  const colorPrefs: [string, ColorFamily[] | undefined][] = [
    ["Any color", undefined],
    ["Brighter", ["bright", "pastel"]],
    ["Darker", ["black", "earth"]],
    ["Neutrals", ["neutral"]],
  ];

  return (
    <s-page heading={`${d.fixture.name} · slot ${d.slot + 1}`}>
      <s-link slot="breadcrumb-actions" href="/app/replenish">
        Replenishment
      </s-link>

      <s-section heading="Before and after">
        <s-stack gap="small">
          <s-text>Before (click a slot to pick it)</s-text>
          <div style={{ display: "flex", gap: 8 }}>
            {d.fixture.slots.map((s, i) => (
              <a
                key={i}
                href={link(d.prefs, i)}
                style={{ flex: 1, minWidth: 0, textDecoration: "none" }}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(link(d.prefs, i));
                }}
              >
                <Block item={s} highlight={i === d.slot} />
              </a>
            ))}
          </div>
          <s-text>After, with the top pick</s-text>
          <div style={{ display: "flex", gap: 8 }}>
            {after.map((s, i) => (
              <Block key={i} item={s} highlight={i === d.slot} />
            ))}
          </div>
          <s-text color="subdued">
            {d.fixture.zone.name} palette: {d.fixture.zone.palette.join(", ")} ·{" "}
            {d.fixture.slots[d.slot]?.title ?? "Empty slot"}
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Refine">
        <s-stack gap="small">
          <s-stack direction="inline" gap="small">
            <s-button
              href={link({ ...d.prefs, category: undefined })}
              variant={d.prefs.category ? "secondary" : "primary"}
            >
              Any category
            </s-button>
            {CATEGORIES.map((c) => (
              <s-button
                key={c}
                href={link({ ...d.prefs, category: c })}
                variant={d.prefs.category === c ? "primary" : "secondary"}
              >
                {c}
              </s-button>
            ))}
          </s-stack>
          <s-stack direction="inline" gap="small">
            {colorPrefs.map(([label, colors]) => (
              <s-button
                key={label}
                href={link({ ...d.prefs, colorFamilies: colors })}
                variant={
                  (d.prefs.colorFamilies ?? []).join() === (colors ?? []).join()
                    ? "primary"
                    : "secondary"
                }
              >
                {label}
              </s-button>
            ))}
            <s-button
              href={link({
                ...d.prefs,
                weights: d.prefs.weights?.contrast
                  ? undefined
                  : { contrast: 1 },
              })}
              variant={d.prefs.weights?.contrast ? "primary" : "secondary"}
            >
              More contrast
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading={`Top picks (${d.passedCount} pass every rule)`}>
        {d.picks.length ? (
          <s-stack gap="base">
            {d.picks.map((p, i) => (
              <s-box
                key={p.productId}
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack
                  direction="inline"
                  gap="base"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <s-stack gap="small-200">
                    <s-text type="strong">
                      {i + 1}. {p.title}
                    </s-text>
                    <s-text>{p.reason}</s-text>
                    <s-text color="subdued">Score {p.score.toFixed(2)}</s-text>
                  </s-stack>
                  <s-button
                    disabled={busy || !d.fixture.slots[d.slot]}
                    onClick={() =>
                      post({ intent: "propose", productId: p.productId })
                    }
                  >
                    Propose swap
                  </s-button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        ) : (
          <s-paragraph>
            Nothing passes every rule with these preferences. See the rejections
            below.
          </s-paragraph>
        )}
      </s-section>

      {/* Shown only when ANTHROPIC_API_KEY is set; everything else works without it. */}
      {d.copilot && (
        <s-section heading="Copilot">
          <s-stack gap="small">
            {messages.map((m, i) => (
              <s-box
                key={i}
                padding="small"
                background={m.role === "user" ? "subdued" : "transparent"}
                borderRadius="base"
              >
                <s-text type={m.role === "user" ? "strong" : "generic"}>
                  {m.content}
                </s-text>
              </s-box>
            ))}
            {chat.state !== "idle" && (
              <s-text color="subdued">Thinking…</s-text>
            )}
            <form onSubmit={send}>
              <s-stack direction="inline" gap="small" alignItems="end">
                <s-text-field
                  name="message"
                  label="Ask the copilot"
                  placeholder="Something brighter, but not a legging"
                />
                <s-button type="submit" disabled={chat.state !== "idle"}>
                  Send
                </s-button>
              </s-stack>
            </form>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Proposals">
        {d.proposals.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Swap</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.proposals.map((p) => (
                <s-table-row key={p.id}>
                  <s-table-cell>
                    Slot {p.diff.slot + 1}: {p.diff.out.title} →{" "}
                    {p.diff.in.title}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        STATUS_TONE[p.status as keyof typeof STATUS_TONE] ??
                        "neutral"
                      }
                    >
                      {p.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {p.status === "pending" && (
                      <s-stack direction="inline" gap="small">
                        <s-button
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            post({ intent: "apply", proposalId: p.id })
                          }
                        >
                          Approve &amp; apply
                        </s-button>
                        <s-button
                          disabled={busy}
                          onClick={() =>
                            post({ intent: "reject", proposalId: p.id })
                          }
                        >
                          Reject
                        </s-button>
                      </s-stack>
                    )}
                    {p.status === "applied" && (
                      <s-button
                        disabled={busy}
                        onClick={() =>
                          post({ intent: "undo", proposalId: p.id })
                        }
                      >
                        Undo
                      </s-button>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-paragraph>No proposals for this fixture yet.</s-paragraph>
        )}
      </s-section>

      <s-section heading={`Rejected (${d.rejectedCount})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Item</s-table-header>
            <s-table-header>Stage</s-table-header>
            <s-table-header>Why</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {d.rejected.map((x) => (
              <s-table-row key={x.productId}>
                <s-table-cell>{x.title}</s-table-cell>
                <s-table-cell>
                  <s-badge
                    tone={
                      x.stage === "visual"
                        ? "warning"
                        : x.stage === "preference"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {x.stage}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>{x.reason}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
