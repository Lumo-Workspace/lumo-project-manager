-- LUM-1336: the Boundary Crossings queue tab. A tag hands an open crossing to
-- a member who may rule on it; CROSSING_TAGGED is its in-app notification.
-- Additive: a new enum value and a new table, no existing row changes.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CROSSING_TAGGED';

-- CreateTable
CREATE TABLE "boundary_crossing_tags" (
    "id" TEXT NOT NULL,
    "crossingId" TEXT NOT NULL,
    "taggedMemberId" TEXT NOT NULL,
    "taggedById" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boundary_crossing_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boundary_crossing_tags_crossingId_createdAt_idx" ON "boundary_crossing_tags"("crossingId", "createdAt");

-- CreateIndex
CREATE INDEX "boundary_crossing_tags_taggedMemberId_createdAt_idx" ON "boundary_crossing_tags"("taggedMemberId", "createdAt");

-- AddForeignKey
ALTER TABLE "boundary_crossing_tags" ADD CONSTRAINT "boundary_crossing_tags_crossingId_fkey" FOREIGN KEY ("crossingId") REFERENCES "boundary_crossings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boundary_crossing_tags" ADD CONSTRAINT "boundary_crossing_tags_taggedMemberId_fkey" FOREIGN KEY ("taggedMemberId") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boundary_crossing_tags" ADD CONSTRAINT "boundary_crossing_tags_taggedById_fkey" FOREIGN KEY ("taggedById") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

