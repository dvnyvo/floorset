// Display helpers shared by the read-rate page and chart, the fixture view, and the scan page.

/** "bra" -> "Bra" for category and color names shown as labels. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Sizes with a count, in size order: "S 1 · M 2", or "—" when empty. */
export const sizeList = (c: Partial<Record<string, number>>, order: readonly string[]) =>
  order
    .filter((s) => c[s])
    .map((s) => `${s} ${c[s]}`)
    .join(" · ") || "—";

/** Always one decimal: 0.95 -> "95.0%", 0.9612 -> "96.1%". */
export const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);
