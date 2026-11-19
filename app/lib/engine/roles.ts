// Outfit roles. Rails are merchandised as outfits: every 3 consecutive slots form one outfit, and each slot
// has a role. No runtime imports, so the seed script (plain node) can use it too.
import type { FixtureType } from "./types";

export type Role = "top" | "bottom" | "coverup";

// Product kinds by role. A long sleeve is a cover-up even though its category is top.
const KIND_ROLE: Record<string, Role> = {
  bra: "top", tank: "top", tee: "top", shirt: "top", top: "top",
  legging: "bottom", short: "bottom", jogger: "bottom", trouser: "bottom",
  jacket: "coverup", "long sleeve": "coverup", hoodie: "coverup", outerwear: "coverup",
};
export const roleOf = (kind: string): Role | undefined => KIND_ROLE[kind.toLowerCase()];

const RAIL_SEQUENCE: Record<string, Role[]> = {
  womens: ["top", "bottom", "coverup"],
  mens: ["coverup", "top", "bottom"],
};

/** The roles each slot accepts, left to right. Rails repeat the department's outfit; tables split left/right. */
export function slotRoles(type: FixtureType, department: string, slotCount: number): Role[][] {
  const seq = RAIL_SEQUENCE[department] ?? RAIL_SEQUENCE.womens;
  return Array.from({ length: slotCount }, (_, i) =>
    type === "rail" ? [seq[i % seq.length]] : i < slotCount / 2 ? ["top", "coverup"] : ["bottom"],
  );
}

/** "top → bottom → cover-up" for rails, the left/right rule for tables. */
export function sequenceText(type: FixtureType, department: string) {
  return type === "rail"
    ? (RAIL_SEQUENCE[department] ?? RAIL_SEQUENCE.womens).map((r) => ROLE_LABEL[r]).join(" → ")
    : "tops and cover-ups on the left, bottoms on the right";
}

const ROLE_LABEL: Record<Role, string> = { top: "top", bottom: "bottom", coverup: "cover-up" };
/** "cover-up", "top or cover-up". */
export const roleLabel = (roles: Role[]) => roles.map((r) => ROLE_LABEL[r]).join(" or ");
