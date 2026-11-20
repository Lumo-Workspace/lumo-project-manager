import {
  judgmentRepository,
  type JudgmentEventRow,
  type JudgmentRevisionRow,
  type JudgmentRow,
} from '@/lib/repositories/judgment.repository'
import {
  loadWorkspaceConflicts,
  type ConflictCounterpart,
} from './judgment-conflicts'
import { judgmentSettingsService } from './judgment-settings.service'

/**
 * LUM-1356 — reading team memory judgments: the list, the review inbox and
 * one judgment. By default a judgment shows the revision in effect and what
 * is waiting for review; older revisions and events are opt-in (`history`).
 */

export interface JudgmentReader {
  workspaceId: string
  workspaceSlug: string
}

/** Why a pending candidate cannot be approved as it stands. */
export type ApprovalBlocker =
  | 'ORIGIN_UNKNOWN'
  | 'RATIONALE_MISSING'
  | 'CONFLICT'
  | 'STALE_BASE'

export interface JudgmentRevisionView extends JudgmentRevisionRow {
  conflictsWith: ConflictCounterpart[]
  /** Empty for anything that is not a pending candidate. */
  approvalBlockers: ApprovalBlocker[]
}

export interface JudgmentSummary extends JudgmentRow {
  paused: boolean
  activeRevision: JudgmentRevisionView | null
}

export interface InboxItem {
  judgment: JudgmentRow & { paused: boolean }
  revision: JudgmentRevisionView
}

