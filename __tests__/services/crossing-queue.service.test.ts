/**
 * @jest-environment node
 *
 * LUM-1336: the Boundary Crossings tab service — who receives cards, the
 * filters and badge count, a card context whose failed sections say so, and
 * the two refusals in front of a ruling (ineligible viewer, stale card).
 */
import { crossingQueueService } from '@/lib/services/crossing-queue.service'
import { crossingQueueRepository } from '@/lib/repositories/crossing-queue.repository'
import { boundaryCrossingService } from '@/lib/services/boundary-crossing.service'
import { taskDecisionRepository } from '@/lib/repositories/task-decision.repository'
import { memberRepository } from '@/lib/repositories/member.repository'
import { notificationRepository } from '@/lib/repositories/notification.repository'
import { shouldNotify } from '@/lib/notifications/preferenceGate'

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('@/lib/runtime/wait-until', () => ({ waitUntil: jest.fn() }))
jest.mock('@/lib/integrations/pusher', () => ({
  pushUserEvent: jest.fn(() => Promise.resolve()),
}))
jest.mock('@/lib/repositories/crossing-queue.repository', () => ({
  QUEUE_READ_CAP: 500,
  crossingQueueRepository: {
    findViewer: jest.fn(),
    findOpenQueueRows: jest.fn(),
    findCrossingForCard: jest.fn(),
    findCardTask: jest.fn(),
    listCardTestCases: jest.fn(),
    listCardPullRequests: jest.fn(),
    findRulerMemberIds: jest.fn(),
    createTag: jest.fn(),
    listTagsForCrossing: jest.fn(),
  },
}))
jest.mock('@/lib/services/boundary-crossing.service', () => ({
  boundaryCrossingService: {
    isGateEnabled: jest.fn(),
    listAll: jest.fn(),
    stateHash: jest.fn(),
    disposition: jest.fn(),
  },
}))
jest.mock('@/lib/repositories/task-decision.repository', () => ({
  taskDecisionRepository: { listByTask: jest.fn() },
}))
jest.mock('@/lib/repositories/member.repository', () => ({
  memberRepository: {
    findActorByMemberId: jest.fn(),
    findClerkIdById: jest.fn(),
  },
}))
jest.mock('@/lib/repositories/notification.repository', () => ({
  notificationRepository: { create: jest.fn() },
}))
jest.mock('@/lib/notifications/preferenceGate', () => ({
  shouldNotify: jest.fn(),
}))

const repo = crossingQueueRepository as jest.Mocked<
  typeof crossingQueueRepository
>
const bc = boundaryCrossingService as jest.Mocked<
  typeof boundaryCrossingService
>
const decisions = taskDecisionRepository.listByTask as jest.Mock
const findActor = memberRepository.findActorByMemberId as jest.Mock
const findClerkId = memberRepository.findClerkIdById as jest.Mock
const createNotification = notificationRepository.create as jest.Mock
const mockShouldNotify = shouldNotify as jest.Mock

const CALLER = { memberId: 'm-viewer', workspaceId: 'ws-1' }
const ATTRIBUTION = {
  actorMemberId: 'm-viewer',
  actorClerkId: 'u-viewer',
  audit: { workspaceId: 'ws-1', context: {} as never },
}

function viewer(role: 'OWNER' | 'MEMBER', actorId: string | null = 'a-viewer') {
  repo.findViewer.mockResolvedValue({
    id: CALLER.memberId,
    role,
    actor: actorId ? { id: actorId } : null,
  } as never)
}

function queueRow(over: Record<string, unknown> = {}) {
  return {
    id: 'bc-1',
    number: 7,
    category: 'NEW_NPM_DEPENDENCY',
    severity: 'MEDIUM',
    advisory: false,
    detail: 'npm install left-pad\nsecond line',
    detectedAt: new Date('2026-01-01T00:00:00Z'),
    lastSeenAt: null,
    occurrenceCount: 1,
    task: {
      id: 't-1',
      number: 12,
      title: 'Add padding',
      status: 'IN_PROGRESS',
      projectId: 'p-1',
      team: { identifier: 'LUM' },
      project: { name: 'Lumo' },
    },
    tags: [],
    ...over,
  }
}

function cardCrossing(over: Record<string, unknown> = {}) {
  repo.findCrossingForCard.mockResolvedValue({
    id: 'bc-1',
    taskId: 't-1',
    disposition: null,
    task: { assigneeActorId: 'a-assignee' },
    ...over,
  } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  bc.isGateEnabled.mockResolvedValue(true)
})

