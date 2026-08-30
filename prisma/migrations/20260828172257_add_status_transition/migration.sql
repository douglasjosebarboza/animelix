-- CreateTable
CREATE TABLE "StatusTransition" (
    "id" TEXT NOT NULL,
    "watchEntryId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusTransition_watchEntryId_idx" ON "StatusTransition"("watchEntryId");

-- AddForeignKey
ALTER TABLE "StatusTransition" ADD CONSTRAINT "StatusTransition_watchEntryId_fkey" FOREIGN KEY ("watchEntryId") REFERENCES "WatchEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
