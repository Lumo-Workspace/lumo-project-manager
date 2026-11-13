/**
 * @jest-environment jsdom
 *
 * LUM-1336: an index card carries its task context on the face, says when a
 * section failed instead of showing it empty, and only lets a ruling through
 * — one deliberate click, with the state hash it was read at — once every
 * section has loaded.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { CrossingCard } from '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/CrossingCard'
import { CardActions } from '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/CardActions'
import { useCrossingCardActions } from '@/app/workspace/[workspaceUrl]/hooks/useCrossingQueue'
import type {
  CardContextView,
  QueueCardView,
} from '@/lib/api-client/boundary-crossing-queue'

jest.mock('react-intl', () => ({
  useIntl: () => ({
    locale: 'en',
    formatMessage: (
      { id, defaultMessage }: { id: string; defaultMessage?: string },
      values?: Record<string, unknown>
    ) => {
      const messages = jest.requireActual('@/lib/i18n/en.json') as Record<
        string,
        string
      >
      let text = messages[id] ?? defaultMessage ?? id
      for (const [k, v] of Object.entries(values ?? {}))
        text = text.replace(`{${k}}`, String(v))
      return text
    },
  }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/app/workspace/[workspaceUrl]/hooks/useCrossingQueue', () => ({
  useCrossingCardActions: jest.fn(),
}))
jest.mock(
  '@/app/workspace/[workspaceUrl]/components/TaskDetailTimeline/BoundaryCrossingsPanel',
  () => ({
    AttributionLine: () => null,
    EditChangeBlock: () => null,
  })
)

const ruleMutate = jest.fn(async (_payload: unknown): Promise<unknown> => ({}))
;(useCrossingCardActions as jest.Mock).mockReturnValue({
  rule: { mutateAsync: ruleMutate, isPending: false },
  tag: { mutate: jest.fn(), isPending: false },
})

const CARD: QueueCardView = {
  id: 'bc-1',
  ref: 'LUM-X7',
  category: 'NEW_NPM_DEPENDENCY',
  severity: 'MEDIUM',
  advisory: false,
  blocking: true,
  summary: 'npm install left-pad',
  detectedAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  occurrenceCount: 1,
  taskId: 't-1',
  taskIdentifier: 'LUM-12',
  taskTitle: 'Add padding',
  taskStatus: 'IN_PROGRESS',
  projectId: 'p-1',
  projectName: 'Lumo',
  taggedForMe: null,
}

function context(over: Partial<CardContextView> = {}): CardContextView {
  const ok = <T,>(data: T) => ({ status: 'ok' as const, data })
  return {
    crossingId: 'bc-1',
    taskId: 't-1',
    crossing: ok({
      view: {
        disposition: null,
        agentContext: 'Add a padding helper for the CLI table',
        editChange: null,
        policyRuleText: null,
        detail: 'npm install left-pad',
        systemExplanation: null,
        triageProbability: null,
        explanations: [],
        attribution: {
          workspaceMemberId: null,
          sessionId: null,
          agent: null,
          worktreeBranch: null,
          model: null,
        },
      } as never,
      blocking: true,
      stateHash: 'h-1',
    }),
    history: ok({ otherOpen: 0, sameCategoryRulings: [], others: [] }),
    task: ok({
      identifier: 'LUM-12',
      title: 'Add padding',
      description: 'Pad table cells.\nUse a small dependency.',
      status: 'IN_PROGRESS',
      projectName: 'Lumo',
      milestoneName: null,
      sprintName: null,
      assigneeMemberId: null,
    }),
    testCases: ok([]),
    decisions: ok([]),
    pullRequests: ok([]),
    tags: ok([]),
    tagTargets: ok([]),
    ...over,
  }
}

function renderCard(ctx: CardContextView | null, onShuffle = jest.fn()) {
  render(
    <CrossingCard
      card={CARD}
      context={ctx}
      members={[]}
      taskHref='/workspace/ws/my-tasks/LUM-12/record#boundary-crossings'
      onRetry={jest.fn()}
      actions={
        <CardActions
          crossingId='bc-1'
          context={ctx}
          members={[]}
          onShuffle={onShuffle}
        />
      }
    />
  )
}

beforeEach(() => jest.clearAllMocks())

it('shows the task, its purpose and the turn intent on the face', () => {
  renderCard(context())
  expect(screen.getAllByText('LUM-12')[0]).toBeTruthy()
  expect(screen.getByText('Add padding')).toBeTruthy()
  expect(screen.getByText(/Pad table cells\./)).toBeTruthy()
  expect(
    screen.getByText('Add a padding helper for the CLI table')
  ).toBeTruthy()
})

it('rules with one click, sending the state hash the card was read at', () => {
  renderCard(context())
  fireEvent.click(screen.getByTestId('crossing-card-false-positive'))
  expect(ruleMutate).toHaveBeenCalledTimes(1)
  expect(ruleMutate.mock.calls[0]?.[0]).toEqual({
    disposition: 'FALSE_POSITIVE',
    stateHash: 'h-1',
  })
})

it('disables ruling and says why when a section failed to load', () => {
  renderCard(context({ decisions: { status: 'error' } }))
  const fp = screen.getByTestId(
    'crossing-card-false-positive'
  ) as HTMLButtonElement
  const confirm = screen.getByTestId(
    'crossing-card-confirm'
  ) as HTMLButtonElement
  expect(fp.disabled).toBe(true)
  expect(confirm.disabled).toBe(true)
  expect(
    screen.getByText(/Ruling is disabled until every section/)
  ).toBeTruthy()
  // The failed section is flagged, not rendered as an empty list.
  expect(screen.getAllByText("Couldn't load").length).toBeGreaterThan(0)
  fireEvent.click(fp)
  expect(ruleMutate).not.toHaveBeenCalled()
})

it('keeps ruling disabled while the context is still loading', () => {
  renderCard(null)
  expect(
    (screen.getByTestId('crossing-card-confirm') as HTMLButtonElement).disabled
  ).toBe(true)
})

it('shuffles without ruling', () => {
  const onShuffle = jest.fn()
  renderCard(context(), onShuffle)
  fireEvent.click(screen.getByTestId('crossing-card-shuffle'))
  expect(onShuffle).toHaveBeenCalled()
  expect(ruleMutate).not.toHaveBeenCalled()
})

it('still toasts the ruling when the card unmounts before the write settles', async () => {
  let settle: (v: unknown) => void = () => {}
  ruleMutate.mockImplementationOnce(
    () => new Promise<unknown>(resolve => (settle = resolve))
  )
  const { unmount } = render(
    <CardActions
      crossingId='bc-1'
      context={context()}
      members={[]}
      onShuffle={jest.fn()}
    />
  )
  fireEvent.click(screen.getByTestId('crossing-card-confirm'))
  // The queue refresh deals the next card and this one goes away first.
  unmount()
  await act(async () => settle({}))
  expect(toast.success).toHaveBeenCalledTimes(1)
})

it('toasts the error and not a success when the ruling is refused', async () => {
  ruleMutate.mockRejectedValueOnce(new Error('This crossing changed'))
  renderCard(context())
  await act(async () => {
    fireEvent.click(screen.getByTestId('crossing-card-false-positive'))
  })
  expect(toast.error).toHaveBeenCalledWith('This crossing changed')
  expect(toast.success).not.toHaveBeenCalled()
})
