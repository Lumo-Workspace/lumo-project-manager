/** @jest-environment jsdom */
/**
 * LUM-1356 — the Team memory queue and review page: conflicts are shown
 * first and marked, a candidate with blockers cannot be approved, review
 * actions need a reason, and stored text is rendered as text, never markup.
 */
import en from '@/lib/i18n/en.json'

jest.mock('react-intl', () => ({
  useIntl: () => ({
    formatDate: (value: string) => `date(${value})`,
    formatMessage: (
      { id }: { id: string },
      values?: Record<string, unknown>
    ) => {
      const template = (en as Record<string, string>)[id]
      if (template === undefined) throw new Error(`missing en key: ${id}`)
      return template.replace(/\{(\w+)\}/g, (match, key) =>
        values?.[key] != null ? String(values[key]) : match
      )
    },
  }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const mockAct = jest.fn(async () => ({}))
const mockRevise = jest.fn(async () => ({ revision: { id: 'rev_new' } }))
jest.mock('@/app/workspace/[workspaceUrl]/hooks/useJudgments', () => ({
  useJudgmentReviewActions: () => ({
    act: { mutateAsync: mockAct, isPending: false },
    revise: { mutateAsync: mockRevise, isPending: false },
  }),
}))

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type {
  JudgmentReviewView,
  JudgmentRevisionView,
} from '@/lib/api-client/judgments'
import { JudgmentQueue } from '@/app/workspace/[workspaceUrl]/components/pages/team-memory/JudgmentQueue'
import { JudgmentReview } from '@/app/workspace/[workspaceUrl]/components/pages/team-memory/JudgmentReview'
import {
  revisionIdFromPath,
  teamMemoryPath,
} from '@/app/workspace/[workspaceUrl]/components/pages/team-memory/team-memory-path'

const revision = (
  overrides: Partial<JudgmentRevisionView> = {}
): JudgmentRevisionView => ({
  id: 'rev_1',
  judgmentId: 'jdg_1',
  version: 1,
  digest: `sha256:${'a'.repeat(64)}`,
  baseRevisionId: null,
  description: 'Tests live under __tests__',
  statement: 'New test files go under __tests__.',
  kind: 'CONSTRAINT',
  rationale: 'One place to look.',
  polarity: null,
  assertionKey: null,
  assertionValue: null,
  scopeRepo: null,
  scopePathGlobs: null,
  scopeTopic: null,
  when: [],
  limits: ['Legacy tests/ keeps running.'],
  validFrom: null,
  validUntil: null,
  origin: 'AGENT_JUDGMENT',
  judgedByMemberId: null,
  judgedByLabel: null,
  recordedByMemberId: 'mem_1',
  recordedByAgent: 'CLAUDE_CODE',
  recordedVia: 'CLI',
  captureMethod: 'EXPLICIT',
  sourceSessionId: null,
  sourceTaskId: null,
  sourceRefs: [],
  evidence: [],
  context: null,
  alternatives: null,
  expectedOutcome: null,
  state: 'PROPOSED',
  contentSignals: null,
  createdAt: '2026-11-19T00:00:00.000Z',
  conflictsWith: [],
  approvalBlockers: [],
  ...overrides,
})

const judgment = (overrides = {}) => ({
  id: 'jdg_1',
  name: 'tests-location',
  projectId: null,
  activeRevisionId: null,
  pausedAt: null,
  paused: false,
  ...overrides,
})

const reviewProps = (review: JudgmentReviewView, canReview = true) => ({
  review,
  memberNames: new Map([['mem_1', 'Ada']]),
  canReview,
  backHref: '/workspace/acme/team-memory',
  onBack: jest.fn(),
  hrefFor: (id: string) => `/workspace/acme/team-memory/${id}`,
  onOpen: jest.fn(),
})

beforeEach(() => jest.clearAllMocks())

describe('team memory paths', () => {
  it('round-trips the revision id', () => {
    expect(teamMemoryPath('acme')).toBe('/workspace/acme/team-memory')
    const path = teamMemoryPath('acme', 'rev_1')
    expect(path).toBe('/workspace/acme/team-memory/rev_1')
    expect(revisionIdFromPath(path, 'acme')).toBe('rev_1')
    expect(revisionIdFromPath('/workspace/acme/team-memory', 'acme')).toBeNull()
    expect(revisionIdFromPath('/workspace/acme/my-tasks', 'acme')).toBeNull()
  })
})

describe('JudgmentQueue', () => {
  const conflicting = {
    judgment: judgment({ id: 'jdg_2', name: 'tests-under-tests-dir' }),
    revision: revision({
      id: 'rev_2',
      judgmentId: 'jdg_2',
      description: 'Tests live under tests/',
      conflictsWith: [
        {
          judgmentId: 'jdg_1',
          judgmentName: 'tests-location',
          revisionId: 'rev_1',
        },
      ],
      approvalBlockers: ['CONFLICT'],
    }),
  }
  const plain = { judgment: judgment(), revision: revision() }

  it('keeps the server order (conflicts first) and marks the conflict', () => {
    const onOpen = jest.fn()
    render(
      <JudgmentQueue
        pending={[conflicting, plain]}
        active={[]}
        loading={false}
        error={null}
        onRetry={jest.fn()}
        hrefFor={id => `/workspace/acme/team-memory/${id}`}
        onOpen={onOpen}
      />
    )
    const rows = screen.getAllByTestId('judgment-row')
    expect(rows.map(row => row.getAttribute('data-conflict'))).toEqual([
      'true',
      'false',
    ])
    expect(within(rows[0]!).getByText('Conflict')).toBeTruthy()
    expect(
      within(rows[0]!).getByText('Conflicts with tests-location')
    ).toBeTruthy()
    expect(screen.getByTestId('team-memory-conflict-note').textContent).toBe(
      'Conflicting entries are listed first: 1'
    )
    expect(screen.getByTestId('team-memory-tab-pending').textContent).toBe(
      'Waiting for review (2)'
    )
    expect(rows[0]!.getAttribute('href')).toBe(
      '/workspace/acme/team-memory/rev_2'
    )
    fireEvent.click(rows[1]!)
    expect(onOpen).toHaveBeenCalledWith('rev_1')
  })

  it('shows the empty state and the load error', () => {
    const { rerender } = render(
      <JudgmentQueue
        pending={[]}
        active={[]}
        loading={false}
        error={null}
        onRetry={jest.fn()}
        hrefFor={id => id}
        onOpen={jest.fn()}
      />
    )
    expect(screen.getByText('Nothing is waiting for review')).toBeTruthy()
    const onRetry = jest.fn()
    rerender(
      <JudgmentQueue
        pending={[]}
        active={[]}
        loading={false}
        error='boom'
        onRetry={onRetry}
        hrefFor={id => id}
        onOpen={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('JudgmentReview', () => {
  it('approves the exact revision when nothing blocks it', async () => {
    const rev = revision()
    render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment(),
          revision: rev,
          activeRevision: null,
        })}
      />
    )
    const approve = screen.getByTestId('judgment-approve') as HTMLButtonElement
    expect(approve.disabled).toBe(false)
    fireEvent.click(approve)
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith({
        revision: rev,
        action: 'approve',
        reason: null,
      })
    )
  })

  it('cannot approve a candidate with blockers, and says why', () => {
    render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment(),
          revision: revision({
            origin: 'UNKNOWN',
            rationale: null,
            approvalBlockers: ['ORIGIN_UNKNOWN', 'RATIONALE_MISSING'],
          }),
          activeRevision: null,
        })}
      />
    )
    expect(
      (screen.getByTestId('judgment-approve') as HTMLButtonElement).disabled
    ).toBe(true)
    const blockers = screen.getByTestId('judgment-blockers')
    expect(blockers.textContent).toContain('Its origin is unknown')
    expect(blockers.textContent).toContain('No reason is recorded')
    expect(screen.getByText('Not recorded')).toBeTruthy()
  })

  it('shows the conflict and blocks approval', () => {
    render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment(),
          revision: revision({
            conflictsWith: [
              {
                judgmentId: 'jdg_2',
                judgmentName: 'other-entry',
                revisionId: 'rev_9',
              },
            ],
            approvalBlockers: ['CONFLICT'],
          }),
          activeRevision: null,
        })}
      />
    )
    const alert = screen.getByTestId('judgment-conflict-alert')
    expect(alert.textContent).toContain('other-entry')
    expect(
      (screen.getByTestId('judgment-approve') as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('rejecting needs a reason', async () => {
    const rev = revision()
    render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment(),
          revision: rev,
          activeRevision: null,
        })}
      />
    )
    fireEvent.click(screen.getByText('Reject'))
    const confirm = screen.getByRole('button', {
      name: 'Reject',
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Why are you rejecting this?'), {
      target: { value: '  Not a team convention.  ' },
    })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith({
        revision: rev,
        action: 'reject',
        reason: 'Not a team convention.',
      })
    )
  })

  it('offers withdraw only on the approved revision in effect', () => {
    const active = revision({ state: 'APPROVED' })
    const { unmount } = render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment({ activeRevisionId: 'rev_1' }),
          revision: active,
          activeRevision: null,
        })}
      />
    )
    expect(screen.getByTestId('judgment-withdraw')).toBeTruthy()
    expect(screen.queryByTestId('judgment-approve')).toBeNull()
    unmount()
    render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment({ activeRevisionId: 'rev_2' }),
          revision: revision({ state: 'SUPERSEDED' }),
          activeRevision: null,
        })}
      />
    )
    expect(screen.queryByTestId('judgment-withdraw')).toBeNull()
    expect(screen.queryByTestId('judgment-approve')).toBeNull()
  })

  it('disables the review actions for a member who may not review', () => {
    render(
      <JudgmentReview
        {...reviewProps(
          { judgment: judgment(), revision: revision(), activeRevision: null },
          false
        )}
      />
    )
    expect(
      (screen.getByTestId('judgment-approve') as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      screen.getByText('Only workspace owners can review here.')
    ).toBeTruthy()
  })

  it('renders stored text as text, never as markup', () => {
    const { container } = render(
      <JudgmentReview
        {...reviewProps({
          judgment: judgment({ name: 'x' }),
          revision: revision({
            description: '<img src=x onerror=alert(1)>',
            statement: '<script>alert(1)</script> **bold** [a](javascript:x)',
            limits: ['<b>limit</b>'],
          }),
          activeRevision: null,
        })}
      />
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(
      screen.getByText('<script>alert(1)</script> **bold** [a](javascript:x)')
    ).toBeTruthy()
  })

  it('a correction is proposed as a new version on the current base', async () => {
    const rev = revision({
      rationale: null,
      approvalBlockers: ['RATIONALE_MISSING'],
    })
    const props = reviewProps({
      judgment: judgment({ activeRevisionId: 'rev_0' }),
      revision: rev,
      activeRevision: null,
    })
    render(<JudgmentReview {...props} />)
    fireEvent.click(screen.getByTestId('judgment-edit'))
    fireEvent.change(screen.getByLabelText('Why'), {
      target: { value: 'The owner explained it.' },
    })
    fireEvent.click(screen.getByText('Propose this version'))
    await waitFor(() => expect(mockRevise).toHaveBeenCalledTimes(1))
    expect(mockRevise).toHaveBeenCalledWith({
      source: rev,
      baseRevisionId: 'rev_0',
      draft: {
        description: 'Tests live under __tests__',
        statement: 'New test files go under __tests__.',
        rationale: 'The owner explained it.',
        kind: 'CONSTRAINT',
        origin: 'AGENT_JUDGMENT',
        limits: ['Legacy tests/ keeps running.'],
      },
    })
    await waitFor(() => expect(props.onOpen).toHaveBeenCalledWith('rev_new'))
  })
})
