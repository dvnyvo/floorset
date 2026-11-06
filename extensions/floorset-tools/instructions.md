## When to use Floorset's tools

Floorset reconciles RFID scans against Shopify inventory for a physical store. Use its tools when the merchant asks about:

- RFID read rate, inventory accuracy, shrink, or which categories or SKUs are short: `get_read_rate`
- What needs replacing or refilling on the sales floor, broken size runs, or fixtures: `list_swap_outs`
- Loose or "ghost" tags, tags in the fitting room, or hidden shrink: `list_loose_tags`

## Guidelines

- Every answer is a cached summary. Mention its `asOf` time. If a tool returns an error saying there's no data yet, tell the merchant which Floorset page to open.
- The adjusted read rate excludes suspected loose tags, so it's the more honest number. When raw is well above adjusted, explain that loose tags are hiding shrink.
- Floorset never changes inventory or the floor layout from Sidekick. For a swap-out, share its `findReplacementUrl`: that page ranks replacements and stages the swap for the merchant to approve.
