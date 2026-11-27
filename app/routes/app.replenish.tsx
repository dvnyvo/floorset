import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { saveSwapOuts } from "../lib/summaries.server";
import { loadReplenishment } from "../lib/floor.server";
import { SIZES, type SizeCounts } from "../lib/engine/types";
import { onFillList } from "../lib/engine/status";
import { sizeList } from "../lib/format";
import { Info } from "../components/Info";
import { ChangeList } from "../components/ChangeList";
import { swapHistory } from "../lib/proposals.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const r = await loadReplenishment(admin);
  await saveSwapOuts(r, session.shop);
  const applied = (await swapHistory()).filter((h) => h.status === "applied");
  return { ...r, applied };
};

const sizes = (c: SizeCounts) => sizeList(c, SIZES);

export default function Replenish() {
  const { scan, fixtures, applied } = useLoaderData<typeof loader>();
  // ?fixture=<id> (from the floor map's fixture panel) narrows the fill list to one fixture.
  const [params] = useSearchParams();
  const only = fixtures.find((f) => f.id === params.get("fixture")) ?? null;

  if (!scan) {
    return (
      <s-page heading="Floor replenishment">
        <s-section>
          <s-empty-state heading="No floor scan yet">
            <s-paragraph>Upload this morning&apos;s floor scan to get the fill list.</s-paragraph>
            <s-button slot="primary-action" variant="primary" href="/app/scans">Upload a scan</s-button>
          </s-empty-state>
        </s-section>
      </s-page>
    );
  }

  const slots = fixtures.flatMap((f) => f.slots.map((s) => ({ ...s, fixture: f })));
  const swapOuts = slots.filter((s) => s.swapOut);
  const fills = slots.filter(onFillList);
  const shownFills = only ? fills.filter((s) => s.fixture.id === only.id) : fills;
  const units = fills.reduce((n, s) => n + Object.values(s.fill).reduce((a, b) => a + (b ?? 0), 0), 0);

  const swapSection = (
    <s-section heading={`Swap-outs (${swapOuts.length})`}>
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Item</s-table-header>
          <s-table-header>Fixture</s-table-header>
          <s-table-header>Why</s-table-header>
          <s-table-header>Action</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {swapOuts.map((s) => (
            <s-table-row key={`${s.fixture.id}-${s.slot}`}>
              {/* The name links too: on narrow screens the Action column scrolls out of view. */}
              <s-table-cell>
                <s-link href={`/app/replenish/fixtures/${s.fixture.id}?slot=${s.slot}`}>{s.productTitle}</s-link>
              </s-table-cell>
              <s-table-cell>
                {s.fixture.name}, slot {s.slot + 1}
              </s-table-cell>
              <s-table-cell>{s.reason}</s-table-cell>
              <s-table-cell>
                <s-button href={`/app/replenish/fixtures/${s.fixture.id}?slot=${s.slot}`}>Find replacement</s-button>
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
  const fillSection = (
    <s-section heading={only ? `Fill list · ${only.name} (${shownFills.length})` : `Fill list (${fills.length})`}>
      {only && (
        <s-paragraph>
          Showing {only.name} only. <s-link href="/app/replenish">Show all {fills.length}</s-link>
        </s-paragraph>
      )}
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Item</s-table-header>
          <s-table-header>Fixture</s-table-header>
          <s-table-header>Bring out</s-table-header>
          <s-table-header>On floor</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {shownFills.map((s) => (
            <s-table-row key={`${s.fixture.id}-${s.slot}`}>
              <s-table-cell>{s.productTitle}</s-table-cell>
              <s-table-cell>{s.fixture.name}</s-table-cell>
              <s-table-cell>{sizes(s.fill)}</s-table-cell>
              <s-table-cell>{sizes(s.floor)}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );

  return (
    <s-page heading="Floor replenishment">
      {applied.length > 0 && (
        <s-section heading={`Recent changes (${applied.length})`}>
          <s-stack gap="small">
            <s-paragraph>Swaps applied to the floor and still in place. Undo puts the old item back.</s-paragraph>
            <ChangeList entries={applied} withFixture />
          </s-stack>
        </s-section>
      )}

      <s-section heading={`Floor scan · ${scan.takenAt.slice(0, 10)}`}>
        <s-paragraph>
          {swapOuts.length} items can&apos;t hold their size run <Info term="sizeRun" /> and need a replacement{" "}
          <Info term="swapOut" />. {fills.length} items need {units} units brought out from backstock <Info term="backstock" />.
        </s-paragraph>
      </s-section>

      {/* Filtered to one fixture (from the floor map): its fill list comes first. */}
      {only ? fillSection : swapSection}
      {only ? swapSection : fillSection}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
