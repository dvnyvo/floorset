// Writes the floor plan (zone, fixture and area rectangles) into an already-seeded database without touching
// Shopify, products, stock or scans. A full `npm run seed` writes the same plan.
import { PrismaClient } from "@prisma/client";
import { AREAS, fixtureRect, ZONE_RECTS } from "./floor-plan.ts";

const db = new PrismaClient();
try {
  const zones = await db.zone.findMany({ include: { fixtures: true } });
  await db.$transaction([
    ...zones.map((z) => db.zone.update({ where: { id: z.id }, data: ZONE_RECTS[z.name] })),
    ...zones.flatMap((z) => z.fixtures.map((f) => db.fixture.update({ where: { id: f.id }, data: fixtureRect(z.name, f.name) }))),
    db.floorArea.deleteMany(),
    db.floorArea.createMany({ data: AREAS }),
  ]);
  console.log(`floor plan: ${zones.length} zones, ${zones.reduce((n, z) => n + z.fixtures.length, 0)} fixtures, ${AREAS.length} areas`);
} finally {
  await db.$disconnect();
}
