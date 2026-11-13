import {
  canRule,
  countBlocking,
  failedSections,
  purposeExcerpt,
} from '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/card-state'
import type { CardContextView } from '@/lib/api-client/boundary-crossing-queue'

function okContext(
  over: Partial<CardContextView> = {},
  disposition: string | null = null
): CardContextView {
  const ok = <T>(data: T) => ({ status: 'ok' as const, data })
  return {
    crossingId: 'bc-1',
    taskId: 't-1',
    crossing: ok({
      view: { disposition } as never,
      blocking: true,
      stateHash: 'h-1',
    }),
    history: ok({ otherOpen: 0, sameCategoryRulings: [], others: [] }),
    task: ok({} as never),
    testCases: ok([]),
    decisions: ok([]),
    pullRequests: ok([]),
    tags: ok([]),
    tagTargets: ok([]),
    ...over,
  }
}

describe('LUM-1336 card readiness', () => {
  it('allows a ruling only when every section loaded and the crossing is open', () => {
    expect(canRule(okContext())).toBe(true)
    expect(canRule(null)).toBe(false)
    expect(canRule(okContext({}, 'CONFIRMED'))).toBe(false)
  })

  it('names each failed section and refuses the ruling', () => {
    const ctx = okContext({
      decisions: { status: 'error' },
      pullRequests: { status: 'error' },
    })
    expect(failedSections(ctx)).toEqual(['decisions', 'pullRequests'])
    expect(canRule(ctx)).toBe(false)
  })
})

describe('LUM-1336 purposeExcerpt', () => {
  it('keeps the first three non-empty lines', () => {
    expect(purposeExcerpt('One\n\nTwo\n  Three  \nFour')).toBe(
      'One\nTwo\nThree'
    )
  })

  it('is null for a missing or blank description', () => {
    expect(purposeExcerpt(null)).toBeNull()
    expect(purposeExcerpt(' \n ')).toBeNull()
  })
})

describe('countBlocking', () => {
  it('counts only the blocking cards it is given', () => {
    expect(
      countBlocking([
        { blocking: true },
        { blocking: false },
        { blocking: true },
      ])
    ).toBe(2)
    expect(countBlocking([])).toBe(0)
  })
})
