/**
 * @jest-environment jsdom
 *
 * LUM-1336 follow-up: the queue page owns its scroll (the workspace shell
 * clips the page area), starts each newly dealt card at the top, and keeps
 * the current card on screen when only a background refetch fails.
 */
import { render, screen } from '@testing-library/react'
import { CrossingQueuePage } from '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/CrossingQueuePage'
import {
  useCrossingCard,
  useCrossingQueue,
  useShuffledIds,
} from '@/app/workspace/[workspaceUrl]/hooks/useCrossingQueue'

jest.mock('react-intl', () => ({
  useIntl: () => ({
    locale: 'en',
    formatMessage: ({
      defaultMessage,
      id,
    }: {
      id: string
      defaultMessage?: string
    }) => defaultMessage ?? id,
  }),
}))
jest.mock('next/navigation', () => ({
  useParams: () => ({ workspaceUrl: 'ws' }),
}))
jest.mock('@/app/workspace/[workspaceUrl]/hooks/useCrossingQueue', () => ({
  useCrossingQueue: jest.fn(),
  useCrossingCard: jest.fn(),
  useShuffledIds: jest.fn(),
}))
jest.mock(
  '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/CrossingCard',
  () => ({
    CrossingCard: ({ card }: { card: { ref: string } }) => (
      <div data-testid='card'>{card.ref}</div>
    ),
  })
)
jest.mock(
  '@/app/workspace/[workspaceUrl]/components/pages/crossing-queue/CardActions',
  () => ({ CardActions: () => null })
)

const card = (id: string) => ({
  id,
  ref: `LUM-${id}`,
  blocking: true,
  taskIdentifier: 'LUM-12',
})

function setQueue(cards: unknown[], error: string | null = null) {
  ;(useCrossingQueue as jest.Mock).mockReturnValue({
    queue: { cards, truncated: false, blockingCount: cards.length },
    loading: false,
    error,
    refresh: jest.fn(),
  })
}

const scrollTo = jest.fn()
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  })
})
beforeEach(() => {
  jest.clearAllMocks()
  ;(useCrossingCard as jest.Mock).mockReturnValue({
    context: null,
    refresh: jest.fn(),
  })
  ;(useShuffledIds as jest.Mock).mockReturnValue({
    shuffled: [],
    shuffle: jest.fn(),
  })
})

it('renders inside its own vertical scroll area', () => {
  setQueue([card('1')])
  render(<CrossingQueuePage members={[]} projects={[]} />)
  const scroller = screen.getByTestId('crossing-queue-scroll')
  expect(scroller.className).toMatch(/overflow-y-auto/)
  expect(scroller.className).toMatch(/flex-1/)
})

it('scrolls back to the top when the next card is dealt', () => {
  setQueue([card('1'), card('2')])
  const { rerender } = render(<CrossingQueuePage members={[]} projects={[]} />)
  scrollTo.mockClear()
  // Same top card on a refetch: the reader keeps their place.
  rerender(<CrossingQueuePage members={[]} projects={[]} />)
  expect(scrollTo).not.toHaveBeenCalled()

  setQueue([card('2')])
  rerender(<CrossingQueuePage members={[]} projects={[]} />)
  expect(screen.getByTestId('card')).toHaveTextContent('LUM-2')
  expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
})

it('keeps the dealt card when a background refetch fails', () => {
  setQueue([card('1')], 'network down')
  render(<CrossingQueuePage members={[]} projects={[]} />)
  expect(screen.getByTestId('card')).toHaveTextContent('LUM-1')
  expect(screen.queryByText("Couldn't load your queue.")).toBeNull()
})

it('shows the load error when there is no queue at all', () => {
  ;(useCrossingQueue as jest.Mock).mockReturnValue({
    queue: null,
    loading: false,
    error: 'network down',
    refresh: jest.fn(),
  })
  render(<CrossingQueuePage members={[]} projects={[]} />)
  expect(screen.getByText("Couldn't load your queue.")).toBeTruthy()
})
