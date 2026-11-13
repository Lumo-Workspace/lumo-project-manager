/**
 * @jest-environment node
 *
 * LUM-1336: the Boundary Crossings tab routes. Ruling and tagging are web UI
 * actions — a bearer (agent/CLI) identity is refused 403 before the body is
 * read — and the bodies are strict.
 */
import { NextRequest } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { crossingQueueService } from '@/lib/services/crossing-queue.service'
import { POST as rulePOST } from '@/app/api/boundary-crossings/[crossingId]/rule/route'
import { POST as tagPOST } from '@/app/api/boundary-crossings/[crossingId]/tag/route'
import { GET as queueGET } from '@/app/api/boundary-crossings/queue/route'

jest.mock('@/lib/auth', () => ({ requireIdentity: jest.fn() }))
jest.mock('@/lib/api/audit-context', () => ({
  memberAuditContext: jest.fn(() => ({})),
}))
jest.mock('@/lib/services/crossing-queue.service', () => ({
  crossingQueueService: {
    getQueue: jest.fn(),
    rule: jest.fn(),
    tag: jest.fn(),
  },
}))

const mockIdentity = requireIdentity as jest.Mock
const service = crossingQueueService as jest.Mocked<typeof crossingQueueService>

const identity = (source: 'clerk' | 'bearer') => ({
  clerkId: 'u-1',
  memberId: 'm-1',
  workspaceId: 'ws-1',
  workspaceSlug: 'ws',
  workspaceName: 'WS',
  source,
})

const params = { params: Promise.resolve({ crossingId: 'bc-1' }) }

function post(url: string, body: unknown) {
  const json = jest.fn(() => Promise.resolve(body))
  const req = { json, headers: new Headers(), url } as unknown as NextRequest
  return { req, json }
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/boundary-crossings/[crossingId]/rule', () => {
  const BODY = { disposition: 'CONFIRMED', stateHash: 'h-1' }

  it('refuses a bearer identity before reading the body', async () => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    const { req, json } = post('http://x/rule', BODY)
    const res = await rulePOST(req, params)
    expect(res.status).toBe(403)
    expect(json).not.toHaveBeenCalled()
    expect(service.rule).not.toHaveBeenCalled()
  })

  it('rejects an extra field (strict body) with 400', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    const { req } = post('http://x/rule', { ...BODY, disposition: 'OPEN' })
    expect((await rulePOST(req, params)).status).toBe(400)
    const { req: req2 } = post('http://x/rule', {
      ...BODY,
      suppressSimilarInProject: true,
    })
    expect((await rulePOST(req2, params)).status).toBe(400)
    expect(service.rule).not.toHaveBeenCalled()
  })

  it('passes a browser ruling to the service and maps its 409', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    service.rule.mockRejectedValue(
      Object.assign(new Error('changed'), { status: 409 })
    )
    const { req } = post('http://x/rule', { ...BODY, dispositionNote: ' ok ' })
    const res = await rulePOST(req, params)
    expect(res.status).toBe(409)
    expect(service.rule).toHaveBeenCalledWith(
      { memberId: 'm-1', workspaceId: 'ws-1' },
      'bc-1',
      { disposition: 'CONFIRMED', note: 'ok', stateHash: 'h-1' },
      expect.objectContaining({ actorMemberId: 'm-1', actorClerkId: 'u-1' })
    )
  })
})

describe('POST /api/boundary-crossings/[crossingId]/tag', () => {
  it('refuses a bearer identity before reading the body', async () => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    const { req, json } = post('http://x/tag', { memberId: 'm-2' })
    expect((await tagPOST(req, params)).status).toBe(403)
    expect(json).not.toHaveBeenCalled()
  })

  it('creates a tag for a browser session', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    service.tag.mockResolvedValue({ id: 'tag-1', createdAt: 'now' })
    const { req } = post('http://x/tag', { memberId: 'm-2', message: 'look' })
    const res = await tagPOST(req, params)
    expect(res.status).toBe(201)
    expect(service.tag).toHaveBeenCalledWith(
      { memberId: 'm-1', workspaceId: 'ws-1' },
      'bc-1',
      { memberId: 'm-2', message: 'look' }
    )
  })
})

describe('GET /api/boundary-crossings/queue', () => {
  it('rejects an unknown filter with 400', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    const req = new NextRequest(
      'http://x/api/boundary-crossings/queue?filter=nope'
    )
    expect((await queueGET(req)).status).toBe(400)
  })

  it('defaults to the full queue', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    service.getQueue.mockResolvedValue({
      cards: [],
      blockingCount: 0,
      total: 0,
      truncated: false,
    })
    const req = new NextRequest('http://x/api/boundary-crossings/queue')
    expect((await queueGET(req)).status).toBe(200)
    expect(service.getQueue).toHaveBeenCalledWith(
      { memberId: 'm-1', workspaceId: 'ws-1' },
      { filter: 'all', projectId: null }
    )
  })
})
