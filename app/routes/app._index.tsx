import { useEffect, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadFloorPlan, loadReplenishment } from "../lib/floor.server";
import { fixtureStatus, onFillList, STATUS_LABEL } from "../lib/engine/status";
import { FloorMap, FloorMapLegend } from "../components/FloorMap";
import { Block, SlotRow } from "../components/FixtureSlots";
import { SIZES } from "../lib/engine/types";
import { sizeList } from "../lib/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [plan, repl] = await Promise.all([loadFloorPlan(), loadReplenishment(admin)]);
  const byId = new Map(repl.fixtures.map((f) => [f.id, f]));

  const fixtures = plan.fixtures.flatMap((pf) => {
    if (!pf.rect) return [];
    const f = byId.get(pf.id);
    const slots = f?.slots ?? [];
    return [
      {
        id: pf.id,
        name: pf.name,
        zone: pf.zone,
        department: pf.department,
        type: pf.type,
        slotCount: pf.slotCount,
        rect: pf.rect,
        status: repl.scan ? fixtureStatus(slots) : null,
        replace: slots.filter((s) => s.swapOut).length,
        fill: slots.filter(onFillList).length,
        slots,
      },
    ];
  });
  const zones = plan.zones.flatMap((z) => (z.rect ? [{ name: z.name, rect: z.rect }] : []));
  const areas = plan.areas.flatMap((a) => (a.rect ? [{ ...a, rect: a.rect }] : []));
  const rects = [...zones, ...areas, ...fixtures].map((x) => x.rect);
  const size = {
    w: Math.max(0, ...rects.map((r) => r.x + r.w)) + 2,
    h: Math.max(0, ...rects.map((r) => r.y + r.h)) + 2,
  };

  return {
    scanDate: repl.scan?.takenAt.slice(0, 10) ?? null,
    size,
    zones,
    areas,
    fixtures,
    looseTags: plan.looseTags,
  };
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function FloorMapPage() {
  const d = useLoaderData<typeof loader>();
  // The open fixture lives in the URL (?fixture=ID), so coming back from the replacement view reopens it.
  const [params, setParams] = useSearchParams();
  const selected = params.get("fixture");
  const setSelected = (id: string) => setParams({ fixture: id }, { replace: true, preventScrollReset: true });
  const fixture = d.fixtures.find((f) => f.id === selected) ?? null;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  if (!d.fixtures.length) {
    return (
      <s-page heading="Floor map">
        <s-section>
          <s-empty-state heading="No floor plan yet">
            <s-paragraph>
              Run <code>npm run seed-floor-plan</code> to place the zones and fixtures on the map.
            </s-paragraph>
          </s-empty-state>
        </s-section>
      </s-page>
    );
  }

  const replaceSlots = d.fixtures.reduce((n, f) => n + f.replace, 0);
  const replaceFixtures = d.fixtures.filter((f) => f.status === "replace").length;
  const fillItems = d.fixtures.reduce((n, f) => n + f.fill, 0);
  const summary = d.scanDate
    ? `${plural(replaceSlots, "slot needs", "slots need")} replacing on ${plural(replaceFixtures, "fixture", "fixtures")}, ` +
      `${plural(fillItems, "item needs", "items need")} filling, ` +
      `${plural(d.looseTags.open, "suspected loose tag", "suspected loose tags")} (${d.looseTags.likely.toLocaleString()} likely).`
    : `${plural(d.looseTags.open, "suspected loose tag", "suspected loose tags")} (${d.looseTags.likely.toLocaleString()} likely).`;

  return (
    <s-page heading="Floor map">
      <s-button slot="primary-action" href="/app/replenish">
        Replenishment
      </s-button>
      <s-section heading={d.scanDate ? `Floor scan · ${d.scanDate}` : "No floor scan yet"}>
        <s-stack gap="base">
          <s-paragraph>{summary}</s-paragraph>
          {!d.scanDate && (
            <s-banner tone="info">
              Upload this morning&apos;s floor scan on the Scans page to color fixtures by status.
            </s-banner>
          )}
          <FloorMap
            size={d.size}
            zones={d.zones}
            areas={d.areas}
            fixtures={d.fixtures}
            selected={selected}
            onSelect={setSelected}
          />
          <FloorMapLegend />
          <s-text color="subdued">Select a fixture (click, or Tab then Enter) to see its slots.</s-text>
        </s-stack>
      </s-section>

      <div ref={panel}>{fixture && <FixturePanel fixture={fixture} hasScan={!!d.scanDate} />}</div>
    </s-page>
  );
}

type PanelFixture = ReturnType<typeof useLoaderData<typeof loader>>["fixtures"][number];

const STATUS_TONE = { replace: "critical", fill: "warning", ok: "success" } as const;

/** The selected fixture: its slots in floor order, swap-outs with their reason, and what to bring out. */
function FixturePanel({ fixture: f, hasScan }: { fixture: PanelFixture; hasScan: boolean }) {
  const bySlot = new Map(f.slots.map((s) => [s.slot, s]));
  const slots = Array.from({ length: f.slotCount }, (_, i) => bySlot.get(i) ?? null);
  const swapOuts = f.slots.filter((s) => s.swapOut);
  const fills = f.slots.filter(onFillList);

  return (
    <s-section heading={f.name}>
      <s-stack gap="base">
        {f.status ? (
          <s-badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</s-badge>
        ) : (
          <s-text color="subdued">{hasScan ? "Not in the latest floor scan" : "No floor scan yet"}</s-text>
        )}
        <SlotRow
          fixture={{ type: f.type, zone: { department: f.department }, slots }}
          render={(i) => {
            const s = slots[i];
            return (
              <div style={{ display: "flex" }}>
                <Block item={s && { title: s.productTitle, colorFamily: s.colorFamily }} flag={s?.swapOut ? "Swap out" : undefined} />
              </div>
            );
          }}
        />

        {swapOuts.length > 0 && (
          <s-stack gap="small">
            <s-heading>Swap-outs ({swapOuts.length})</s-heading>
            {swapOuts.map((s) => (
              <s-box key={s.slot} padding="base" border="base" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-stack gap="small-200">
                    <s-text type="strong">
                      Slot {s.slot + 1}: {s.productTitle}
                    </s-text>
                    <s-text>{s.reason}</s-text>
                  </s-stack>
                  <s-button href={`/app/replenish/fixtures/${f.id}?slot=${s.slot}&from=map`}>Open replacement view</s-button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}

        {fills.length > 0 && (
          <s-stack gap="small">
            <s-heading>Fill ({fills.length})</s-heading>
            <s-unordered-list>
              {fills.map((s) => (
                <s-list-item key={s.slot}>
                  {s.productTitle}: Bring out {sizeList(s.fill, SIZES)}
                </s-list-item>
              ))}
            </s-unordered-list>
            <s-link href={`/app/replenish?fixture=${f.id}`}>Show fill list</s-link>
          </s-stack>
        )}

        {f.status === "ok" && <s-paragraph>Every slot holds its size run. Nothing to bring out.</s-paragraph>}
      </s-stack>
    </s-section>
  );
}

// Opening a fixture only changes ?fixture=; the floor data is the same, so skip the reload.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) =>
  !formMethod && currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
