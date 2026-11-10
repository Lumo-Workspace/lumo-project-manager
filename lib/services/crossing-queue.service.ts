import type {
  BoundaryCrossingSeverity,
  TaskStatus,
  WorkspaceRole,
} from '@prisma/client'
import { logger } from '@/lib/logger'
import { waitUntil } from '@/lib/runtime/wait-until'
import { pushUserEvent } from '@/lib/integrations/pusher'
import { formatCrossingRef } from '@/lib/boundary-crossing/crossing-ref'
import {
  firstLine,
  isEligibleRuler,
  orderQueueCards,
  summarizeTaskHistory,
  type QueueViewer,
  type TaskCrossingHistory,
} from '@/lib/boundary-crossing/crossing-queue'
import { isBlockingCrossing } from '@/lib/summaries/sprint-attention'
import { sanitizeField } from '@/lib/utils/sanitize'
import {
  crossingQueueRepository,
  QUEUE_READ_CAP,
} from '@/lib/repositories/crossing-queue.repository'
import { taskDecisionRepository } from '@/lib/repositories/task-decision.repository'
import { memberRepository } from '@/lib/repositories/member.repository'
import { notificationRepository } from '@/lib/repositories/notification.repository'
import { shouldNotify } from '@/lib/notifications/preferenceGate'
import {
  boundaryCrossingService,
  type BoundaryCrossingView,
  type DispositionAttribution,
  type DispositionOutcome,
} from '@/lib/services/boundary-crossing.service'

/**
 * LUM-1336: the workspace Boundary Crossings tab — OPEN task crossings dealt
 * as index cards to the people allowed to rule on them (the task's assignee
 * and workspace OWNERs), each card carrying the task context a reviewer would
 * otherwise get from the task page.
 *
 * Ruling from a card goes through the same `boundaryCrossingService.
 * disposition` write as the Record tab (channel WEB); this service adds the
 * eligibility check and a stale-read refusal in front of it. A tag is a
 * request, never a ruling: it writes a tag row and an in-app notification and
 * leaves the crossing OPEN.
 */

export type QueueFilter = 'all' | 'tagged' | 'blocking'

export interface QueueCaller {
  memberId: string
  workspaceId: string
}

export interface QueueCardView {
  id: string
  ref: string
  category: string
  severity: BoundaryCrossingSeverity
  advisory: boolean
  blocking: boolean
  /** First line of the detail, control-character-sanitized. */
  summary: string
  detectedAt: string
  lastSeenAt: string
  occurrenceCount: number
  taskId: string
  taskIdentifier: string
  taskTitle: string
  taskStatus: TaskStatus
  projectId: string
  projectName: string
  /** The latest tag handing this card to the viewer, if any. */
  taggedForMe: { byMemberId: string; message: string | null; at: string } | null
}

export interface QueueView {
  cards: QueueCardView[]
  /** Blocking cards across the viewer's whole queue (the sidebar badge). */
  blockingCount: number
  /** Cards across the viewer's whole queue, before filters. */
  total: number
  /** The read hit its cap; older cards exist beyond it. */
  truncated: boolean
}

/** One section of a card's context. A failed read is never shown as empty. */
export type CardSection<T> = { status: 'ok'; data: T } | { status: 'error' }

export interface CardTaskView {
  identifier: string
  title: string
  description: string | null
  status: TaskStatus
  projectName: string
  milestoneName: string | null
  sprintName: string | null
  assigneeMemberId: string | null
}

export interface CardTestCaseView {
  number: number
  title: string
  latestResult: string | null
  latestRunAt: string | null
}

export interface CardDecisionView {
  number: number
  text: string
  rationale: string | null
  createdAt: string
}

export interface CardPullRequestView {
  number: number
  title: string
  url: string
  state: string
  repo: string
  headBranch: string
}

export interface CardTagView {
  taggedMemberId: string
  taggedById: string
  message: string | null
  createdAt: string
}

export interface CardCrossingSection {
  view: BoundaryCrossingView
  blocking: boolean
  /** What a ruling must present back; any change since voids it (409). */
  stateHash: string
}

