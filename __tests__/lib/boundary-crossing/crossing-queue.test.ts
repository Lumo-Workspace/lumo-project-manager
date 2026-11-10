import {
  firstLine,
  isEligibleRuler,
  orderQueueCards,
  summarizeTaskHistory,
  type HistoryCrossing,
} from '@/lib/boundary-crossing/crossing-queue'

describe('LUM-1336 isEligibleRuler', () => {
  it('deals every crossing to an OWNER, assigned or not', () => {
    const owner = { role: 'OWNER' as const, actorId: 'a-owner' }
    expect(isEligibleRuler(owner, 'a-someone')).toBe(true)
    expect(isEligibleRuler(owner, null)).toBe(true)
  })

  it('deals a member only the crossings on their own tasks', () => {
    const member = { role: 'MEMBER' as const, actorId: 'a-1' }
    expect(isEligibleRuler(member, 'a-1')).toBe(true)
    expect(isEligibleRuler(member, 'a-2')).toBe(false)
  })

  it('keeps an unassigned task from a non-owner, even one with no actor', () => {
    expect(isEligibleRuler({ role: 'MEMBER', actorId: 'a-1' }, null)).toBe(
      false
    )
    expect(isEligibleRuler({ role: 'MEMBER', actorId: null }, null)).toBe(false)
  })
})

describe('LUM-1336 orderQueueCards', () => {
  const card = (
    id: string,
    blocking: boolean,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    detectedAt: string
  ) => ({ id, blocking, severity, detectedAt })

  it('deals blocking first, then HIGH → LOW, then oldest first', () => {
    const ordered = orderQueueCards([
      card('advisory-high', false, 'HIGH', '2026-01-01T00:00:00Z'),
      card('blocking-low', true, 'LOW', '2026-01-01T00:00:00Z'),
      card('blocking-high-new', true, 'HIGH', '2026-03-01T00:00:00Z'),
      card('blocking-high-old', true, 'HIGH', '2026-02-01T00:00:00Z'),
      card('advisory-low', false, 'LOW', '2026-01-01T00:00:00Z'),
    ])
    expect(ordered.map(c => c.id)).toEqual([
      'blocking-high-old',
      'blocking-high-new',
      'blocking-low',
      'advisory-high',
      'advisory-low',
    ])
  })

  it('returns a new array and leaves the input alone', () => {
    const input = [
      card('b', false, 'LOW', '2026-01-02T00:00:00Z'),
      card('a', true, 'LOW', '2026-01-01T00:00:00Z'),
    ]
    const ordered = orderQueueCards(input)
    expect(ordered).not.toBe(input)
    expect(input.map(c => c.id)).toEqual(['b', 'a'])
  })
})

describe('LUM-1336 summarizeTaskHistory', () => {
  const row = (
    id: string,
    category: string,
    disposition: HistoryCrossing['disposition'],
    detectedAt: string,
    dispositionedAt: string | null = null
  ): HistoryCrossing => ({
    id,
    ref: `LUM-X${id}`,
    category,
    severity: 'MEDIUM',
    disposition,
    dispositionedAt,
    dispositionedById: disposition ? 'm-1' : null,
    detectedAt,
  })

  it('counts other open crossings and lists same-category rulings newest first', () => {
    const history = summarizeTaskHistory(
      [
        row('1', 'NEW_NPM_DEPENDENCY', null, '2026-01-05T00:00:00Z'),
        row(
          '2',
          'NEW_NPM_DEPENDENCY',
          'FALSE_POSITIVE',
          '2026-01-01T00:00:00Z',
          '2026-01-02T00:00:00Z'
        ),
        row(
          '3',
          'NEW_NPM_DEPENDENCY',
          'CONFIRMED',
          '2026-01-02T00:00:00Z',
          '2026-01-04T00:00:00Z'
        ),
        row(
          '4',
          'HARDCODED_SECRET',
          'CONFIRMED',
          '2026-01-03T00:00:00Z',
          '2026-01-03T00:00:00Z'
        ),
        row('5', 'HARDCODED_SECRET', null, '2026-01-04T00:00:00Z'),
      ],
      '1'
    )
    expect(history.otherOpen).toBe(1)
    expect(history.sameCategoryRulings.map(c => c.id)).toEqual(['3', '2'])
    expect(history.others.map(c => c.id)).toEqual(['2', '3', '4', '5'])
  })

  it('is empty for a task whose only crossing is the one on the card', () => {
    expect(
      summarizeTaskHistory([row('1', 'X', null, '2026-01-01T00:00:00Z')], '1')
    ).toEqual({ otherOpen: 0, sameCategoryRulings: [], others: [] })
  })
})

describe('LUM-1336 firstLine', () => {
  it('keeps only the first line, trimmed', () => {
    expect(firstLine('  npm install left-pad \nmore detail')).toBe(
      'npm install left-pad'
    )
  })
})
