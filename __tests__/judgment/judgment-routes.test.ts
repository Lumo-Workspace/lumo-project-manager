/** @jest-environment node */
/**
 * LUM-1356 — the judgment routes: the four review actions refuse an API key
 * with 403 before the service is reached; a browser session reaches the
 * matching service method; the caller's channel comes from the credential.
 */
import { NextRequest } from 'next/server'

const mockIdentity = jest.fn()
jest.mock('@/lib/auth', () => ({
  requireIdentity: (...args: unknown[]) => mockIdentity(...args),
}))

const mockService = {
  propose: jest.fn(async () => ({ judgment: { id: 'j1' }, revision: {} })),
  revise: jest.fn(async () => ({ judgment: { id: 'j1' }, revision: {} })),
  approve: jest.fn(async () => ({ id: 'r1', state: 'APPROVED' })),
  reject: jest.fn(async () => ({ id: 'r1', state: 'REJECTED' })),
  requestChanges: jest.fn(async () => ({
    id: 'r1',
    state: 'CHANGES_REQUESTED',
  })),
  withdraw: jest.fn(async () => ({ id: 'r1', state: 'WITHDRAWN' })),
}
jest.mock('@/lib/services/judgment/judgment.service', () => ({
  get judgmentService() {
    return mockService
  },
}))
jest.mock('@/lib/services/judgment/judgment-read.service', () => ({
  judgmentReadService: {
    list: jest.fn(async () => ({ judgments: [], nextCursor: null })),
    inbox: jest.fn(async () => ({ items: [] })),
  },
}))

import { POST as reviewAction } from '@/app/api/judgment-revisions/[revisionId]/[action]/route'
import { POST as propose } from '@/app/api/judgments/route'
import { POST as revise } from '@/app/api/judgments/[judgmentId]/revisions/route'

const identity = (source: 'bearer' | 'clerk') => ({
  clerkId: 'user_1',
  memberId: 'mem_1',
  workspaceId: 'ws_1',
  workspaceSlug: 'acme',
  workspaceName: 'Acme',
  source,
})

const DIGEST = `sha256:${'a'.repeat(64)}`

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const review = (
  action: string,
  body: unknown = { digest: DIGEST, reason: 'why' }
) =>
  reviewAction(post(`/api/judgment-revisions/r1/${action}`, body), {
    params: Promise.resolve({ revisionId: 'r1', action }),
  })

const CONTENT = {
  description: 'Tests live under __tests__',
  statement: 'New test files go under __tests__.',
  kind: 'CONSTRAINT',
  rationale: 'One place to look.',
  limits: ['Legacy tests/ keeps running.'],
  origin: 'HUMAN_JUDGMENT',
}

beforeEach(() => jest.clearAllMocks())

describe('review actions are human-only', () => {
  const actions = [
    ['approve', 'approve'],
    ['reject', 'reject'],
    ['request-changes', 'requestChanges'],
    ['withdraw', 'withdraw'],
  ] as const

  it.each(actions)('%s: a CLI key gets 403 and nothing runs', async action => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    const response = await review(action)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/browser session/)
    for (const method of Object.values(mockService)) {
      expect(method).not.toHaveBeenCalled()
    }
  })

  it.each(actions)(
    '%s: a browser session reaches the service as WEB',
    async (action, method) => {
      mockIdentity.mockResolvedValue(identity('clerk'))
      const response = await review(action)
      expect(response.status).toBe(200)
      expect(mockService[method]).toHaveBeenCalledTimes(1)
      expect(mockService[method]).toHaveBeenCalledWith(
        {
          memberId: 'mem_1',
          workspaceId: 'ws_1',
          workspaceSlug: 'acme',
          via: 'WEB',
        },
        { revisionId: 'r1', digest: DIGEST, reason: 'why' }
      )
    }
  )

  it('an unknown action is a 404, a malformed digest a 400', async () => {
    mockIdentity.mockResolvedValue(identity('clerk'))
    expect((await review('delete')).status).toBe(404)
    expect((await review('approve', { digest: 'nope' })).status).toBe(400)
    for (const method of Object.values(mockService)) {
      expect(method).not.toHaveBeenCalled()
    }
  })
})

describe('proposing and revising', () => {
  it('a CLI key may propose; the caller is marked CLI whatever the body says', async () => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    const response = await propose(
      post('/api/judgments', { name: 'tests-location', content: CONTENT })
    )
    expect(response.status).toBe(201)
    const [caller, input] = mockService.propose.mock.calls[0] as unknown as [
      { via: string },
      { name: string; projectId: string | null },
    ]
    expect(caller.via).toBe('CLI')
    expect(input).toMatchObject({ name: 'tests-location', projectId: null })
  })

  it('refuses a body that tries to set server-owned fields', async () => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    for (const extra of [
      { recordedVia: 'WEB' },
      { judgedByMemberId: 'mem_owner' },
      { state: 'APPROVED' },
      { digest: DIGEST },
    ]) {
      const response = await propose(
        post('/api/judgments', {
          name: 'tests-location',
          content: { ...CONTENT, ...extra },
        })
      )
      expect(response.status).toBe(400)
    }
    expect(mockService.propose).not.toHaveBeenCalled()
  })

  it('revise requires baseRevisionId to be stated (null is a statement)', async () => {
    mockIdentity.mockResolvedValue(identity('bearer'))
    const call = (body: unknown) =>
      revise(post('/api/judgments/j1/revisions', body), {
        params: Promise.resolve({ judgmentId: 'j1' }),
      })
    expect((await call({ content: CONTENT })).status).toBe(400)
    expect(
      (await call({ baseRevisionId: null, content: CONTENT })).status
    ).toBe(201)
    expect(mockService.revise).toHaveBeenCalledWith(
      expect.objectContaining({ via: 'CLI' }),
      expect.objectContaining({ judgmentId: 'j1', baseRevisionId: null })
    )
  })
})
