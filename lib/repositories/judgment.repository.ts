import { Prisma } from '@prisma/client'
import type {
  JudgmentCaptureMethod,
  JudgmentChannel,
  JudgmentEventType,
  JudgmentKind,
  JudgmentOrigin,
  JudgmentPolarity,
  JudgmentRevisionState,
  TaskArtifactAgent,
} from '@prisma/client'
import { scopedPrisma, unscoped } from '@/lib/db/workspace-scope'
import { contentSignalsData } from '@/lib/repositories/content-signals-column'
import type { ContentSignals } from '@/shared/src/untrusted-content'

/**
 * LUM-1356 — team memory judgments: the stable identity (`judgments`), its
 * immutable revisions and the append-only governance events.
 *
 * Every method takes the workspace id and pins it in the query; the client is
 * `scopedPrisma`, so a query that forgets it is rejected. State changes are
 * conditional updates that report how many rows they changed — the service
 * decides what a zero means.
 */

type Tx = Prisma.TransactionClient

/** Revision columns without `embedding` (an Unsupported column Prisma cannot select). */
const REVISION_SELECT = {
  id: true,
  judgmentId: true,
  workspaceId: true,
  version: true,
  digest: true,
  baseRevisionId: true,
  description: true,
  statement: true,
  kind: true,
  rationale: true,
  polarity: true,
  assertionKey: true,
  assertionValue: true,
  scopeRepo: true,
  scopePathGlobs: true,
  scopeTopic: true,
  when: true,
  limits: true,
  validFrom: true,
  validUntil: true,
  origin: true,
  judgedByMemberId: true,
  judgedByLabel: true,
  recordedByMemberId: true,
  recordedByAgent: true,
  recordedVia: true,
  captureMethod: true,
  sourceSessionId: true,
  sourceTaskId: true,
  sourceRefs: true,
  evidence: true,
  context: true,
  alternatives: true,
  expectedOutcome: true,
  state: true,
  legacyMemoryId: true,
  contentSignals: true,
  createdAt: true,
} satisfies Prisma.JudgmentRevisionSelect

export type JudgmentRevisionRow = Prisma.JudgmentRevisionGetPayload<{
  select: typeof REVISION_SELECT
}>

