// Chat copilot for one fixture slot. Claude turns requests ("something brighter", "a top instead") into
// ranking preferences and can stage a swap, but only the rules engine decides what's allowed: the
// propose tool accepts nothing outside the engine's current picks.
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { rank, type Pick } from "./engine/rank";
import type { Preferences } from "./engine/types";
import type { loadFixture } from "./floor.server";
import { CATEGORIES, COLOR_FAMILIES, toPreferences, type PrefsInput } from "./prefs";
import { proposeSwap, swapFor } from "./proposals.server";

export const MODEL = "claude-opus-5-5";
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
type FixtureData = NonNullable<Awaited<ReturnType<typeof loadFixture>>>;

/** Client-sent history is untrusted: keep plain alternating text turns of bounded size. */
export function cleanHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export interface CopilotResult {
  reply?: string;
  error?: string;
  prefs?: Preferences; // what the last ranking used, so the page can show the same picks
  proposalId?: string;
}

export async function runCopilot(
  fx: FixtureData,
  slot: number,
  startPrefs: Preferences,
  history: ChatMessage[],
): Promise<CopilotResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "The copilot needs ANTHROPIC_API_KEY in .env. Ranking and refine buttons still work." };
  }
  if (!history.length || history[history.length - 1].role !== "user") return { error: "Send a message first." };

  let prefs = startPrefs;
  let picks: Pick[] = rank({ fixture: fx.fixture, slot, candidates: fx.candidates, cadenceFor: fx.cadenceFor, prefs }).picks;
  let proposalId: string | undefined;
  const current = fx.fixture.slots[slot];

  const rankTool = betaTool({
    name: "rank_replacements",
    description:
      "Re-rank replacements for the slot with new preferences. Hard stock and visual rules always apply; " +
      "preferences can only narrow or re-weight. Returns the top picks with reasons and the most common rejections.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES, description: "Only this category" },
        colorFamilies: { type: "array", items: { type: "string", enum: COLOR_FAMILIES }, description: "Only these colors" },
        contrastBoost: { type: "boolean", description: "Weight color contrast with neighbors more heavily" },
      },
      additionalProperties: false,
    },
    run: async (input: PrefsInput) => {
      prefs = toPreferences(input);
      const r = rank({ fixture: fx.fixture, slot, candidates: fx.candidates, cadenceFor: fx.cadenceFor, prefs });
      picks = r.picks;
      return JSON.stringify({
        picks: r.picks.map((p) => ({ productId: p.candidate.productId, title: p.candidate.title, score: +p.score.toFixed(2), reason: p.reason })),
        passed: r.passedCount,
        fallback: r.fallback, // true = no item can refill twice; picks only fill the run once
        topRejections: r.rejected.slice(0, 8).map((x) => ({ title: x.candidate.title, rule: x.rule, reason: x.reason })),
      });
    },
  });

  const proposeTool = betaTool({
    name: "propose_swap",
    description:
      "Stage a swap of the current slot item for one of the latest picks. This only creates a pending proposal; " +
      "a person must approve it before anything changes. Only call it when the user asks to go ahead with an item.",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string", description: "productId from the latest rank_replacements picks" } },
      required: ["productId"],
      additionalProperties: false,
    },
    run: async ({ productId }: { productId: string }) => {
      const pick = picks.find((p) => p.candidate.productId === productId);
      if (!pick) return "Rejected: that item isn't in the current picks. Only the engine's picks can be proposed.";
      const { payload, diff } = swapFor(fx, slot, pick.candidate);
      proposalId = (await proposeSwap(payload, diff)).id;
      return `Proposal staged (pending approval): ${diff.out.title} -> ${diff.in.title}.`;
    },
  });

  const system = [
    "You help a retail store manager choose a replacement for one slot on a sales-floor fixture.",
    `Fixture: ${fx.fixture.name} (${fx.fixture.type}) in ${fx.fixture.zone.name}, palette ${fx.fixture.zone.palette.join(", ")}.`,
    `Slot ${slot + 1} currently holds ${current ? `${current.title} (${current.colorFamily} ${current.category})` : "nothing"}, which can't hold its size run.`,
    `Current preferences: ${JSON.stringify(startPrefs)}. Current top picks: ${picks.map((p) => p.candidate.title).join("; ") || "none"}.`,
    "Use rank_replacements to apply what the user asks for, then explain the top picks in a sentence or two using the reasons the tool returns.",
    "If nothing passes, say which rules blocked the best sellers. Never claim you can bypass a rule.",
    "Keep replies short and plain, no markdown headers.",
  ].join("\n");

  const client = new Anthropic();
  try {
    const final = await client.beta.messages
      .toolRunner({
        model: MODEL,
        max_tokens: 4000,
        system,
        tools: [rankTool, proposeTool],
        messages: history,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_iterations: 5,
      })
      .runUntilDone();
    const reply = final.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { reply: reply || "Done.", prefs, proposalId };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.RateLimitError) return { error: "The copilot is rate limited, try again in a minute." };
    if (e instanceof Anthropic.APIError) return { error: `Copilot request failed (${e.status ?? "network"}).` };
    throw e;
  }
}
