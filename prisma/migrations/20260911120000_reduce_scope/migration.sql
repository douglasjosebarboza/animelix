-- Reduce WatchEntry.status to watching/completed only
UPDATE "WatchEntry" SET "status" = 'watching' WHERE "status" NOT IN ('watching', 'completed');

-- Alter default for new rows
ALTER TABLE "WatchEntry" ALTER COLUMN "status" SET DEFAULT 'watching';

-- Drop StatusTransition table
DROP TABLE IF EXISTS "StatusTransition";