const JUDGMENT_SELECT = {
  id: true,
  workspaceId: true,
  projectId: true,
  name: true,
  activeRevisionId: true,
  pausedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JudgmentSelect

export type JudgmentRow = Prisma.JudgmentGetPayload<{
  select: typeof JUDGMENT_SELECT
}>

const EVENT_SELECT = {
  id: true,
  judgmentId: true,
  revisionId: true,
  revisionDigest: true,
  type: true,
  actorMemberId: true,
  channel: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.JudgmentEventSelect

export type JudgmentEventRow = Prisma.JudgmentEventGetPayload<{
  select: typeof EVENT_SELECT
}>

export interface NewJudgmentRevision {
  judgmentId: string
  workspaceId: string
  version: number
  digest: string
  baseRevisionId: string | null
  description: string
  statement: string
  kind: JudgmentKind
  rationale: string | null
  polarity: JudgmentPolarity | null
  assertionKey: string | null
  assertionValue: Prisma.InputJsonValue | null
  scopeRepo: string | null
  scopePathGlobs: string[] | null
  scopeTopic: string | null
  when: Prisma.InputJsonValue
  limits: string[]
  validFrom: Date | null
  validUntil: Date | null
  origin: JudgmentOrigin
  judgedByMemberId: string | null
  judgedByLabel: string | null
  recordedByMemberId: string | null
  recordedByAgent: TaskArtifactAgent | null
  recordedVia: JudgmentChannel
  captureMethod: JudgmentCaptureMethod
  sourceSessionId: string | null
  sourceTaskId: string | null
  sourceRefs: string[]
  evidence: Prisma.InputJsonValue
  context: Prisma.InputJsonValue | null
  alternatives: Prisma.InputJsonValue | null
  expectedOutcome: Prisma.InputJsonValue | null
  legacyMemoryId: string | null
  contentSignals: ContentSignals | null
}

export interface NewJudgmentEvent {
  workspaceId: string
  judgmentId: string
  revisionId: string | null
  revisionDigest: string | null
  type: JudgmentEventType
  actorMemberId: string | null
  channel: JudgmentChannel
  reason: string | null
}

function nullableJson(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.DbNull : value
}

export const judgmentRepository = {
  /** Run judgment writes atomically; the transaction keeps the workspace check. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return scopedPrisma.$transaction(fn)
  },

  // ── judgments ─────────────────────────────────────────────────────────

  async createJudgment(
    data: { workspaceId: string; projectId: string | null; name: string },
    tx: Tx
  ): Promise<JudgmentRow> {
    return tx.judgment.create({ data, select: JUDGMENT_SELECT })
  },

  async findJudgmentById(
    workspaceId: string,
    id: string,
    tx?: Tx
  ): Promise<JudgmentRow | null> {
    return (tx ?? scopedPrisma).judgment.findFirst({
      where: { workspaceId, id },
      select: JUDGMENT_SELECT,
    })
  },

  async findJudgmentByName(
    workspaceId: string,
    name: string,
    tx?: Tx
  ): Promise<JudgmentRow | null> {
    return (tx ?? scopedPrisma).judgment.findFirst({
      where: { workspaceId, name },
      select: JUDGMENT_SELECT,
    })
  },

  async listJudgments(
    workspaceId: string,
    filter: { projectId?: string | undefined; activeOnly: boolean },
    page: { limit: number; cursor?: string | undefined }
  ): Promise<JudgmentRow[]> {
    return scopedPrisma.judgment.findMany({
      where: {
        workspaceId,
        ...(filter.projectId !== undefined
          ? { projectId: filter.projectId }
          : {}),
        ...(filter.activeOnly ? { activeRevisionId: { not: null } } : {}),
      },
      select: JUDGMENT_SELECT,
      orderBy: { id: 'asc' },
      take: page.limit,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    })
  },

  async listJudgmentsByIds(
    workspaceId: string,
    ids: string[],
    tx?: Tx
  ): Promise<JudgmentRow[]> {
    if (ids.length === 0) return []
    return (tx ?? scopedPrisma).judgment.findMany({
      where: { workspaceId, id: { in: ids } },
      select: JUDGMENT_SELECT,
    })
  },

  /** Judgments that have an active revision or are marked paused. */
  async listGovernedJudgments(
    workspaceId: string,
    tx?: Tx
  ): Promise<JudgmentRow[]> {
    return (tx ?? scopedPrisma).judgment.findMany({
      where: {
        workspaceId,
        OR: [{ activeRevisionId: { not: null } }, { pausedAt: { not: null } }],
      },
      select: JUDGMENT_SELECT,
    })
  },

  /**
   * Point the judgment at a new active revision, but only if its active
   * revision is still the expected one. Returns the number of rows changed.
   */
  async setActiveRevisionIf(
    args: {
      workspaceId: string
      judgmentId: string
      expectedActiveRevisionId: string | null
      activeRevisionId: string | null
    },
    tx: Tx
  ): Promise<number> {
    const result = await tx.judgment.updateMany({
      where: {
        workspaceId: args.workspaceId,
        id: args.judgmentId,
        activeRevisionId: args.expectedActiveRevisionId,
      },
      data: { activeRevisionId: args.activeRevisionId },
    })
    return result.count
  },

  /** Mark or clear the conflict pause; a no-op when already in that state. */
  async setPausedIf(
    args: {
      workspaceId: string
      judgmentId: string
      paused: boolean
      now: Date
    },
    tx: Tx
  ): Promise<number> {
    const result = await tx.judgment.updateMany({
      where: {
        workspaceId: args.workspaceId,
        id: args.judgmentId,
        pausedAt: args.paused ? null : { not: null },
      },
      data: { pausedAt: args.paused ? args.now : null },
    })
    return result.count
  },

  // ── revisions ─────────────────────────────────────────────────────────

  async nextVersion(
    workspaceId: string,
    judgmentId: string,
    tx: Tx
  ): Promise<number> {
    const latest = await tx.judgmentRevision.findFirst({
      where: { workspaceId, judgmentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return (latest?.version ?? 0) + 1
  },

  async createRevision(
    data: NewJudgmentRevision,
    tx: Tx
  ): Promise<JudgmentRevisionRow> {
    const { contentSignals, ...rest } = data
    return tx.judgmentRevision.create({
      data: {
        ...rest,
        assertionValue: nullableJson(rest.assertionValue),
        scopePathGlobs: nullableJson(rest.scopePathGlobs),
        context: nullableJson(rest.context),
        alternatives: nullableJson(rest.alternatives),
        expectedOutcome: nullableJson(rest.expectedOutcome),
        ...contentSignalsData(contentSignals),
      },
      select: REVISION_SELECT,
    })
  },

  async findRevisionById(
    workspaceId: string,
    id: string,
    tx?: Tx
  ): Promise<JudgmentRevisionRow | null> {
    return (tx ?? scopedPrisma).judgmentRevision.findFirst({
      where: { workspaceId, id },
      select: REVISION_SELECT,
    })
  },

  async listRevisionsByIds(
    workspaceId: string,
    ids: string[],
    tx?: Tx
  ): Promise<JudgmentRevisionRow[]> {
    if (ids.length === 0) return []
    return (tx ?? scopedPrisma).judgmentRevision.findMany({
      where: { workspaceId, id: { in: ids } },
      select: REVISION_SELECT,
    })
  },

  async listRevisionsForJudgment(
    workspaceId: string,
    judgmentId: string,
    states?: JudgmentRevisionState[]
  ): Promise<JudgmentRevisionRow[]> {
    return scopedPrisma.judgmentRevision.findMany({
      where: {
        workspaceId,
        judgmentId,
        ...(states ? { state: { in: states } } : {}),
      },
      select: REVISION_SELECT,
      orderBy: { version: 'asc' },
    })
  },

  async listRevisionsByState(
    workspaceId: string,
    states: JudgmentRevisionState[],
    limit: number,
    tx?: Tx
  ): Promise<JudgmentRevisionRow[]> {
    return (tx ?? scopedPrisma).judgmentRevision.findMany({
      where: { workspaceId, state: { in: states } },
      select: REVISION_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
  },

  /** Pending candidates that carry an assertion — one side of the conflict check. */
  async listPendingAssertions(
    workspaceId: string,
    tx?: Tx
  ): Promise<JudgmentRevisionRow[]> {
    return (tx ?? scopedPrisma).judgmentRevision.findMany({
      where: {
        workspaceId,
        state: 'PROPOSED',
        assertionKey: { not: null },
      },
      select: REVISION_SELECT,
    })
  },

  /**
   * Move a revision to a new state, but only from the expected state and, when
   * given, only if its digest still matches. Returns the number of rows changed.
   */
  async setRevisionStateIf(
    args: {
      workspaceId: string
      revisionId: string
      from: JudgmentRevisionState
      to: JudgmentRevisionState
      digest?: string | undefined
    },
    tx: Tx
  ): Promise<number> {
    const result = await tx.judgmentRevision.updateMany({
      where: {
        workspaceId: args.workspaceId,
        id: args.revisionId,
        state: args.from,
        ...(args.digest !== undefined ? { digest: args.digest } : {}),
      },
      data: { state: args.to },
    })
    return result.count
  },

  // ── events ────────────────────────────────────────────────────────────

  async createEvent(data: NewJudgmentEvent, tx: Tx): Promise<void> {
    await tx.judgmentEvent.create({ data, select: { id: true } })
  },

  async listEventsForJudgment(
    workspaceId: string,
    judgmentId: string
  ): Promise<JudgmentEventRow[]> {
    return scopedPrisma.judgmentEvent.findMany({
      where: { workspaceId, judgmentId },
      select: EVENT_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
  },

  // ── cross-workspace (cron only) ───────────────────────────────────────

  /** Pending candidates proposed before `cutoff`, oldest first, in every workspace. */
  async listStaleCandidates(
    cutoff: Date,
    limit: number
  ): Promise<{ id: string; workspaceId: string }[]> {
    return unscoped('LUM-1356 candidate expiry cron').judgmentRevision.findMany(
      {
        where: { state: 'PROPOSED', createdAt: { lt: cutoff } },
        select: { id: true, workspaceId: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
      }
    )
  },
}
