-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'womens',
    "palette" JSONB NOT NULL
);
INSERT INTO "new_Zone" ("id", "name", "palette") SELECT "id", "name", "palette" FROM "Zone";
DROP TABLE "Zone";
ALTER TABLE "new_Zone" RENAME TO "Zone";
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
