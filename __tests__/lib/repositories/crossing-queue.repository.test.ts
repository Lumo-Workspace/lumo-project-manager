/**
 * LUM-1336: the queue read is capped, so the cap must keep the cards dealt
 * first (non-advisory, then most severe, then oldest) — never just the oldest
 * rows, which would push a newer blocking crossing past the cap.
 */
import {
  crossingQueueRepository,
  QUEUE_READ_CAP,
} from '@/lib/repositories/crossing-queue.repository'

const mockFindMany = jest.fn()

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    boundaryCrossing: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

beforeEach(() => mockFindMany.mockReset().mockResolvedValue([]))

describe('crossingQueueRepository.findOpenQueueRows', () => {
  it('orders blocking-capable rows first before applying the cap', async () => {
    await crossingQueueRepository.findOpenQueueRows({
      workspaceId: 'ws-1',
      assigneeActorId: null,
      viewerMemberId: 'm-1',
    })
    const args = mockFindMany.mock.calls[0][0]
    expect(args.orderBy).toEqual([
      { advisory: 'asc' },
      { severity: 'desc' },
      { detectedAt: 'asc' },
    ])
    expect(args.take).toBe(QUEUE_READ_CAP)
  })

  it("scopes a non-owner's read to their own tasks", async () => {
    await crossingQueueRepository.findOpenQueueRows({
      workspaceId: 'ws-1',
      assigneeActorId: 'a-1',
      viewerMemberId: 'm-1',
    })
    expect(mockFindMany.mock.calls[0][0].where.task).toMatchObject({
      workspaceId: 'ws-1',
      assigneeActorId: 'a-1',
    })
  })
})
