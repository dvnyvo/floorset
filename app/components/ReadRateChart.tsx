// Read rate over time: all items against the weakest category, with the target line and the other
// categories as grey context lines.
// Inline SVG, because Polaris web components have no chart.
import { useState } from "react";
import type { TrendPoint } from "../lib/scans/reconcile";
import { cap, pct } from "../lib/format";

const W = 720;
const H = 240;
const M = { top: 12, right: 128, bottom: 28, left: 44 };
const INK = "#303030";
const MUTED = "#616161";
const GRID = "#e3e3e3";
const SERIES = ["#2a78d6", "#eb6834"]; // fixed order: all items, then the weakest category
const CONTEXT = "#c4c4c4"; // the other categories, behind the highlighted series

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ReadRateChart({ points, target }: { points: TrendPoint[]; target: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const last = points[points.length - 1];
  // The category with the lowest rate in the latest count is the one worth watching.
  const weakest = Object.entries(last.byCategory)
    .filter(([, r]) => r !== null)
    .sort(([, a], [, b]) => a! - b!)[0]?.[0];
  const series = [
    { name: "All items", color: SERIES[0], values: points.map((p) => p.adjustedRate) },
    ...(weakest ? [{ name: cap(weakest), color: SERIES[1], values: points.map((p) => p.byCategory[weakest] ?? null) }] : []),
  ];
  const others = Object.keys(last.byCategory)
    .filter((k) => k !== weakest)
    .map((k) => ({ name: cap(k), values: points.map((p) => p.byCategory[k] ?? null) }));

  const all = [...series, ...others].flatMap((s) => s.values).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(target, ...all) * 100 - 1) / 100;
  const step = 1 - lo > 0.1 ? 0.05 : 0.02;
  const ticks: number[] = [];
  for (let t = 1; t >= lo - 1e-9; t -= step) ticks.push(t);

  const x = (i: number) => M.left + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - M.left - M.right);
  const y = (v: number) => M.top + ((1 - v) / (1 - lo)) * (H - M.top - M.bottom);
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? "" : `${values[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .join("");

  // End labels sit at the line ends; if two would overlap, spread them apart.
  const ends = series.map((s) => ({ ...s, v: s.values[s.values.length - 1] })).filter((s) => s.v !== null);
  const labelY = ends.map((s) => y(s.v!));
  if (labelY.length === 2 && Math.abs(labelY[0] - labelY[1]) < 28) {
    const mid = (labelY[0] + labelY[1]) / 2;
    const up = labelY[0] <= labelY[1] ? 0 : 1;
    labelY[up] = mid - 14;
    labelY[1 - up] = mid + 14;
  }

  const every = Math.ceil(points.length / 8);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - M.left) / (W - M.left - M.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div style={{ position: "relative", maxWidth: W, color: INK, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
        {series.map((s) => (
          <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: s.color, display: "inline-block" }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Adjusted read rate over the last ${points.length} full counts. All items ${pct(last.adjustedRate)}${weakest ? `, ${cap(weakest)} ${pct(last.byCategory[weakest])}` : ""}, target ${pct(target)}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", fontFamily: "inherit" }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fill={MUTED} fontSize={11}>
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(target)} y2={y(target)} stroke={MUTED} strokeWidth={1} />
        <text x={M.left + 4} y={y(target) - 5} fill={MUTED} fontSize={11}>
          Target {pct(target)}
        </text>
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fill={MUTED} fontSize={11}>
              {day(p.date)}
            </text>
          ) : null,
        )}
        {others.map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={CONTEXT} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round">
            <title>{s.name}</title>
          </path>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke={MUTED} strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.name}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) =>
              v !== null && (i === hover || i === s.values.length - 1) ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              ) : null,
            )}
          </g>
        ))}
        {ends.map((s, i) => (
          <text key={s.name} x={W - M.right + 10} y={labelY[i] + 4} fill={INK} fontSize={12}>
            <tspan fontWeight={600}>{pct(s.v)}</tspan> {s.name}
          </text>
        ))}
      </svg>
      {weakest && (
        <div style={{ color: MUTED, marginTop: 4 }}>
          {cap(weakest)} is the weakest category on the latest count{others.length ? "; other categories in grey" : ""}.
        </div>
      )}
      {hover !== null && (
        <div
          style={{
            position: "absolute",
            top: 28,
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > points.length / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            background: "#fff",
            border: `1px solid ${GRID}`,
            borderRadius: 8,
            padding: "6px 10px",
            boxShadow: "0 2px 6px rgba(0,0,0,.12)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ color: MUTED }}>{day(points[hover].date)}</div>
          {series.map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 2, background: s.color, display: "inline-block" }} />
              {s.name} <strong>{pct(s.values[hover])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
