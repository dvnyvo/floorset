# Build log

Real timestamps (local time) of each step, newest last.

| Date & time | What was done |
|---|---|
| 2026-10-17 13:12 | Scaffolded the Shopify app (React Router, TypeScript) with the Shopify CLI. |
| 2026-10-17 13:48 | Added Prisma models for zones, fixtures, cadence rules, placements, RFID units, scans, tag reads, ghost suspects, proposals, audit log and daily sales. |
| 2026-10-18 15:30 | Added a deterministic synthetic-data generator (150 products, 20 fixtures, cadence rules, RFID units, 8 weeks of sales, planted problems) and zone departments. |
| 2026-10-20 20:45 | Seeded the dev store through the Shopify CLI: one bulk productSet (150 products, 900 variants, $app metafields, inventory), damaged stock moved with compare-and-swap + idempotency key, local DB filled with layout, RFID units and sales. |
| 2026-10-22 21:10 | Added the synthetic RFID scan generator: 3 weekly full counts and 4 morning floor scans as CSVs, with planted shrink (bras below 95%) and loose tags (fitting room, entrance corner cluster, sold-but-read). Phase 1 complete. |
| 2026-10-24 16:35 | Built the replacement rules engine as pure functions: stock filters, visual standards (palette, adjacency, category cap), weighted scoring, ranking with plain-English reasons and rejections; 34 Vitest unit tests passing. Phase 2 complete. |
| 2026-10-25 18:15 | Scans and replenishment: CSV upload with row validation, reconciliation against Shopify on-hand (raw and adjusted read rate, sub-95% flags by category and SKU, SKUs short week after week), floor replenishment fill list with swap-out flags; removed template demo pages. Phase 3 complete. |
| 2026-10-28 20:30 | Made the seed rerunnable (deletes previously seeded products first) and gave unplaced styles deeper back stock so most swap-outs have valid replacements; reseeded the dev store. |
| 2026-10-28 21:25 | Proposal flow for fixture swaps: propose (deduped) -> approve and apply -> audit log -> undo. Writes the $app.placement product metafield with compareDigest compare-and-swap and refuses stale or double applies. Verified against the dev store. |
| 2026-10-28 22:10 | Candidate loader for the rules engine (back stock from the latest floor scan, 28-day sales velocity), shared floor state for replenishment, URL-backed ranking preferences. |
| 2026-10-28 22:55 | Fixture swap view (before/after color blocks, top 3 picks with reasons, rejections with the failed rule, refine buttons, proposals with approve/undo) and a Claude copilot that re-ranks via tool calls and can only propose engine-approved picks. Phase 4 complete. |
| 2026-10-30 19:15 | Hid the copilot panel unless an Anthropic API key is configured; the fixture view works fully without it. |
| 2026-11-01 15:40 | Expanded colors to 12 families (black, navy, espresso, burgundy, olive, blue, red, grey, pink, lilac, cream, white) with new zone palettes and reseeded; added a lenient fallback that offers items able to fill the size run once when nothing has 2x back stock; labeled before/after rows with the fixture name. |
| 2026-11-03 20:05 | Loose-tag detector: sold-but-read, read outside the sales floor, same off-floor spot in 3+ scans, and staff 'searched, nothing there', combined into a confidence score. On the synthetic scans: 26 flagged, 26 planted, 0 false alarms; tags dropped at their own fixture stay undetectable by design. |
| 2026-11-03 21:20 | Loose tags page: hotspots, sweep list by area, resolve flow (tag only / garment here / nothing there), and Shopify inventory corrections through the proposal flow (inventoryAdjustQuantities with changeFromQuantity and an idempotency key, undoable). Detection re-runs on every scan upload. Phase 5 complete. |
| 2026-11-05 20:50 | Cached Sidekick summaries (read rate, swap-outs with deep links, loose tags) saved as pages load, served by an authenticated, CORS-enabled API route; measured under 1 ms per read and under 800 tokens per answer. |
| 2026-11-05 21:45 | Sidekick app data extension with three read-only tools (get_read_rate, list_swap_outs, list_loose_tags) and the [sidekick] summary. Skipped the action extension: Shopify's intent types are a fixed list with no fit for a fixture swap, so swap-outs link to the fixture page instead. Phase 6 complete. |

## 2026-11-07 13:25 — README and CI
Full README (problem, demo script, architecture diagram, design decisions, results on synthetic data, scale notes, setup). GitHub Actions workflow runs lint, typecheck and tests. Removed the template changelog.

## 2026-11-08 16:10 — Fix Sidekick extension API version
The generated extension pinned 2025-10, which Admin app tools data no longer accepts. Moved to 2026-10.
