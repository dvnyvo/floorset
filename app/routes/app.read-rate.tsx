import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { saveReadRate } from "../lib/summaries.server";
import { loadDashboard } from "../lib/floor.server";
import { READ_RATE_TARGET, type RateRow } from "../lib/scans/reconcile";
import { ReadRateChart } from "../components/ReadRateChart";
import { cap, pct } from "../lib/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const d = await loadDashboard(admin);
  await saveReadRate(d);
  return d;
};


function RateBadge({ row }: { row: RateRow }) {
  return row.belowTarget ? <s-badge tone="critical">Below {pct(READ_RATE_TARGET)}</s-badge> : <s-badge tone="success">On target</s-badge>;
}

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();
  const [allChronic, setAllChronic] = useState(false);

  if (!d.scan) {
    return (
      <s-page heading="Read rate">
        <s-section>
          <s-empty-state heading="No inventory scan yet">
            <s-paragraph>Upload a weekly inventory scan to compare RFID-encoded tag reads against Shopify&apos;s on-hand count.</s-paragraph>
            <s-button slot="primary-action" variant="primary" href="/app/scans">Upload a scan</s-button>
          </s-empty-state>
        </s-section>
      </s-page>
    );
  }

  const gap = (d.total.rawRate ?? 0) - (d.total.adjustedRate ?? 0);
  const looseReads = d.total.raw - d.total.adjusted; // reads in this scan that came from suspected loose tags
  return (
    <s-page heading="Read rate">
      <s-button slot="primary-action" variant="primary" href="/app/scans">Upload a scan</s-button>

      <s-section heading={`Inventory scan · ${d.scan.takenAt.slice(0, 10)}`}>
        <s-paragraph>
          The scan found {pct(d.total.rawRate)} of your stock, but {looseReads.toLocaleString()} of those reads are probably loose
          tags. Real accuracy is {pct(d.total.adjustedRate)}, {(d.total.adjustedRate ?? 0) >= READ_RATE_TARGET ? "above" : "below"} the{" "}
          {pct(READ_RATE_TARGET)} target.
        </s-paragraph>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <Stat label="Raw read rate" value={pct(d.total.rawRate)} detail={`${d.total.raw.toLocaleString()} of ${d.total.expected.toLocaleString()} on-hand units read`} />
          <Stat label="Adjusted read rate" value={pct(d.total.adjustedRate)} detail="Excludes suspected loose tags" />
          <Stat label="Likely missing" value={`${pct(gap)} of stock`} detail={`${looseReads.toLocaleString()} items`} />
          <Stat label="Unknown RFID tags" value={String(d.unknownEpcs)} detail="Read but not in the unit list" />
        </s-grid>
      </s-section>

      {d.trend.length > 1 && (
        <s-section heading="Read rate over time">
          <s-stack direction="block" gap="base">
            <s-paragraph>Adjusted read rate at each inventory scan, measured against on-hand at the time.</s-paragraph>
            <ReadRateChart points={d.trend} target={READ_RATE_TARGET} />
            <details>
              <summary>Show as a table</summary>
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Inventory scan</s-table-header>
                  <s-table-header format="numeric">Raw</s-table-header>
                  <s-table-header format="numeric">Adjusted</s-table-header>
                  {d.byCategory.map((c) => (
                    <s-table-header key={c.key} format="numeric">
                      {cap(c.label)}
                    </s-table-header>
                  ))}
                </s-table-header-row>
                <s-table-body>
                  {d.trend.map((p) => (
                    <s-table-row key={p.date}>
                      <s-table-cell>{p.date}</s-table-cell>
                      <s-table-cell>{pct(p.rawRate)}</s-table-cell>
                      <s-table-cell>{pct(p.adjustedRate)}</s-table-cell>
                      {d.byCategory.map((c) => (
                        <s-table-cell key={c.key}>{pct(p.byCategory[c.key] ?? null)}</s-table-cell>
                      ))}
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </details>
          </s-stack>
        </s-section>
      )}

      <s-section heading="By category">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Category</s-table-header>
            <s-table-header format="numeric">On hand</s-table-header>
            <s-table-header format="numeric">Raw</s-table-header>
            <s-table-header format="numeric">Adjusted</s-table-header>
            <s-table-header>Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {d.byCategory.map((c) => (
              <s-table-row key={c.key}>
                <s-table-cell>{cap(c.label)}</s-table-cell>
                <s-table-cell>{c.expected.toLocaleString()}</s-table-cell>
                <s-table-cell>{pct(c.rawRate)}</s-table-cell>
                <s-table-cell>{pct(c.adjustedRate)}</s-table-cell>
                <s-table-cell>
                  <RateBadge row={c} />
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading={`Short on ${d.countsCompared} inventory scans in a row (${d.chronic.length})`}>
        <s-paragraph>
          SKUs with fewer RFID tags read than Shopify&apos;s on-hand count on each of the last {d.countsCompared} inventory scans. Likely
          real shrink: check and correct the count.
        </s-paragraph>
        {d.chronic.length ? (
          <s-unordered-list>
            {(allChronic ? d.chronic : d.chronic.slice(0, SHOWN)).map((r) => (
              <s-list-item key={r.key}>
                {r.label}: {r.adjusted} of {r.expected} read
              </s-list-item>
            ))}
          </s-unordered-list>
        ) : (
          <s-paragraph>None.</s-paragraph>
        )}
        {d.chronic.length > SHOWN && (
          <s-button variant="tertiary" onClick={() => setAllChronic(!allChronic)}>
            {allChronic ? `Show first ${SHOWN}` : `Show all (${d.chronic.length})`}
          </s-button>
        )}
      </s-section>

      <s-section heading={`SKUs below target (${d.flaggedSkuCount})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">SKU</s-table-header>
            <s-table-header format="numeric">On hand</s-table-header>
            <s-table-header format="numeric">Read</s-table-header>
            <s-table-header format="numeric">Adjusted rate</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {d.flaggedSkus.map((r) => (
              <s-table-row key={r.key}>
                <s-table-cell>{r.label}</s-table-cell>
                <s-table-cell>{r.expected}</s-table-cell>
                <s-table-cell>{r.adjusted}</s-table-cell>
                <s-table-cell>{pct(r.adjustedRate)}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

const SHOWN = 10; // chronic shorts listed before "Show all"

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