describe('getQueue', () => {
  it('asks an OWNER for the whole workspace and a member for their own tasks only', async () => {
    repo.findOpenQueueRows.mockResolvedValue([])
    viewer('OWNER')
    await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: null,
    })
    expect(repo.findOpenQueueRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeActorId: null })
    )

    viewer('MEMBER', 'a-viewer')
    await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: null,
    })
    expect(repo.findOpenQueueRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeActorId: 'a-viewer' })
    )
  })

  it('gives a non-owner with no actor an empty queue without reading', async () => {
    viewer('MEMBER', null)
    const view = await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: null,
    })
    expect(view).toEqual({
      cards: [],
      blockingCount: 0,
      total: 0,
      truncated: false,
    })
    expect(repo.findOpenQueueRows).not.toHaveBeenCalled()
  })

  it('refuses a deactivated or foreign member with 403', async () => {
    repo.findViewer.mockResolvedValue(null)
    await expect(
      crossingQueueService.getQueue(CALLER, { filter: 'all', projectId: null })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('filters by tag, blocking and project, while counts span the whole queue', async () => {
    viewer('OWNER')
    repo.findOpenQueueRows.mockResolvedValue([
      queueRow({
        id: 'blocking-tagged',
        tags: [
          {
            taggedById: 'm-2',
            message: 'pls',
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
      }),
      queueRow({ id: 'advisory', advisory: true }),
      queueRow({
        id: 'other-project',
        task: { ...queueRow().task, projectId: 'p-2' },
      }),
    ] as never)

    const all = await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: null,
    })
    expect(all.total).toBe(3)
    expect(all.blockingCount).toBe(2)
    expect(all.cards[0]).toMatchObject({
      ref: 'LUM-X7',
      taskIdentifier: 'LUM-12',
      summary: 'npm install left-pad',
      blocking: true,
    })

    const tagged = await crossingQueueService.getQueue(CALLER, {
      filter: 'tagged',
      projectId: null,
    })
    expect(tagged.cards.map(c => c.id)).toEqual(['blocking-tagged'])
    expect(tagged.cards[0]!.taggedForMe).toEqual({
      byMemberId: 'm-2',
      message: 'pls',
      at: '2026-01-02T00:00:00.000Z',
    })
    expect(tagged.blockingCount).toBe(2)

    const blocking = await crossingQueueService.getQueue(CALLER, {
      filter: 'blocking',
      projectId: null,
    })
    expect(blocking.cards.map(c => c.id).sort()).toEqual([
      'blocking-tagged',
      'other-project',
    ])

    const project = await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: 'p-2',
    })
    expect(project.cards.map(c => c.id)).toEqual(['other-project'])
  })

  it('applies the gate rule: with the gate off only HIGH blocks', async () => {
    viewer('OWNER')
    bc.isGateEnabled.mockResolvedValue(false)
    repo.findOpenQueueRows.mockResolvedValue([
      queueRow({ id: 'medium' }),
      queueRow({ id: 'high', severity: 'HIGH' }),
    ] as never)
    const view = await crossingQueueService.getQueue(CALLER, {
      filter: 'all',
      projectId: null,
    })
    expect(view.blockingCount).toBe(1)
    expect(view.cards[0]!.id).toBe('high')
  })
})

