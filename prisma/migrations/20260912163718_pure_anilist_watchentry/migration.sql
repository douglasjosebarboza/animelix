/*
  Warnings:

  - You are about to drop the column `animeId` on the `WatchEntry` table. All the data in the column will be lost.
  - You are about to drop the `Anime` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,anilistId]` on the table `WatchEntry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `anilistId` to the `WatchEntry` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "WatchEntry" DROP CONSTRAINT "WatchEntry_animeId_fkey";

-- DropIndex
DROP INDEX "WatchEntry_userId_animeId_key";

-- AlterTable
ALTER TABLE "WatchEntry" DROP COLUMN "animeId",
ADD COLUMN     "anilistId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Anime";

-- CreateIndex
CREATE UNIQUE INDEX "WatchEntry_userId_anilistId_key" ON "WatchEntry"("userId", "anilistId");
