// Slot blocks shared by the fixture view and the floor map's fixture panel: each slot shows its role,
// the style name and color family, grouped the way the floor is merchandised.
import { Fragment, type ReactNode } from "react";
import { COLORS, type ColorFamily } from "../lib/engine/colors";
import { roleLabel, slotRoles } from "../lib/engine/roles";
import type { FixtureType } from "../lib/engine/types";
import { cap } from "../lib/format";

type SlotFixture = { type: FixtureType; zone: { department: string }; slots: { length: number } };

export function Block({
  item,
  highlight,
  flag,
}: {
  item: { title: string; colorFamily: string } | null;
  highlight?: boolean;
  flag?: string; // e.g. "Swap out": marks the slot in words, with a red outline
}) {
  return (
    <div
      title={item ? `${item.title} (${cap(item.colorFamily)})` : "Empty"}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "8px 6px",
        borderRadius: 6,
        background: item ? (COLORS[item.colorFamily as ColorFamily]?.hex ?? "#ccc") : "transparent",
        color: item && (COLORS[item.colorFamily as ColorFamily]?.tone ?? 1) < 0.5 ? "#fff" : "#1f1f1f",
        outline: flag ? "3px solid #c70a24" : highlight ? "3px solid #2c6ecb" : "1px solid #c9cccf",
        outlineOffset: highlight || flag ? 2 : 0,
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: "center",
        overflowWrap: "anywhere",
      }}
    >
      {item ? (
        <>
          {/* The style name says the kind ("Long Sleeve"); the category alone would read "top" in a cover-up slot. */}
          {item.title.split(" - ")[0]}
          <br />
          {cap(item.colorFamily)}
          {flag && (
            <>
              <br />
              <strong>{flag}</strong>
            </>
          )}
        </>
      ) : (
        "empty"
      )}
    </div>
  );
}

/**
 * Slots grouped the way the floor is merchandised: a gap between outfits (every 3 rail slots), a divider
 * between a table's tops and bottoms. Each slot is labelled with the role it needs.
 */
export function SlotRow({ fixture, render }: { fixture: SlotFixture; render: (i: number) => ReactNode }) {
  const roles = slotRoles(fixture.type, fixture.zone.department, fixture.slots.length);
  const tableSplit = Math.ceil(roles.length / 2);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {roles.map((role, i) => (
        <Fragment key={i}>
          {fixture.type === "rail" && i > 0 && i % 3 === 0 && <div aria-hidden style={{ width: 8, flexShrink: 0 }} />}
          {fixture.type === "table" && i === tableSplit && (
            <div aria-hidden style={{ flexShrink: 0, borderLeft: "2px dashed #8c9196", margin: "0 4px" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#616161", textAlign: "center", marginBottom: 4, overflowWrap: "anywhere" }}>
              {cap(roleLabel(role))}
            </div>
            {render(i)}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
