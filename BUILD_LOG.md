# Build log

Real timestamps (local time) of each step, newest last.

| Date & time | What was done |
|---|---|
| 2026-10-17 13:12 | Scaffolded the Shopify app (React Router, TypeScript) with the Shopify CLI. |
| 2026-10-17 13:48 | Added Prisma models for zones, fixtures, cadence rules, placements, RFID units, scans, tag reads, ghost suspects, proposals, audit log and daily sales. |
| 2026-10-18 15:30 | Added a deterministic synthetic-data generator (150 products, 20 fixtures, cadence rules, RFID units, 8 weeks of sales, planted problems) and zone departments. |
| 2026-10-20 20:45 | Seeded the dev store through the Shopify CLI: one bulk productSet (150 products, 900 variants, $app metafields, inventory), damaged stock moved with compare-and-swap + idempotency key, local DB filled with layout, RFID units and sales. |
