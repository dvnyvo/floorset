# Build log

 What was done |

Scaffolded the Shopify app (React Router, TypeScript) with the Shopify CLI. |
 Added Prisma models for zones, fixtures, cadence rules, placements, RFID units, scans, tag reads, ghost suspects, proposals, audit log and daily sales. |
 Added a deterministic synthetic-data generator (150 products, 20 fixtures, cadence rules, RFID units, 8 weeks of sales, planted problems) and zone departments. |
 Seeded the dev store through the Shopify CLI: one bulk productSet (150 products, 900 variants, $app metafields, inventory), damaged stock moved with compare-and-swap + idempotency key, local DB filled with layout, RFID units and sales. |
 Added the synthetic RFID scan generator: 3 weekly full counts and 4 morning floor scans as CSVs, with planted shrink (bras below 95%) and loose tags (fitting room, entrance corner cluster, sold-but-read). Phase 1 complete. |
 Built the replacement rules engine as pure functions: stock filters, visual standards (palette, adjacency, category cap), weighted scoring, ranking with plain-English reasons and rejections; 34 Vitest unit tests passing. Phase 2 complete. |
 Scans and replenishment: CSV upload with row validation, reconciliation against Shopify on-hand (raw and adjusted read rate, sub-95% flags by category and SKU, SKUs short week after week), floor replenishment fill list with swap-out flags; removed template demo pages. Phase 3 complete. |
 Made the seed rerunnable (deletes previously seeded products first) and gave unplaced styles deeper back stock so most swap-outs have valid replacements; reseeded the dev store. |
 Proposal flow for fixture swaps: propose (deduped) -> approve and apply -> audit log -> undo. Writes the $app.placement product metafield with compareDigest compare-and-swap and refuses stale or double applies. Verified against the dev store. |
 Candidate loader for the rules engine (back stock from the latest floor scan, 28-day sales velocity), shared floor state for replenishment, URL-backed ranking preferences. |
Fixture swap view (before/after color blocks, top 3 picks with reasons, rejections with the failed rule, refine buttons, proposals with approve/undo) and a Claude copilot that re-ranks via tool calls and can only propose engine-approved picks. Phase 4 complete. |
 Hid the copilot panel unless an Anthropic API key is configured; the fixture view works fully without it. |
 Expanded colors to 12 families (black, navy, espresso, burgundy, olive, blue, red, grey, pink, lilac, cream, white) with new zone palettes and reseeded; added a lenient fallback that offers items able to fill the size run once when nothing has 2x back stock; labeled before/after rows with the fixture name. |
 Loose-tag detector: sold-but-read, read outside the sales floor, same off-floor spot in 3+ scans, and staff 'searched, nothing there', combined into a confidence score. On the synthetic scans: 26 flagged, 26 planted, 0 false alarms; tags dropped at their own fixture stay undetectable by design. |
 Loose tags page: hotspots, sweep list by area, resolve flow (tag only / garment here / nothing there), and Shopify inventory corrections through the proposal flow (inventoryAdjustQuantities with changeFromQuantity and an idempotency key, undoable). Detection re-runs on every scan upload. Phase 5 complete. |
 Cached Sidekick summaries (read rate, swap-outs with deep links, loose tags) saved as pages load, served by an authenticated, CORS-enabled API route; measured under 1 ms per read and under 800 tokens per answer. |
 Sidekick app data extension with three read-only tools (get_read_rate, list_swap_outs, list_loose_tags) and the [sidekick] summary. Skipped the action extension: Shopify's intent types are a fixed list with no fit for a fixture swap, so swap-outs link to the fixture page instead. Phase 6 complete. |

 README and CI
Full README (problem, demo script, architecture diagram, design decisions, results on synthetic data, scale notes, setup). GitHub Actions workflow runs lint, typecheck and tests. Removed the template changelog.

Fix Sidekick extension API version
The generated extension pinned 2025-10, which Admin app tools data no longer accepts. Moved to 2026-10.

 Browser pass through the admin
Clicked through every page in the Shopify admin, including swap and correction approve/undo and a Sidekick question. Fixed the page-header buttons, which Polaris only accepts as primary.

 More scan history and a messy test file
The generator now writes 8 weekly full counts (bra theft builds up week by week) and a deliberately bad reader export. Tests parse every generated file.

 Read-rate snapshots and trend chart
Each full count freezes its read rate per category on upload. The dashboard charts the rate over time (all items against the weakest category, with the target line) and Sidekick gets the trend.

 Webhooks and catalog cache
The catalog is cached and dropped by inventory and product webhooks and by the app's own writes. New orders add to the daily sales rollup, each delivery counted once. README updated.

 Order webhook off by default
Shopify refused the orders/create subscription: order webhooks need protected customer data access. The handler stays, the subscription and read_orders scope are commented out, and the README says so.

 Order webhook on
Enabled the `orders/create` webhook. Protected customer data access was selected for the app in the Partner Dashboard (development stores need no review), so Shopify now accepts the subscription and the `read_orders` scope. README and seed comment updated to match.

 Order webhook verified
Placed test order #1001 (1 x Alder Tee, Bone, XS) in the dev store. The `orders/create` delivery was recorded once and added 1 unit to that variant's daily sales for 2026-11-16.

 Wider read-rate gap, README notes
The scan generator now plants theft from back stock with the cut tags dumped in four off-floor spots (4% of units), and the reader hit rate is 96.5%. The latest count reads 96.1% raw against 92.3% adjusted; 235 of 257 planted loose tags are flagged with no false alarms, and replenishment still finds 7 swap-outs. Scans were reloaded oldest first so every snapshot is exact. README: new numbers, notes on Admin API rate limits and webhook backfills, and a Future work section. Test order #1001 was cancelled with restock.

 On GitHub, CI green
Pushed to a private GitHub repository. The CI workflow (lint, typecheck, tests) passed on the first run; CI badge added to the README.
