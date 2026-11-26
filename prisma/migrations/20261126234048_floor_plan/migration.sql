-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN "h" REAL;
ALTER TABLE "Fixture" ADD COLUMN "w" REAL;
ALTER TABLE "Fixture" ADD COLUMN "x" REAL;
ALTER TABLE "Fixture" ADD COLUMN "y" REAL;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN "h" REAL;
ALTER TABLE "Zone" ADD COLUMN "w" REAL;
ALTER TABLE "Zone" ADD COLUMN "x" REAL;
ALTER TABLE "Zone" ADD COLUMN "y" REAL;

-- CreateTable
CREATE TABLE "FloorArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "w" REAL NOT NULL,
    "h" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FloorArea_name_key" ON "FloorArea"("name");
