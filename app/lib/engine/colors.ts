// The ten basic colors a product can be; each product's color name is one of these.
// tone: rough lightness 0 (dark) to 1 (light). hue: degrees on the color wheel, null for neutrals. Both feed contrast. group: for "darker / lighter / brighter".
export const COLORS = {
  black: { tone: 0, hue: null, hex: "#1f1f1f", group: "dark" },
  navy: { tone: 0.15, hue: 225, hex: "#1f2a44", group: "dark" },
  brown: { tone: 0.25, hue: 25, hex: "#5c4033", group: "dark" },
  green: { tone: 0.35, hue: 130, hex: "#3f6b45", group: "dark" },
  purple: { tone: 0.4, hue: 275, hex: "#7b4fa6", group: "bright" },
  red: { tone: 0.45, hue: 0, hex: "#c8312f", group: "bright" },
  grey: { tone: 0.6, hue: null, hex: "#9a9a9a", group: "light" },
  pink: { tone: 0.8, hue: 335, hex: "#f0a6c1", group: "bright" },
  beige: { tone: 0.88, hue: null, hex: "#e3d3b8", group: "light" },
  white: { tone: 1, hue: null, hex: "#f7f7f5", group: "light" },
} as const;

export type ColorFamily = keyof typeof COLORS;
export const COLOR_FAMILIES = Object.keys(COLORS) as ColorFamily[];
export const colorsIn = (group: "dark" | "light" | "bright") =>
  COLOR_FAMILIES.filter((c) => COLORS[c].group === group);
