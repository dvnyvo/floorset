// Color families a style-color belongs to (a colorway like "Onyx" is in the black family).
// tone: rough lightness 0 (dark) to 1 (light). hue: degrees on the color wheel, null for neutrals. Both feed contrast. group: for "darker / lighter / brighter".
export const COLORS = {
  black: { tone: 0, hue: null, hex: "#1f1f1f", group: "dark" },
  navy: { tone: 0.15, hue: 225, hex: "#1f2a44", group: "dark" },
  espresso: { tone: 0.2, hue: 25, hex: "#4a3226", group: "dark" },
  burgundy: { tone: 0.25, hue: 345, hex: "#6d1f2e", group: "dark" },
  olive: { tone: 0.35, hue: 60, hex: "#6b6b3a", group: "dark" },
  blue: { tone: 0.45, hue: 215, hex: "#2f6fd0", group: "bright" },
  red: { tone: 0.45, hue: 0, hex: "#c8312f", group: "bright" },
  grey: { tone: 0.6, hue: null, hex: "#9a9a9a", group: "light" },
  pink: { tone: 0.8, hue: 335, hex: "#f0a6c1", group: "bright" },
  lilac: { tone: 0.8, hue: 270, hex: "#c3b1e1", group: "light" },
  cream: { tone: 0.92, hue: null, hex: "#efe6d2", group: "light" },
  white: { tone: 1, hue: null, hex: "#f7f7f5", group: "light" },
} as const;

export type ColorFamily = keyof typeof COLORS;
export const COLOR_FAMILIES = Object.keys(COLORS) as ColorFamily[];
export const colorsIn = (group: "dark" | "light" | "bright") =>
  COLOR_FAMILIES.filter((c) => COLORS[c].group === group);
