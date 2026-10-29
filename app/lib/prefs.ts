// Ranking preferences <-> URL search params, so a refined view is shareable and the copilot can set it.
import type { ColorFamily, Preferences } from "./engine/types";

export const COLOR_FAMILIES: ColorFamily[] = ["black", "neutral", "bright", "pastel", "earth"];
export const CATEGORIES = ["legging", "bra", "top", "outerwear", "short", "jogger"];
const CONTRAST_BOOST = 0.45; // "more contrast": weight up from the default 0.15

export interface PrefsInput {
  category?: string;
  colorFamilies?: string[];
  contrastBoost?: boolean;
}

/** Drops anything unknown, so prefs from a URL or the model can only narrow the ranking. */
export function toPreferences(p: PrefsInput): Preferences {
  const out: Preferences = {};
  if (p.category && CATEGORIES.includes(p.category)) out.category = p.category;
  const colors = (p.colorFamilies ?? []).filter((c): c is ColorFamily => COLOR_FAMILIES.includes(c as ColorFamily));
  if (colors.length) out.colorFamilies = colors;
  if (p.contrastBoost) out.weights = { contrast: CONTRAST_BOOST };
  return out;
}

export function prefsFromParams(sp: URLSearchParams): Preferences {
  return toPreferences({
    category: sp.get("category") ?? undefined,
    colorFamilies: sp.get("colors")?.split(",") ?? [],
    contrastBoost: sp.get("contrast") === "1",
  });
}

export function prefsToParams(p: Preferences, sp = new URLSearchParams()) {
  for (const k of ["category", "colors", "contrast"]) sp.delete(k);
  if (p.category) sp.set("category", p.category);
  if (p.colorFamilies?.length) sp.set("colors", p.colorFamilies.join(","));
  if (p.weights?.contrast) sp.set("contrast", "1");
  return sp;
}
