// Backend for the Sidekick data tools. Called from the extension with the admin session token;
// answers only from cached summaries so it stays well inside Sidekick's 1-second limit.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSummary, type SummaryKey } from "../lib/summaries.server";

const TOOLS: Record<string, { key: SummaryKey; page: string }> = {
  "read-rate": { key: "read_rate", page: "the Read rate page" },
  "swap-outs": { key: "swap_outs", page: "the Replenishment page" },
  "loose-tags": { key: "loose_tags", page: "the Loose tags page" },
};

type Data = Record<string, unknown> & {
  byCategory?: { category: string }[];
  swapOuts?: { fixture: string }[];
  topSuspects?: { area: string | null }[];
};

async function handle(request: Request, tool: string | undefined) {
  // Also answers the CORS preflight from the extension sandbox.
  const { cors } = await authenticate.admin(request);
  const t = TOOLS[tool ?? ""];
  if (!t) return cors(Response.json({ error: "Unknown tool" }, { status: 404 }));

  const data = (await getSummary(t.key)) as Data | null;
  if (!data) return cors(Response.json({ error: `No data yet. Open ${t.page} in Floorset once to build it.` }));

  // Optional narrowing, matched loosely so "bras" or "zone 1" still work.
  const filter = new URL(request.url).searchParams.get("filter")?.toLowerCase().replace(/s$/, "");
  const has = (v: string | null | undefined) => !filter || (v ?? "").toLowerCase().includes(filter);
  const out: Data = { ...data };
  if (data.byCategory) out.byCategory = data.byCategory.filter((c) => has(c.category));
  if (data.swapOuts) out.swapOuts = data.swapOuts.filter((s) => has(s.fixture));
  if (data.topSuspects) out.topSuspects = data.topSuspects.filter((s) => has(s.area));
  return cors(Response.json(out));
}

export const loader = ({ request, params }: LoaderFunctionArgs) => handle(request, params.tool);
export const action = ({ request, params }: ActionFunctionArgs) => handle(request, params.tool);