describe('getCardContext', () => {
  function happyReads() {
    bc.listAll.mockResolvedValue([
      {
        id: 'bc-1',
        ref: 'LUM-X7',
        category: 'NEW_NPM_DEPENDENCY',
        severity: 'MEDIUM',
        advisory: false,
        disposition: null,
        dispositionedAt: null,
        dispositionedById: null,
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as never)
    bc.stateHash.mockResolvedValue('hash-1')
    repo.findCardTask.mockResolvedValue({
      id: 't-1',
      number: 12,
      title: 'Add padding',
      description: 'Pad strings.\u0007',
      status: 'IN_PROGRESS',
      team: { identifier: 'LUM' },
      project: { name: 'Lumo' },
      milestone: null,
      sprint: { name: 'Sprint 4' },
      assignee: { memberId: 'm-assignee' },
    } as never)
    repo.listCardTestCases.mockResolvedValue([
      {
        number: 1,
        title: 'pads',
        runs: [{ result: 'PASS', createdAt: new Date('2026-01-03T00:00:00Z') }],
      },
    ] as never)
    decisions.mockResolvedValue([
      {
        number: 1,
        text: 'Use left-pad',
        rationale: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ])
    repo.listCardPullRequests.mockResolvedValue([])
    repo.listTagsForCrossing.mockResolvedValue([])
    repo.findRulerMemberIds.mockResolvedValue([
      { id: 'm-viewer', role: 'OWNER' },
      { id: 'm-assignee', role: 'MEMBER' },
    ] as never)
  }

  it('returns every section, sanitized, with the state hash and tag targets minus the viewer', async () => {
    viewer('OWNER')
    cardCrossing()
    happyReads()
    const ctx = await crossingQueueService.getCardContext(CALLER, 'bc-1')
    expect(ctx.crossing).toMatchObject({
      status: 'ok',
      data: { stateHash: 'hash-1', blocking: true },
    })
    expect(ctx.task).toMatchObject({
      status: 'ok',
      data: {
        identifier: 'LUM-12',
        description: 'Pad strings.',
        sprintName: 'Sprint 4',
      },
    })
    expect(ctx.testCases).toEqual({
      status: 'ok',
      data: [
        {
          number: 1,
          title: 'pads',
          latestResult: 'PASS',
          latestRunAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    })
    expect(ctx.tagTargets).toEqual({
      status: 'ok',
      data: [{ memberId: 'm-assignee', role: 'MEMBER' }],
    })
    expect(ctx.history).toEqual({
      status: 'ok',
      data: { otherOpen: 0, sameCategoryRulings: [], others: [] },
    })
  })

  it('reads the state hash before the crossing view, so a change in between voids the ruling', async () => {
    viewer('OWNER')
    cardCrossing()
    happyReads()
    const order: string[] = []
    bc.stateHash.mockImplementation(async () => {
      order.push('hash')
      return 'hash-1'
    })
    const listAll = bc.listAll.getMockImplementation()
    bc.listAll.mockImplementation(async taskId => {
      order.push('view')
      return listAll!(taskId)
    })
    await crossingQueueService.getCardContext(CALLER, 'bc-1')
    expect(order).toEqual(['hash', 'view'])
  })

  it('marks a failed section as an error instead of an empty list', async () => {
    viewer('OWNER')
    cardCrossing()
    happyReads()
    decisions.mockRejectedValue(new Error('db down'))
    const ctx = await crossingQueueService.getCardContext(CALLER, 'bc-1')
    expect(ctx.decisions).toEqual({ status: 'error' })
    expect(ctx.task.status).toBe('ok')
  })

  it('fails the crossing and history sections together when the read model fails', async () => {
    viewer('OWNER')
    cardCrossing()
    happyReads()
    bc.listAll.mockRejectedValue(new Error('boom'))
    const ctx = await crossingQueueService.getCardContext(CALLER, 'bc-1')
    expect(ctx.crossing).toEqual({ status: 'error' })
    expect(ctx.history).toEqual({ status: 'error' })
  })

  it("refuses a member who isn't the task's assignee with 403", async () => {
    viewer('MEMBER', 'a-someone-else')
    cardCrossing()
    await expect(
      crossingQueueService.getCardContext(CALLER, 'bc-1')
    ).rejects.toMatchObject({ status: 403 })
  })

  it('404s a crossing outside the workspace or without a task', async () => {
    viewer('OWNER')
    repo.findCrossingForCard.mockResolvedValue(null)
    await expect(
      crossingQueueService.getCardContext(CALLER, 'bc-x')
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('rule', () => {
  const INPUT = {
    disposition: 'FALSE_POSITIVE' as const,
    note: 'fixture',
    stateHash: 'hash-1',
  }

  it("lets the task's assignee rule, through the Record tab's write", async () => {
    viewer('MEMBER', 'a-assignee')
    cardCrossing()
    bc.stateHash.mockResolvedValue('hash-1')
    bc.disposition.mockResolvedValue({
      crossingId: 'bc-1',
      disposition: 'FALSE_POSITIVE',
    })
    await crossingQueueService.rule(CALLER, 'bc-1', INPUT, ATTRIBUTION)
    expect(bc.disposition).toHaveBeenCalledWith(
      't-1',
      'bc-1',
      'FALSE_POSITIVE',
      'fixture',
      ATTRIBUTION
    )
  })

  it('refuses an ineligible member with 403 and writes nothing', async () => {
    viewer('MEMBER', 'a-someone-else')
    cardCrossing()
    await expect(
      crossingQueueService.rule(CALLER, 'bc-1', INPUT, ATTRIBUTION)
    ).rejects.toMatchObject({ status: 403 })
    expect(bc.disposition).not.toHaveBeenCalled()
  })

  it("keeps an unassigned task's crossing from a non-owner", async () => {
    viewer('MEMBER', 'a-viewer')
    cardCrossing({ task: { assigneeActorId: null } })
    await expect(
      crossingQueueService.rule(CALLER, 'bc-1', INPUT, ATTRIBUTION)
    ).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a card that was already ruled with 409', async () => {
    viewer('OWNER')
    cardCrossing({ disposition: 'CONFIRMED' })
    await expect(
      crossingQueueService.rule(CALLER, 'bc-1', INPUT, ATTRIBUTION)
    ).rejects.toMatchObject({ status: 409 })
    expect(bc.disposition).not.toHaveBeenCalled()
  })

  it('refuses a stale card (the crossing changed since it was read) with 409', async () => {
    viewer('OWNER')
    cardCrossing()
    bc.stateHash.mockResolvedValue('hash-2')
    await expect(
      crossingQueueService.rule(CALLER, 'bc-1', INPUT, ATTRIBUTION)
    ).rejects.toMatchObject({ status: 409 })
    expect(bc.disposition).not.toHaveBeenCalled()
  })
})

describe('tag', () => {
  beforeEach(() => {
    repo.findRulerMemberIds.mockResolvedValue([
      { id: 'm-viewer', role: 'OWNER' },
      { id: 'm-assignee', role: 'MEMBER' },
    ] as never)
    repo.createTag.mockResolvedValue({
      id: 'tag-1',
      createdAt: new Date('2026-01-05T00:00:00Z'),
    } as never)
    findActor.mockResolvedValue({ id: 'a-assignee' })
    findClerkId.mockResolvedValue('u-assignee')
    mockShouldNotify.mockResolvedValue(true)
  })

  it('records the tag and sends one in-app notification', async () => {
    viewer('OWNER', 'a-viewer')
    cardCrossing()
    const out = await crossingQueueService.tag(CALLER, 'bc-1', {
      memberId: 'm-assignee',
      message: 'can you look?',
    })
    expect(out).toEqual({ id: 'tag-1', createdAt: '2026-01-05T00:00:00.000Z' })
    expect(repo.createTag).toHaveBeenCalledWith({
      crossingId: 'bc-1',
      taggedMemberId: 'm-assignee',
      taggedById: 'm-viewer',
      message: 'can you look?',
    })
    expect(createNotification).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      recipientActorId: 'a-assignee',
      type: 'CROSSING_TAGGED',
      taskId: 't-1',
      triggerActorId: 'a-viewer',
    })
    expect(bc.disposition).not.toHaveBeenCalled()
  })

  it("respects the recipient's in-app preference", async () => {
    viewer('OWNER')
    cardCrossing()
    mockShouldNotify.mockResolvedValue(false)
    await crossingQueueService.tag(CALLER, 'bc-1', {
      memberId: 'm-assignee',
      message: null,
    })
    expect(repo.createTag).toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('refuses tagging someone who may not rule on it with 422', async () => {
    viewer('OWNER')
    cardCrossing()
    await expect(
      crossingQueueService.tag(CALLER, 'bc-1', {
        memberId: 'm-bystander',
        message: null,
      })
    ).rejects.toMatchObject({ status: 422 })
    expect(repo.createTag).not.toHaveBeenCalled()
  })

  it('refuses tagging yourself with 400', async () => {
    viewer('OWNER')
    cardCrossing()
    await expect(
      crossingQueueService.tag(CALLER, 'bc-1', {
        memberId: 'm-viewer',
        message: null,
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('keeps the tag when the notification fails', async () => {
    viewer('OWNER')
    cardCrossing()
    createNotification.mockRejectedValue(new Error('inbox down'))
    await expect(
      crossingQueueService.tag(CALLER, 'bc-1', {
        memberId: 'm-assignee',
        message: null,
      })
    ).resolves.toMatchObject({ id: 'tag-1' })
  })

  it('refuses tagging from an ineligible viewer with 403', async () => {
    viewer('MEMBER', 'a-someone-else')
    cardCrossing()
    await expect(
      crossingQueueService.tag(CALLER, 'bc-1', {
        memberId: 'm-assignee',
        message: null,
      })
    ).rejects.toMatchObject({ status: 403 })
  })
})
