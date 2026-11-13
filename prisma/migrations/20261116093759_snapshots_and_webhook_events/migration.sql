-- CreateTable
CREATE TABLE "ReadRateSnapshot" (
    "scanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "raw" INTEGER NOT NULL,
    "adjusted" INTEGER NOT NULL,

    PRIMARY KEY ("scanId", "category"),
    CONSTRAINT "ReadRateSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
