-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "palette" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slotCount" INTEGER NOT NULL,
    CONSTRAINT "Fixture_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CadenceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixtureType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sizeCounts" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixtureId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "colorFamily" TEXT NOT NULL,
    CONSTRAINT "Placement_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "epc" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_stock'
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "takenAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TagRead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanId" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "area" TEXT,
    "readAt" DATETIME NOT NULL,
    CONSTRAINT "TagRead_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GhostSuspect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "epc" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "confidence" REAL NOT NULL,
    "lastSeenArea" TEXT,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    CONSTRAINT "AuditLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesDaily" (
    "variantId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "units" INTEGER NOT NULL,

    PRIMARY KEY ("variantId", "date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_name_key" ON "Fixture"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceRule_fixtureType_category_key" ON "CadenceRule"("fixtureType", "category");

-- CreateIndex
CREATE INDEX "Placement_productId_idx" ON "Placement"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_fixtureId_slot_key" ON "Placement"("fixtureId", "slot");

-- CreateIndex
CREATE INDEX "Unit_variantId_idx" ON "Unit"("variantId");

-- CreateIndex
CREATE INDEX "TagRead_scanId_idx" ON "TagRead"("scanId");

-- CreateIndex
CREATE INDEX "TagRead_epc_idx" ON "TagRead"("epc");

-- CreateIndex
CREATE UNIQUE INDEX "GhostSuspect_epc_key" ON "GhostSuspect"("epc");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_idempotencyKey_key" ON "Proposal"("idempotencyKey");
