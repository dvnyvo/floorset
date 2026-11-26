// Made-up store floor plan for the map page, in plan units (1 unit ≈ 0.5 m). The front door is at the bottom.
// Zones hold the fixtures; areas are non-sales spots where loose tags turn up. Area names match the scanner's
// area names so loose-tag suspects can be counted per area. No runtime imports, so plain node can run it.

export interface Rect { x: number; y: number; w: number; h: number }
export interface PlanArea extends Rect { name: string; label: string }

export const PLAN_SIZE = { w: 122, h: 78 };

const ZONE_W = 28;
const ZONE_H = 30;

export const ZONE_RECTS: Record<string, Rect> = {
  "Zone 1": { x: 2, y: 10, w: ZONE_W, h: ZONE_H },
  "Zone 2": { x: 32, y: 10, w: ZONE_W, h: ZONE_H },
  "Zone 3": { x: 62, y: 10, w: ZONE_W, h: ZONE_H },
  "Zone 4": { x: 92, y: 10, w: ZONE_W, h: ZONE_H },
  "Men's": { x: 2, y: 44, w: ZONE_W, h: ZONE_H },
};

export const AREAS: PlanArea[] = [
  { name: "Back Corridor", label: "Back corridor", x: 2, y: 2, w: 118, h: 6 },
  { name: "Fitting Room", label: "Fitting room", x: 32, y: 44, w: 28, h: 16 },
  { name: "Cash Wrap", label: "Cash wrap", x: 62, y: 44, w: 28, h: 12 },
  { name: "Entrance Corner", label: "Entrance", x: 92, y: 62, w: 28, h: 12 },
];

// Inside each zone: rails run along the top and bottom edges, the two tables sit side by side between them.
const FIXTURE_OFFSETS: Record<string, Rect> = {
  "Rail 1": { x: 2, y: 2, w: 24, h: 3 },
  "Rail 2": { x: 2, y: 25, w: 24, h: 3 },
  "Table 1": { x: 3, y: 10, w: 9, h: 9 },
  "Table 2": { x: 16, y: 10, w: 9, h: 9 },
};

/** A fixture's rectangle, from its zone and its name ("Zone 1 Rail 2" -> "Rail 2"). */
export function fixtureRect(zone: string, fixtureName: string): Rect {
  const z = ZONE_RECTS[zone];
  const o = FIXTURE_OFFSETS[fixtureName.slice(zone.length + 1)];
  if (!z || !o) throw new Error(`No floor plan position for ${fixtureName}`);
  return { x: z.x + o.x, y: z.y + o.y, w: o.w, h: o.h };
}