export interface JudgmentDetail extends JudgmentSummary {
  pendingRevisions: JudgmentRevisionView[]
  /** Only with `history`. */
  revisions?: JudgmentRevisionView[]
  events?: JudgmentEventRow[]
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

async function assertEnabled(reader: JudgmentReader): Promise<void> {
  const mode = await judgmentSettingsService.effectiveMode(reader)
  if (mode === 'OFF') {
    throw httpError(
      409,
      'Team memory review is not turned on for this workspace'
    )
  }
}

export function approvalBlockers(
  revision: JudgmentRevisionRow,
  judgment: Pick<JudgmentRow, 'activeRevisionId'>,
  conflictsWith: ConflictCounterpart[]
): ApprovalBlocker[] {
  if (revision.state !== 'PROPOSED') return []
  const blockers: ApprovalBlocker[] = []
  if (revision.origin === 'UNKNOWN') blockers.push('ORIGIN_UNKNOWN')
  if (!revision.rationale?.trim()) blockers.push('RATIONALE_MISSING')
  if (conflictsWith.length > 0) blockers.push('CONFLICT')
  if (revision.baseRevisionId !== judgment.activeRevisionId) {
    blockers.push('STALE_BASE')
  }
  return blockers
}

function toView(
  revision: JudgmentRevisionRow,
  judgment: Pick<JudgmentRow, 'activeRevisionId'>,
  conflicts: Map<string, ConflictCounterpart[]>
): JudgmentRevisionView {
  const conflictsWith = conflicts.get(revision.id) ?? []
  return {
    ...revision,
    conflictsWith,
    approvalBlockers: approvalBlockers(revision, judgment, conflictsWith),
  }
}

export const judgmentReadService = {
  async list(
    reader: JudgmentReader,
    query: {
      view: 'active' | 'all'
      projectId?: string | undefined
      limit: number
      cursor?: string | undefined
    }
  ): Promise<{ judgments: JudgmentSummary[]; nextCursor: string | null }> {
    await assertEnabled(reader)
    const rows = await judgmentRepository.listJudgments(
      reader.workspaceId,
      { projectId: query.projectId, activeOnly: query.view === 'active' },
      { limit: query.limit + 1, cursor: query.cursor }
    )
    const page = rows.slice(0, query.limit)
    const [{ byRevision }, activeRevisions] = await Promise.all([
      loadWorkspaceConflicts(reader.workspaceId),
      judgmentRepository.listRevisionsByIds(
        reader.workspaceId,
        page
          .map(judgment => judgment.activeRevisionId)
          .filter((id): id is string => id !== null)
      ),
    ])
    const revisionById = new Map(
      activeRevisions.map(revision => [revision.id, revision])
    )
    return {
      judgments: page.map(judgment => {
        const active = judgment.activeRevisionId
          ? revisionById.get(judgment.activeRevisionId)
          : undefined
        return {
          ...judgment,
          paused: judgment.pausedAt !== null,
          activeRevision: active ? toView(active, judgment, byRevision) : null,
        }
      }),
      nextCursor:
        rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    }
  },

  /** Candidates waiting for review: conflicts first, then oldest first. */
  async inbox(
    reader: JudgmentReader,
    limit = 200
  ): Promise<{ items: InboxItem[] }> {
    await assertEnabled(reader)
    const pending = await judgmentRepository.listRevisionsByState(
      reader.workspaceId,
      ['PROPOSED'],
      limit
    )
    const [{ byRevision }, judgments] = await Promise.all([
      loadWorkspaceConflicts(reader.workspaceId),
      judgmentRepository.listJudgmentsByIds(reader.workspaceId, [
        ...new Set(pending.map(revision => revision.judgmentId)),
      ]),
    ])
    const judgmentById = new Map(
      judgments.map(judgment => [judgment.id, judgment])
    )
    const items: InboxItem[] = []
    for (const revision of pending) {
      const judgment = judgmentById.get(revision.judgmentId)
      if (!judgment) continue
      items.push({
        judgment: { ...judgment, paused: judgment.pausedAt !== null },
        revision: toView(revision, judgment, byRevision),
      })
    }
    // Array.prototype.sort is stable: the oldest-first order from the query
    // is kept inside each group.
    items.sort(
      (a, b) =>
        Number(b.revision.conflictsWith.length > 0) -
        Number(a.revision.conflictsWith.length > 0)
    )
    return { items }
  },

  /** One judgment, by id or by name. */
  async show(
    reader: JudgmentReader,
    ref: string,
    options: { history: boolean }
  ): Promise<JudgmentDetail> {
    await assertEnabled(reader)
    const judgment =
      (await judgmentRepository.findJudgmentById(reader.workspaceId, ref)) ??
      (await judgmentRepository.findJudgmentByName(reader.workspaceId, ref))
    if (!judgment) throw httpError(404, 'Not found')

    const [{ byRevision }, revisions, events] = await Promise.all([
      loadWorkspaceConflicts(reader.workspaceId),
      judgmentRepository.listRevisionsForJudgment(
        reader.workspaceId,
        judgment.id,
        options.history ? undefined : ['PROPOSED', 'APPROVED']
      ),
      options.history
        ? judgmentRepository.listEventsForJudgment(
            reader.workspaceId,
            judgment.id
          )
        : Promise.resolve(undefined),
    ])
    const views = revisions.map(revision =>
      toView(revision, judgment, byRevision)
    )
    return {
      ...judgment,
      paused: judgment.pausedAt !== null,
      activeRevision:
        views.find(view => view.id === judgment.activeRevisionId) ?? null,
      pendingRevisions: views.filter(view => view.state === 'PROPOSED'),
      ...(options.history ? { revisions: views, events: events ?? [] } : {}),
    }
  },

  /** One revision with its judgment — what the review page loads. */
  async showRevision(
    reader: JudgmentReader,
    revisionId: string
  ): Promise<InboxItem & { activeRevision: JudgmentRevisionView | null }> {
    await assertEnabled(reader)
    const revision = await judgmentRepository.findRevisionById(
      reader.workspaceId,
      revisionId
    )
    if (!revision) throw httpError(404, 'Not found')
    const judgment = await judgmentRepository.findJudgmentById(
      reader.workspaceId,
      revision.judgmentId
    )
    if (!judgment) throw httpError(404, 'Not found')
    const [{ byRevision }, active] = await Promise.all([
      loadWorkspaceConflicts(reader.workspaceId),
      judgment.activeRevisionId && judgment.activeRevisionId !== revision.id
        ? judgmentRepository.findRevisionById(
            reader.workspaceId,
            judgment.activeRevisionId
          )
        : Promise.resolve(null),
    ])
    return {
      judgment: { ...judgment, paused: judgment.pausedAt !== null },
      revision: toView(revision, judgment, byRevision),
      activeRevision: active ? toView(active, judgment, byRevision) : null,
    }
  },
}
