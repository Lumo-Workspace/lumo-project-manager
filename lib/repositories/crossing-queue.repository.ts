import { prisma } from '@/lib/db/prisma'
import { ACTIVE_MEMBER } from '@/lib/members/deactivation'
import {
  redactStoredFields,
  STORAGE_REDACTED_FIELDS,
} from '@/lib/security-scan/storage-redaction'

/**
 * LUM-1336: reads and writes behind the workspace Boundary Crossings tab — the
 * index-card queue of OPEN task crossings, each card's task context, and the
 * append-only tags. Eligibility (who may receive a card) is the service's
 * call; this layer only filters by the ids it is handed.
 */

/** Upper bound on one queue read — the tab orders in memory, so it is capped. */
export const QUEUE_READ_CAP = 500

export interface CreateCrossingTagInput {
  crossingId: string
  taggedMemberId: string
  taggedById: string
  message: string | null
}

export const crossingQueueRepository = {
  /** The viewer's role and HUMAN actor, or null for a deactivated member. */
  async findViewer(memberId: string, workspaceId: string) {
    return prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, ...ACTIVE_MEMBER },
      select: { id: true, role: true, actor: { select: { id: true } } },
    })
  },

  /**
   * OPEN task-scoped crossings in the workspace (trash excluded). With an
   * `assigneeActorId`, only crossings on tasks assigned to that actor. The
   * viewer's own latest tag (if any) rides along for "Tagged for me".
   */
  async findOpenQueueRows(input: {
    workspaceId: string
    assigneeActorId: string | null
    viewerMemberId: string
  }) {
    return prisma.boundaryCrossing.findMany({
      where: {
        disposition: null,
        taskId: { not: null },
        task: {
          workspaceId: input.workspaceId,
          deletedAt: null,
          ...(input.assigneeActorId
            ? { assigneeActorId: input.assigneeActorId }
            : {}),
        },
      },
      select: {
        id: true,
        number: true,
        category: true,
        severity: true,
        advisory: true,
        detail: true,
        detectedAt: true,
        lastSeenAt: true,
        occurrenceCount: true,
        task: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            projectId: true,
            team: { select: { identifier: true } },
            project: { select: { name: true } },
          },
        },
        tags: {
          where: { taggedMemberId: input.viewerMemberId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { taggedById: true, message: true, createdAt: true },
        },
      },
      orderBy: { detectedAt: 'asc' },
      take: QUEUE_READ_CAP,
    })
  },

  /** The fields a card action needs to decide eligibility, workspace-scoped. */
  async findCrossingForCard(crossingId: string, workspaceId: string) {
    return prisma.boundaryCrossing.findFirst({
      where: {
        id: crossingId,
        taskId: { not: null },
        task: { workspaceId, deletedAt: null },
      },
      select: {
        id: true,
        taskId: true,
        disposition: true,
        task: { select: { assigneeActorId: true } },
      },
    })
  },

  /** The task fields a card shows (the face and the full spec). */
  async findCardTask(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        status: true,
        team: { select: { identifier: true } },
        project: { select: { name: true } },
        milestone: { select: { name: true } },
        sprint: { select: { name: true } },
        assignee: { select: { memberId: true } },
      },
    })
  },

  /** The task's test cases (its acceptance checks), each with its latest run. */
  async listCardTestCases(taskId: string) {
    return prisma.testCase.findMany({
      where: { taskId, deletedAt: null },
      select: {
        number: true,
        title: true,
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { result: true, createdAt: true },
        },
      },
      orderBy: { number: 'asc' },
    })
  },

  /** Every PR linked to the task, newest first. */
  async listCardPullRequests(taskId: string) {
    return prisma.pullRequest.findMany({
      where: { taskId },
      select: {
        number: true,
        title: true,
        url: true,
        state: true,
        repo: true,
        headBranch: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** Active OWNERs of the workspace plus the member behind `assigneeActorId`. */
  async findRulerMemberIds(
    workspaceId: string,
    assigneeActorId: string | null
  ) {
    return prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        ...ACTIVE_MEMBER,
        OR: [
          { role: 'OWNER' },
          ...(assigneeActorId ? [{ actor: { id: assigneeActorId } }] : []),
        ],
      },
      select: { id: true, role: true },
    })
  },

  async createTag(input: CreateCrossingTagInput) {
    // The message is free text a human typed — stored credential-redacted
    // like every other note column (LUM-898).
    const stored = redactStoredFields(
      { message: input.message },
      STORAGE_REDACTED_FIELDS.boundaryCrossingTag
    )
    return prisma.boundaryCrossingTag.create({
      data: { ...input, message: stored.message },
      select: { id: true, createdAt: true },
    })
  },

  /** Every tag on a crossing, oldest first — who handed it to whom. */
  async listTagsForCrossing(crossingId: string) {
    return prisma.boundaryCrossingTag.findMany({
      where: { crossingId },
      select: {
        id: true,
        taggedMemberId: true,
        taggedById: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
  },
}