export interface CardContextView {
  crossingId: string
  taskId: string
  crossing: CardSection<CardCrossingSection>
  history: CardSection<TaskCrossingHistory>
  task: CardSection<CardTaskView>
  testCases: CardSection<CardTestCaseView[]>
  decisions: CardSection<CardDecisionView[]>
  pullRequests: CardSection<CardPullRequestView[]>
  tags: CardSection<CardTagView[]>
  /** Members this viewer may tag: the task's assignee and OWNERs, not self. */
  tagTargets: CardSection<{ memberId: string; role: WorkspaceRole }[]>
}

export interface RuleInput {
  disposition: 'FALSE_POSITIVE' | 'CONFIRMED'
  note: string | null
  stateHash: string
}

export interface TagInput {
  memberId: string
  message: string | null
}

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null

const clean = (s: string | null): string | null =>
  s == null ? null : sanitizeField(s)

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status })
}

/** Settle a section: a rejection becomes `{ status: 'error' }`, logged. */
async function section<T>(
  name: string,
  read: () => Promise<T>
): Promise<CardSection<T>> {
  try {
    return { status: 'ok', data: await read() }
  } catch (error) {
    logger.warn('[crossing-queue] card section failed', {
      section: name,
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: 'error' }
  }
}

async function loadViewer(caller: QueueCaller): Promise<QueueViewer> {
  const member = await crossingQueueRepository.findViewer(
    caller.memberId,
    caller.workspaceId
  )
  if (!member) throw httpError('Not a member of this workspace', 403)
  return { role: member.role, actorId: member.actor?.id ?? null }
}

/** Load a crossing the viewer may act on: 404 if absent, 403 if not theirs. */
async function loadEligibleCrossing(
  caller: QueueCaller,
  viewer: QueueViewer,
  crossingId: string
) {
  const crossing = await crossingQueueRepository.findCrossingForCard(
    crossingId,
    caller.workspaceId
  )
  if (!crossing?.taskId) throw httpError('Boundary crossing not found', 404)
  const assigneeActorId = crossing.task?.assigneeActorId ?? null
  if (!isEligibleRuler(viewer, assigneeActorId)) {
    throw httpError(
      "Only the task's assignee or a workspace owner can act on this crossing",
      403
    )
  }
  return { ...crossing, taskId: crossing.taskId, assigneeActorId }
}

export const crossingQueueService = {
  /** The viewer's queue in deal order, filtered; counts span the whole queue. */
  async getQueue(
    caller: QueueCaller,
    opts: { filter: QueueFilter; projectId: string | null }
  ): Promise<QueueView> {
    const viewer = await loadViewer(caller)
    // A non-owner with no actor can't be anyone's assignee — empty queue.
    if (viewer.role !== 'OWNER' && !viewer.actorId) {
      return { cards: [], blockingCount: 0, total: 0, truncated: false }
    }
    const [rows, gateEnabled] = await Promise.all([
      crossingQueueRepository.findOpenQueueRows({
        workspaceId: caller.workspaceId,
        assigneeActorId: viewer.role === 'OWNER' ? null : viewer.actorId,
        viewerMemberId: caller.memberId,
      }),
      boundaryCrossingService.isGateEnabled(caller.workspaceId),
    ])

    const all: QueueCardView[] = rows.flatMap(r => {
      if (!r.task) return []
      const tag = r.tags[0]
      return [
        {
          id: r.id,
          ref: formatCrossingRef(r.task.team.identifier, r.number, r.id),
          category: r.category,
          severity: r.severity,
          advisory: r.advisory,
          blocking: isBlockingCrossing(r, gateEnabled),
          summary: sanitizeField(firstLine(r.detail)),
          detectedAt: r.detectedAt.toISOString(),
          lastSeenAt: (r.lastSeenAt ?? r.detectedAt).toISOString(),
          occurrenceCount: r.occurrenceCount ?? 1,
          taskId: r.task.id,
          taskIdentifier: `${r.task.team.identifier}-${r.task.number}`,
          taskTitle: sanitizeField(r.task.title),
          taskStatus: r.task.status,
          projectId: r.task.projectId,
          projectName: r.task.project.name,
          taggedForMe: tag
            ? {
                byMemberId: tag.taggedById,
                message: clean(tag.message),
                at: tag.createdAt.toISOString(),
              }
            : null,
        },
      ]
    })

    const cards = orderQueueCards(
      all.filter(
        c =>
          (opts.projectId == null || c.projectId === opts.projectId) &&
          (opts.filter !== 'tagged' || c.taggedForMe != null) &&
          (opts.filter !== 'blocking' || c.blocking)
      )
    )
    return {
      cards,
      blockingCount: all.filter(c => c.blocking).length,
      total: all.length,
      truncated: rows.length >= QUEUE_READ_CAP,
    }
  },

  /**
   * Everything a card shows, section by section. Each section settles on its
   * own: a failed read comes back `{ status: 'error' }` so the card can say
   * so — and refuse a ruling — instead of showing it as empty.
   */
  async getCardContext(
    caller: QueueCaller,
    crossingId: string
  ): Promise<CardContextView> {
    const viewer = await loadViewer(caller)
    const crossing = await loadEligibleCrossing(caller, viewer, crossingId)
    const { taskId, assigneeActorId } = crossing

    // The Record tab's own read model — the card and the panel can't drift.
    // The state hash is read BEFORE the view: a change landing between the
    // two then makes the hash stale (the ruling is refused), never the view
    // stale under a fresh hash (a ruling on content the reviewer never saw).
    const listing = (async () => {
      const stateHash = await boundaryCrossingService.stateHash(
        taskId,
        crossingId
      )
      const [views, gateEnabled] = await Promise.all([
        boundaryCrossingService.listAll(taskId),
        boundaryCrossingService.isGateEnabled(caller.workspaceId),
      ])
      return { stateHash, views, gateEnabled }
    })()

    const [
      crossingSection,
      history,
      task,
      testCases,
      decisions,
      pullRequests,
      tags,
      tagTargets,
    ] = await Promise.all([
      section('crossing', async () => {
        const { stateHash, views, gateEnabled } = await listing
        const view = views.find(v => v.id === crossingId)
        if (!view) throw new Error('crossing missing from the task read model')
        return {
          view,
          blocking:
            view.disposition == null && isBlockingCrossing(view, gateEnabled),
          stateHash,
        }
      }),
      section('history', async () => {
        const { views } = await listing
        return summarizeTaskHistory(views, crossingId)
      }),
      section('task', async () => {
        const t = await crossingQueueRepository.findCardTask(taskId)
        if (!t) throw new Error('task missing')
        return {
          identifier: `${t.team.identifier}-${t.number}`,
          title: sanitizeField(t.title),
          description: clean(t.description),
          status: t.status,
          projectName: t.project.name,
          milestoneName: t.milestone?.name ?? null,
          sprintName: t.sprint?.name ?? null,
          assigneeMemberId: t.assignee?.memberId ?? null,
        }
      }),
      section('testCases', async () =>
        (await crossingQueueRepository.listCardTestCases(taskId)).map(tc => ({
          number: tc.number,
          title: sanitizeField(tc.title),
          latestResult: tc.runs[0]?.result ?? null,
          latestRunAt: iso(tc.runs[0]?.createdAt),
        }))
      ),
      section('decisions', async () =>
        (
          await taskDecisionRepository.listByTask(taskId, caller.workspaceId)
        ).map(d => ({
          number: d.number,
          text: sanitizeField(d.text),
          rationale: clean(d.rationale),
          createdAt: d.createdAt.toISOString(),
        }))
      ),
      section('pullRequests', async () =>
        crossingQueueRepository.listCardPullRequests(taskId)
      ),
      section('tags', async () =>
        (await crossingQueueRepository.listTagsForCrossing(crossingId)).map(
          t => ({
            taggedMemberId: t.taggedMemberId,
            taggedById: t.taggedById,
            message: clean(t.message),
            createdAt: t.createdAt.toISOString(),
          })
        )
      ),
      section('tagTargets', async () =>
        (
          await crossingQueueRepository.findRulerMemberIds(
            caller.workspaceId,
            assigneeActorId
          )
        )
          .filter(m => m.id !== caller.memberId)
          .map(m => ({ memberId: m.id, role: m.role }))
      ),
    ])

    return {
      crossingId,
      taskId,
      crossing: crossingSection,
      history,
      task,
      testCases,
      decisions,
      pullRequests,
      tags,
      tagTargets,
    }
  },

  /**
   * Rule on a card. Refused 403 for a viewer who isn't the assignee or an
   * OWNER, 409 when the crossing was already ruled or changed since the card
   * was read (`stateHash` no longer matches). Then the Record tab's write.
   */
  async rule(
    caller: QueueCaller,
    crossingId: string,
    input: RuleInput,
    attribution: DispositionAttribution
  ): Promise<DispositionOutcome> {
    const viewer = await loadViewer(caller)
    const crossing = await loadEligibleCrossing(caller, viewer, crossingId)
    if (crossing.disposition != null) {
      throw httpError('This crossing has already been ruled on', 409)
    }
    const current = await boundaryCrossingService.stateHash(
      crossing.taskId,
      crossingId
    )
    if (current !== input.stateHash) {
      throw httpError(
        'This crossing changed since the card was loaded — review it again before ruling',
        409
      )
    }
    return boundaryCrossingService.disposition(
      crossing.taskId,
      crossingId,
      input.disposition,
      input.note,
      attribution
    )
  },

  /**
   * Hand a card to a teammate who may rule on it. Never a ruling: the
   * crossing stays OPEN. The in-app notification is best-effort — a failed
   * notification never undoes the tag.
   */
  async tag(
    caller: QueueCaller,
    crossingId: string,
    input: TagInput
  ): Promise<{ id: string; createdAt: string }> {
    const viewer = await loadViewer(caller)
    const crossing = await loadEligibleCrossing(caller, viewer, crossingId)
    if (crossing.disposition != null) {
      throw httpError('This crossing has already been ruled on', 409)
    }
    if (input.memberId === caller.memberId) {
      throw httpError('You cannot tag yourself', 400)
    }
    const rulers = await crossingQueueRepository.findRulerMemberIds(
      caller.workspaceId,
      crossing.assigneeActorId
    )
    if (!rulers.some(m => m.id === input.memberId)) {
      throw httpError(
        "Only the task's assignee or a workspace owner can be tagged",
        422
      )
    }

    const created = await crossingQueueRepository.createTag({
      crossingId,
      taggedMemberId: input.memberId,
      taggedById: caller.memberId,
      message: input.message,
    })

    try {
      await notifyTagged({
        workspaceId: caller.workspaceId,
        taskId: crossing.taskId,
        taggedMemberId: input.memberId,
        triggerActorId: viewer.actorId,
      })
    } catch (error) {
      logger.error('[crossing-queue] tag notification failed', {
        crossingId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return { id: created.id, createdAt: created.createdAt.toISOString() }
  },
}

/** In-app only (Decision 4): an inbox row plus a real-time nudge. */
async function notifyTagged(input: {
  workspaceId: string
  taskId: string
  taggedMemberId: string
  triggerActorId: string | null
}): Promise<void> {
  const actor = await memberRepository.findActorByMemberId(input.taggedMemberId)
  if (!actor) return
  if (!(await shouldNotify(actor.id, 'inApp', 'CROSSING_TAGGED'))) return
  await notificationRepository.create({
    workspaceId: input.workspaceId,
    recipientActorId: actor.id,
    type: 'CROSSING_TAGGED',
    taskId: input.taskId,
    triggerActorId: input.triggerActorId,
  })
  const clerkId = await memberRepository.findClerkIdById(input.taggedMemberId)
  if (clerkId) waitUntil(pushUserEvent(clerkId, { type: 'notification:new' }))
}
