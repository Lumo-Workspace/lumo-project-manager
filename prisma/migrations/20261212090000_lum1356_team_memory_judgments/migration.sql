-- LUM-1356: team memory judgments, phase 1 (candidates, review, withdrawal).
-- Additive only: nine new enum types, two new workspaces columns with defaults,
-- three new tables. Nothing existing is altered, renamed or dropped; the
-- memories table is untouched.


-- CreateEnum
CREATE TYPE "JudgmentMode" AS ENUM ('OFF', 'REVIEW', 'CUTOVER');

-- CreateEnum
CREATE TYPE "JudgmentAdmission" AS ENUM ('ANY_MEMBER', 'OWNER_ONLY');

-- CreateEnum
CREATE TYPE "JudgmentKind" AS ENUM ('CONDITIONAL_GUIDANCE', 'CASE', 'HYPOTHESIS', 'CONSTRAINT');

-- CreateEnum
CREATE TYPE "JudgmentPolarity" AS ENUM ('PREFER', 'AVOID');

-- CreateEnum
CREATE TYPE "JudgmentOrigin" AS ENUM ('HUMAN_GUIDANCE', 'HUMAN_JUDGMENT', 'AGENT_JUDGMENT', 'AGENT_ASSUMPTION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JudgmentChannel" AS ENUM ('WEB', 'CLI', 'PIPELINE');

-- CreateEnum
CREATE TYPE "JudgmentCaptureMethod" AS ENUM ('EXPLICIT', 'EXTRACTED', 'IMPORTED', 'MIGRATED');

-- CreateEnum
CREATE TYPE "JudgmentRevisionState" AS ENUM ('PROPOSED', 'CHANGES_REQUESTED', 'REJECTED', 'EXPIRED', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JudgmentEventType" AS ENUM ('PROPOSED', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'WITHDRAWN', 'EXPIRED', 'CONFLICT_FLAGGED', 'CONFLICT_RESOLVED', 'CHALLENGED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "judgmentAdmission" "JudgmentAdmission" NOT NULL DEFAULT 'ANY_MEMBER',
ADD COLUMN     "judgmentMode" "JudgmentMode" NOT NULL DEFAULT 'OFF';

-- CreateTable
CREATE TABLE "judgments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "judgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgment_revisions" (
    "id" TEXT NOT NULL,
    "judgmentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "baseRevisionId" TEXT,
    "description" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "kind" "JudgmentKind" NOT NULL,
    "rationale" TEXT,
    "polarity" "JudgmentPolarity",
    "assertionKey" TEXT,
    "assertionValue" JSONB,
    "scopeRepo" TEXT,
    "scopePathGlobs" JSONB,
    "scopeTopic" TEXT,
    "when" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "origin" "JudgmentOrigin" NOT NULL,
    "judgedByMemberId" TEXT,
    "judgedByLabel" TEXT,
    "recordedByMemberId" TEXT,
    "recordedByAgent" "TaskArtifactAgent",
    "recordedVia" "JudgmentChannel" NOT NULL,
    "captureMethod" "JudgmentCaptureMethod" NOT NULL,
    "sourceSessionId" TEXT,
    "sourceTaskId" TEXT,
    "sourceRefs" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "context" JSONB,
    "alternatives" JSONB,
    "expectedOutcome" JSONB,
    "state" "JudgmentRevisionState" NOT NULL DEFAULT 'PROPOSED',
    "legacyMemoryId" TEXT,
    "contentSignals" JSONB,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "judgment_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgment_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "judgmentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "revisionDigest" TEXT,
    "type" "JudgmentEventType" NOT NULL,
    "actorMemberId" TEXT,
    "channel" "JudgmentChannel" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "judgment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "judgments_workspaceId_projectId_idx" ON "judgments"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "judgments_workspaceId_name_key" ON "judgments"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "judgment_revisions_workspaceId_state_idx" ON "judgment_revisions"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "judgment_revisions_workspaceId_assertionKey_idx" ON "judgment_revisions"("workspaceId", "assertionKey");

-- CreateIndex
CREATE UNIQUE INDEX "judgment_revisions_judgmentId_version_key" ON "judgment_revisions"("judgmentId", "version");

-- CreateIndex
CREATE INDEX "judgment_events_judgmentId_createdAt_idx" ON "judgment_events"("judgmentId", "createdAt");

-- CreateIndex
CREATE INDEX "judgment_events_workspaceId_type_createdAt_idx" ON "judgment_events"("workspaceId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgment_revisions" ADD CONSTRAINT "judgment_revisions_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "judgments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgment_events" ADD CONSTRAINT "judgment_events_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "judgments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
