// Display helpers shared by the read-rate page and chart, the fixture view, and the scan page.

/** "bra" -> "Bra" for category and color names shown as labels. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Always one decimal: 0.95 -> "95.0%", 0.9612 -> "96.1%". */
export const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);
