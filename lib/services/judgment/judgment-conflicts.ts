import type { Prisma } from '@prisma/client'
import {
  conflictsByRevision,
  type ConflictSubject,
  type WhenCondition,
} from '@/lib/judgment/conflict'
import {
  judgmentRepository,
  type JudgmentRevisionRow,
  type JudgmentRow,
} from '@/lib/repositories/judgment.repository'

/**
 * LUM-1356 — the workspace's assertion conflicts (LUM-1354 Decision 10).
 *
 * Compared: each judgment's active revision and every pending candidate.
 * A conflict blocks the candidate's approval and pauses the approved side
 * until someone resolves it.
 */

type Tx = Prisma.TransactionClient

export interface ConflictCounterpart {
  judgmentId: string
  judgmentName: string
  revisionId: string
}

export interface WorkspaceConflicts {
  /** revisionId → the revisions of other judgments it conflicts with. */
  byRevision: Map<string, ConflictCounterpart[]>
  judgments: JudgmentRow[]
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((item): item is string => typeof item === 'string')
}

function whenConditions(value: unknown): WhenCondition[] {
  if (!Array.isArray(value)) return []
  const conditions: WhenCondition[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const { field, equals } = item as Record<string, unknown>
    if (typeof field !== 'string') continue
    if (
      typeof equals === 'string' ||
      typeof equals === 'number' ||
      typeof equals === 'boolean'
    ) {
      conditions.push({ field, equals })
    }
  }
  return conditions
}

export function toConflictSubject(
  revision: Pick<
    JudgmentRevisionRow,
    | 'id'
    | 'judgmentId'
    | 'scopeRepo'
    | 'scopePathGlobs'
    | 'when'
    | 'validFrom'
    | 'validUntil'
    | 'assertionKey'
    | 'assertionValue'
  >,
  projectId: string | null
): ConflictSubject {
  return {
    revisionId: revision.id,
    judgmentId: revision.judgmentId,
    projectId,
    scopeRepo: revision.scopeRepo,
    scopePathGlobs: stringArray(revision.scopePathGlobs),
    when: whenConditions(revision.when),
    validFrom: revision.validFrom,
    validUntil: revision.validUntil,
    assertionKey: revision.assertionKey,
    assertionValue: revision.assertionValue,
  }
}

/** Read the workspace's current conflicts. */
export async function loadWorkspaceConflicts(
  workspaceId: string,
  tx?: Tx
): Promise<WorkspaceConflicts> {
  const [governed, pending] = await Promise.all([
    judgmentRepository.listGovernedJudgments(workspaceId, tx),
    judgmentRepository.listPendingAssertions(workspaceId, tx),
  ])
  const activeIds = governed
    .map(judgment => judgment.activeRevisionId)
    .filter((id): id is string => id !== null)
  const governedIds = new Set(governed.map(judgment => judgment.id))
  const missingJudgmentIds = [
    ...new Set(
      pending
        .map(revision => revision.judgmentId)
        .filter(id => !governedIds.has(id))
    ),
  ]
  const [activeRevisions, otherJudgments] = await Promise.all([
    judgmentRepository.listRevisionsByIds(workspaceId, activeIds, tx),
    judgmentRepository.listJudgmentsByIds(workspaceId, missingJudgmentIds, tx),
  ])

  const judgments = [...governed, ...otherJudgments]
  const judgmentById = new Map(
    judgments.map(judgment => [judgment.id, judgment])
  )
  const subjects: ConflictSubject[] = []
  for (const revision of [...activeRevisions, ...pending]) {
    if (!revision.assertionKey) continue
    const judgment = judgmentById.get(revision.judgmentId)
    if (!judgment) continue
    subjects.push(toConflictSubject(revision, judgment.projectId))
  }

  const byRevision = new Map<string, ConflictCounterpart[]>()
  for (const [revisionId, others] of conflictsByRevision(subjects)) {
    byRevision.set(
      revisionId,
      others.map(other => ({
        judgmentId: other.judgmentId,
        judgmentName: judgmentById.get(other.judgmentId)?.name ?? '',
        revisionId: other.revisionId,
      }))
    )
  }
  return { byRevision, judgments }
}

export function describeCounterparts(others: ConflictCounterpart[]): string {
  return [...new Set(others.map(other => other.judgmentName))].sort().join(', ')
}

/**
 * Bring every judgment's pause mark in line with the current conflicts and
 * record each change. Idempotent: run after every state change and by the
 * daily cron.
 */
export async function reconcileConflictPauses(
  workspaceId: string,
  now: Date,
  tx: Tx
): Promise<{ paused: string[]; resumed: string[] }> {
  const { byRevision, judgments } = await loadWorkspaceConflicts(
    workspaceId,
    tx
  )
  const paused: string[] = []
  const resumed: string[] = []
  for (const judgment of judgments) {
    const others = judgment.activeRevisionId
      ? (byRevision.get(judgment.activeRevisionId) ?? [])
      : []
    const shouldPause = others.length > 0
    if (shouldPause === (judgment.pausedAt !== null)) continue
    const changed = await judgmentRepository.setPausedIf(
      { workspaceId, judgmentId: judgment.id, paused: shouldPause, now },
      tx
    )
    if (changed === 0) continue
    await judgmentRepository.createEvent(
      {
        workspaceId,
        judgmentId: judgment.id,
        revisionId: judgment.activeRevisionId,
        revisionDigest: null,
        type: shouldPause ? 'CONFLICT_FLAGGED' : 'CONFLICT_RESOLVED',
        actorMemberId: null,
        channel: 'PIPELINE',
        reason: shouldPause
          ? `Reuse paused: assertion conflict with ${describeCounterparts(others)}`
          : 'Reuse resumed: the assertion conflict is resolved',
      },
      tx
    )
    ;(shouldPause ? paused : resumed).push(judgment.id)
  }
  return { paused, resumed }
}
