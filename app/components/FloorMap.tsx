// The sales floor as inline SVG, in floor plan units (see scripts/floor-plan.ts). No map library.
// Fixtures are colored by status and carry a text label too, so status never depends on color alone.
import { useState, type KeyboardEvent } from "react";
import { STATUS_LABEL, type FixtureStatus } from "../lib/engine/status";

type Rect = { x: number; y: number; w: number; h: number };

export interface MapFixture {
  id: string;
  name: string;
  zone: string;
  rect: Rect;
  status: FixtureStatus | null; // null before the first floor scan
  replace: number; // slots to replace
  fill: number; // slots on the fill list
}

export const STATUS_STYLE: Record<FixtureStatus | "none", { fill: string; stroke: string }> = {
  replace: { fill: "#fed3d1", stroke: "#c70a24" },
  fill: { fill: "#ffe8b0", stroke: "#946b00" },
  ok: { fill: "#f1f1f1", stroke: "#8a8a8a" },
  none: { fill: "#f1f1f1", stroke: "#8a8a8a" },
};

const INK = "#303030";
const MUTED = "#616161";
const SELECTED = "#2c6ecb";

/** "2 to replace", "3 to fill", "OK": the status in words on each fixture. */
export const shortStatus = (f: Pick<MapFixture, "status" | "replace" | "fill">) =>
  f.status === "replace" ? `${f.replace} to replace` : f.status === "fill" ? `${f.fill} to fill` : f.status === "ok" ? "OK" : "";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function describe(f: MapFixture) {
  if (!f.status) return f.name;
  const detail =
    f.status === "replace"
      ? `, ${plural(f.replace, "slot", "slots")} to replace`
      : f.status === "fill"
        ? `, ${plural(f.fill, "item", "items")} to fill`
        : "";
  return `${f.name}: ${STATUS_LABEL[f.status]}${detail}`;
}

export function FloorMap({
  size,
  zones,
  areas,
  fixtures,
  selected,
  onSelect,
}: {
  size: { w: number; h: number };
  zones: { name: string; rect: Rect }[];
  areas: { name: string; label: string; rect: Rect; looseTags: number }[];
  fixtures: MapFixture[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Space would scroll the page
      onSelect(id);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      width="100%"
      role="group"
      aria-label="Sales floor map. Each fixture is a button that opens its slots."
      style={{ display: "block", fontFamily: "inherit", background: "#fff" }}
    >
      <rect x={0.5} y={0.5} width={size.w - 1} height={size.h - 1} fill="none" stroke="#c9cccf" strokeWidth={0.3} rx={1} />

      {zones.map((z) => (
        <g key={z.name} aria-hidden>
          <rect x={z.rect.x} y={z.rect.y} width={z.rect.w} height={z.rect.h} fill="#fafafa" stroke="#c9cccf" strokeWidth={0.25} rx={0.8} />
          {/* Between the tables and the back rail: the one gap a label fits in. */}
          <text x={z.rect.x + z.rect.w / 2} y={z.rect.y + 22.8} textAnchor="middle" fill={MUTED} fontSize={2.2} fontWeight={600}>
            {z.name}
          </text>
        </g>
      ))}

      {areas.map((a) => {
        const badge = String(a.looseTags);
        const bw = 1.6 + badge.length * 1.25;
        return (
          <g key={a.name} role="img" aria-label={`${a.label}: ${plural(a.looseTags, "suspected loose tag", "suspected loose tags")}`}>
            <rect
              x={a.rect.x}
              y={a.rect.y}
              width={a.rect.w}
              height={a.rect.h}
              fill="#f6f6f7"
              stroke="#8a8a8a"
              strokeWidth={0.25}
              strokeDasharray="1 0.8"
              rx={0.8}
            />
            <text x={a.rect.x + 1.5} y={a.rect.y + a.rect.h / 2 + 0.8} fill={MUTED} fontSize={2.2}>
              {a.label}
            </text>
            {a.looseTags > 0 && (
              <g>
                <rect x={a.rect.x + a.rect.w - bw - 1} y={a.rect.y + a.rect.h / 2 - 1.6} width={bw} height={3.2} rx={1.6} fill={INK} />
                <text x={a.rect.x + a.rect.w - 1 - bw / 2} y={a.rect.y + a.rect.h / 2 + 0.75} textAnchor="middle" fill="#fff" fontSize={2} fontWeight={600}>
                  {badge}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {fixtures.map((f) => {
        const st = STATUS_STYLE[f.status ?? "none"];
        const short = f.name.slice(f.zone.length + 1); // "Rail 1"
        const rail = f.rect.w > f.rect.h * 2;
        const ring = f.id === selected || f.id === focused;
        return (
          <g
            key={f.id}
            role="button"
            tabIndex={0}
            aria-label={describe(f)}
            aria-pressed={f.id === selected}
            onClick={() => onSelect(f.id)}
            onKeyDown={(e) => onKey(e, f.id)}
            onFocus={() => setFocused(f.id)}
            onBlur={() => setFocused(null)}
            style={{ cursor: "pointer", outline: "none" }}
          >
            {ring && (
              <rect
                x={f.rect.x - 0.7}
                y={f.rect.y - 0.7}
                width={f.rect.w + 1.4}
                height={f.rect.h + 1.4}
                fill="none"
                stroke={SELECTED}
                strokeWidth={0.5}
                rx={1}
              />
            )}
            <rect x={f.rect.x} y={f.rect.y} width={f.rect.w} height={f.rect.h} fill={st.fill} stroke={st.stroke} strokeWidth={0.3} rx={0.5} />
            {rail ? (
              <text x={f.rect.x + f.rect.w / 2} y={f.rect.y + f.rect.h / 2 + 0.7} textAnchor="middle" fill={INK} fontSize={1.9}>
                {short}
                {f.status && <tspan fontWeight={600}> · {shortStatus(f)}</tspan>}
              </text>
            ) : (
              <text x={f.rect.x + f.rect.w / 2} y={f.rect.y + f.rect.h / 2 - 0.4} textAnchor="middle" fill={INK} fontSize={1.9}>
                {short}
                {f.status && (
                  <tspan x={f.rect.x + f.rect.w / 2} dy={2.6} fontWeight={600} fontSize={1.6}>
                    {shortStatus(f)}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Legend under the map: swatch plus words, and what the badges and short labels mean. */
export function FloorMapLegend() {
  const items: [FixtureStatus, string][] = [
    ["replace", "Needs replacing (“2 to replace”: slots to swap out)"],
    ["fill", "Needs fill (“3 to fill”: items to bring out)"],
    ["ok", "OK"],
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: 13, color: INK }}>
      {items.map(([s, label]) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{ width: 16, height: 12, borderRadius: 3, background: STATUS_STYLE[s].fill, border: `2px solid ${STATUS_STYLE[s].stroke}` }}
          />
          {label}
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden
          style={{ width: 22, height: 14, borderRadius: 7, background: INK }}
        />
        Loose tags found here (count of suspects in a non-sales area)
      </span>
    </div>
  );
}
