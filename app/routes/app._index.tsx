import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadFloorPlan, loadReplenishment } from "../lib/floor.server";
import { fixtureStatus, onFillList, STATUS_LABEL } from "../lib/engine/status";
import { FloorMap, FloorMapLegend, type MapFixture } from "../components/FloorMap";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [plan, repl] = await Promise.all([loadFloorPlan(), loadReplenishment(admin)]);
  const byId = new Map(repl.fixtures.map((f) => [f.id, f]));

  const fixtures = plan.fixtures.flatMap((pf): (MapFixture & { slots: (typeof repl.fixtures)[number]["slots"] })[] => {
    if (!pf.rect) return [];
    const f = byId.get(pf.id);
    const slots = f?.slots ?? [];
    return [
      {
        id: pf.id,
        name: pf.name,
        zone: pf.zone,
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
  const [selected, setSelected] = useState<string | null>(null);
  const fixture = d.fixtures.find((f) => f.id === selected) ?? null;

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

      {fixture && (
        <s-section heading={fixture.name}>
          <s-paragraph>{fixture.status ? STATUS_LABEL[fixture.status] : "No floor scan yet"}</s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
