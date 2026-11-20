import {
  conflictsByRevision,
  findConflictPairs,
  globLiteralPrefix,
  revisionsConflict,
  scopesOverlap,
  type ConflictSubject,
} from '@/lib/judgment/conflict'

function subject(overrides: Partial<ConflictSubject>): ConflictSubject {
  return {
    revisionId: 'rev_a',
    judgmentId: 'jdg_a',
    projectId: null,
    scopeRepo: null,
    scopePathGlobs: null,
    when: [],
    validFrom: null,
    validUntil: null,
    assertionKey: 'tests.location',
    assertionValue: '__tests__',
    ...overrides,
  }
}

const other = (overrides: Partial<ConflictSubject> = {}) =>
  subject({
    revisionId: 'rev_b',
    judgmentId: 'jdg_b',
    assertionValue: 'tests',
    ...overrides,
  })

describe('globLiteralPrefix', () => {
  it.each([
    ['src/api/**', 'src/api/'],
    ['./src/*.ts', 'src/'],
    ['/src/a/b.ts', 'src/a/b.ts'],
    ['**/*.test.ts', ''],
    ['docs/{a,b}/x', 'docs/'],
  ])('%s → %s', (glob, prefix) => {
    expect(globLiteralPrefix(glob)).toBe(prefix)
  })
})

describe('scopesOverlap (three-level conservative rule)', () => {
  it('project: same project or either workspace-wide overlaps', () => {
    expect(
      scopesOverlap(subject({ projectId: 'p1' }), other({ projectId: 'p1' }))
    ).toBe(true)
    expect(
      scopesOverlap(subject({ projectId: 'p1' }), other({ projectId: null }))
    ).toBe(true)
    expect(
      scopesOverlap(subject({ projectId: 'p1' }), other({ projectId: 'p2' }))
    ).toBe(false)
  })

  it('repo: either unset or equal ignoring case overlaps', () => {
    expect(
      scopesOverlap(
        subject({ scopeRepo: 'Acme/App' }),
        other({ scopeRepo: 'acme/app' })
      )
    ).toBe(true)
    expect(scopesOverlap(subject({ scopeRepo: 'acme/app' }), other())).toBe(
      true
    )
    expect(
      scopesOverlap(
        subject({ scopeRepo: 'acme/app' }),
        other({ scopeRepo: 'acme/web' })
      )
    ).toBe(false)
  })

  it('paths: either unset overlaps; otherwise a literal prefix of the other', () => {
    expect(
      scopesOverlap(subject({ scopePathGlobs: ['src/**'] }), other())
    ).toBe(true)
    expect(
      scopesOverlap(
        subject({ scopePathGlobs: ['src/**'] }),
        other({ scopePathGlobs: ['src/api/**'] })
      )
    ).toBe(true)
    expect(
      scopesOverlap(
        subject({ scopePathGlobs: ['src/api/**'] }),
        other({ scopePathGlobs: ['docs/**', 'src/**'] })
      )
    ).toBe(true)
    expect(
      scopesOverlap(
        subject({ scopePathGlobs: ['src/**'] }),
        other({ scopePathGlobs: ['docs/**'] })
      )
    ).toBe(false)
    // Cannot be proven disjoint from the prefix alone → reported as overlap.
    expect(
      scopesOverlap(
        subject({ scopePathGlobs: ['**/*.ts'] }),
        other({ scopePathGlobs: ['docs/**'] })
      )
    ).toBe(true)
  })

  it('when: the same field with different values is disjoint', () => {
    const claude = [{ field: 'agent', equals: 'CLAUDE_CODE' }]
    const codex = [{ field: 'agent', equals: 'CODEX' }]
    expect(
      scopesOverlap(subject({ when: claude }), other({ when: codex }))
    ).toBe(false)
    expect(
      scopesOverlap(subject({ when: claude }), other({ when: claude }))
    ).toBe(true)
    expect(
      scopesOverlap(
        subject({ when: claude }),
        other({ when: [{ field: 'repo', equals: 'a/b' }] })
      )
    ).toBe(true)
  })

  it('validity: windows that do not intersect are disjoint; the end is exclusive', () => {
    const jan = new Date('2027-01-01T00:00:00Z')
    const feb = new Date('2027-02-01T00:00:00Z')
    expect(
      scopesOverlap(subject({ validUntil: jan }), other({ validFrom: jan }))
    ).toBe(false)
    expect(
      scopesOverlap(subject({ validUntil: feb }), other({ validFrom: jan }))
    ).toBe(true)
    expect(
      scopesOverlap(subject({ validFrom: feb }), other({ validUntil: jan }))
    ).toBe(false)
  })
})

describe('revisionsConflict', () => {
  it('needs different judgments, the same key and different values', () => {
    expect(revisionsConflict(subject({}), other())).toBe(true)
    expect(
      revisionsConflict(subject({}), other({ assertionValue: '__tests__' }))
    ).toBe(false)
    expect(
      revisionsConflict(subject({}), other({ assertionKey: 'lint.tool' }))
    ).toBe(false)
  })

  it('never fires between revisions of the same judgment', () => {
    expect(revisionsConflict(subject({}), other({ judgmentId: 'jdg_a' }))).toBe(
      false
    )
  })

  it('never fires without an assertion', () => {
    expect(
      revisionsConflict(
        subject({ assertionKey: null, assertionValue: null }),
        other()
      )
    ).toBe(false)
  })

  it('does not fire when the scopes are disjoint', () => {
    expect(
      revisionsConflict(
        subject({ projectId: 'p1' }),
        other({ projectId: 'p2' })
      )
    ).toBe(false)
  })

  it('compares values structurally', () => {
    expect(
      revisionsConflict(
        subject({ assertionValue: true }),
        other({ assertionValue: true })
      )
    ).toBe(false)
    expect(
      revisionsConflict(
        subject({ assertionValue: 1 }),
        other({ assertionValue: '1' })
      )
    ).toBe(true)
  })
})

describe('findConflictPairs / conflictsByRevision', () => {
  it('reports each pair once and indexes both sides', () => {
    const a = subject({})
    const b = other()
    const c = subject({
      revisionId: 'rev_c',
      judgmentId: 'jdg_c',
      assertionKey: 'lint.tool',
      assertionValue: 'eslint',
    })
    expect(findConflictPairs([a, b, c])).toEqual([{ a, b }])
    const index = conflictsByRevision([a, b, c])
    expect(index.get('rev_a')).toEqual([b])
    expect(index.get('rev_b')).toEqual([a])
    expect(index.has('rev_c')).toBe(false)
  })
})
