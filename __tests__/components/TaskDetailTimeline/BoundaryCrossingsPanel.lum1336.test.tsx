/** @jest-environment jsdom */
/**
 * LUM-1336 follow-up — the crossing panel's long-content and draft-state
 * fixes: the triggering command toggles by keyboard, scrolls when expanded and
 * survives a text selection; a ruling clears that row's draft note; a stale
 * suppression preview never overwrites the newer one.
 */
jest.mock('react-intl', () => ({
  useIntl: () => ({
    locale: 'en',
    formatMessage: (
      { id, defaultMessage }: { id: string; defaultMessage?: string },
      values?: Record<string, unknown>
    ) => {
      let msg = defaultMessage ?? id
      for (const [k, v] of Object.entries(values ?? {})) {
        const plural = new RegExp(
          `\\{${k}, plural, one \\{([^}]*)\\} other \\{([^}]*)\\}\\}`
        )
        const hit = msg.match(plural)
        if (hit) {
          const branch = Number(v) === 1 ? hit[1]! : hit[2]!
          msg = msg.replace(plural, branch.split('#').join(String(v)))
        }
        msg = msg.split(`{${k}}`).join(String(v))
      }
      return msg
    },
  }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/app/workspace/[workspaceUrl]/hooks/useBoundaryCrossings', () => ({
  useBoundaryCrossings: jest.fn(),
}))
jest.mock('@/lib/api-client', () => ({
  tasksClient: {
    dispositionBoundaryCrossing: jest.fn().mockResolvedValue({}),
    previewCrossingSuppressionScope: jest.fn(),
  },
}))

import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  BoundaryCrossingsPanel,
  withoutKey,
} from '@/app/workspace/[workspaceUrl]/components/TaskDetailTimeline/BoundaryCrossingsPanel'
import { useBoundaryCrossings } from '@/app/workspace/[workspaceUrl]/hooks/useBoundaryCrossings'
import { tasksClient } from '@/lib/api-client'

const mockHook = useBoundaryCrossings as jest.Mock
const mockDisposition = tasksClient.dispositionBoundaryCrossing as jest.Mock
const mockPreview = tasksClient.previewCrossingSuppressionScope as jest.Mock

const BASE = {
  id: 'bc-1',
  category: 'NEW_NPM_DEPENDENCY',
  detail: 'npm install left-pad',
  detectedAt: '2026-09-10T00:00:00.000Z',
  reversible: true,
  severity: 'MEDIUM',
  disposition: null,
  dispositionNote: null,
  dispositionedAt: null,
  dispositionedById: null,
  remediationTask: null,
  editChange: null,
  lastDispositionChange: null,
  attribution: null,
  explanations: [],
  advisory: false,
  policyRuleText: null,
  agentContext: null,
  systemExplanation: null,
  suppressionRule: null,
}

function setCrossings(crossings: unknown[]) {
  mockHook.mockReturnValue({
    crossings,
    loading: false,
    error: null,
    refresh: jest.fn(),
  })
}

function deferred<T>() {
  let resolve: (v: T) => void = () => {}
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  jest.clearAllMocks()
  window.getSelection()?.removeAllRanges()
})

describe('triggering command block', () => {
  it('toggles by click and keyboard, and scrolls when expanded', () => {
    setCrossings([BASE])
    render(<BoundaryCrossingsPanel taskIdentifier='LUM-1' enabled />)
    const cmd = screen.getByTestId('crossing-cmd-bc-1')
    expect(cmd).toHaveAttribute('aria-expanded', 'false')
    expect(cmd.className).toMatch(/truncate/)

    fireEvent.click(cmd)
    expect(cmd).toHaveAttribute('aria-expanded', 'true')
    expect(cmd.className).toMatch(/max-h-60/)
    expect(cmd.className).toMatch(/overflow-y-auto/)

    fireEvent.keyDown(cmd, { key: 'Enter' })
    expect(cmd).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not collapse when the click ends a text selection', () => {
    setCrossings([BASE])
    render(<BoundaryCrossingsPanel taskIdentifier='LUM-1' enabled />)
    const cmd = screen.getByTestId('crossing-cmd-bc-1')
    fireEvent.click(cmd)
    const range = document.createRange()
    range.selectNodeContents(cmd)
    window.getSelection()?.addRange(range)
    fireEvent.click(cmd)
    expect(cmd).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('draft state after a ruling', () => {
  it('clears the note so a later correction does not resend it', async () => {
    setCrossings([BASE])
    const { rerender } = render(
      <BoundaryCrossingsPanel taskIdentifier='LUM-1' enabled />
    )
    fireEvent.change(
      screen.getByPlaceholderText('Disposition note (optional)'),
      { target: { value: 'legit dep' } }
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('boundary-false-positive-bc-1'))
    })
    expect(mockDisposition).toHaveBeenCalledWith(
      'LUM-1',
      'bc-1',
      'FALSE_POSITIVE',
      'legit dep'
    )

    // The refetch lands with the row dispositioned.
    setCrossings([
      {
        ...BASE,
        disposition: 'FALSE_POSITIVE',
        dispositionedAt: BASE.detectedAt,
      },
    ])
    rerender(<BoundaryCrossingsPanel taskIdentifier='LUM-1' enabled />)
    // The group fold, no longer holding an open crossing, closed; reopening it
    // remounts the row collapsed, as a dispositioned row starts.
    fireEvent.click(screen.getByTestId('crossing-group-NEW_NPM_DEPENDENCY'))
    fireEvent.click(screen.getByTestId('crossing-toggle-bc-1'))
    expect(
      screen.getByPlaceholderText('Reason for the change (optional)')
    ).toHaveValue('')

    await act(async () => {
      fireEvent.click(screen.getByTestId('boundary-change-bc-1'))
    })
    expect(mockDisposition).toHaveBeenLastCalledWith(
      'LUM-1',
      'bc-1',
      'CONFIRMED',
      undefined
    )
  })
})

describe('suppression preview', () => {
  it('ignores a stale response that arrives after the newer scope', async () => {
    const exact = deferred<unknown>()
    const directory = deferred<unknown>()
    mockPreview
      .mockReturnValueOnce(exact.promise)
      .mockReturnValueOnce(directory.promise)
    setCrossings([
      {
        ...BASE,
        id: 'bc-d',
        category: 'SENSITIVE_PATH_READ',
        detail: 'read sensitive path /etc/sudoers.d/50-x via cat',
        severity: 'LOW',
        suppressible: true,
        suppressionDirectory: '/etc/sudoers.d',
      },
    ])
    render(<BoundaryCrossingsPanel taskIdentifier='LUM-963' enabled />)
    fireEvent.click(screen.getByTestId('boundary-suppress-similar-bc-d'))
    fireEvent.click(screen.getByTestId('boundary-suppress-directory-bc-d'))

    await act(async () =>
      directory.resolve({
        suppressible: true,
        count: 12,
        capped: false,
        cap: 500,
      })
    )
    await act(async () =>
      exact.resolve({ suppressible: true, count: 1, capped: false, cap: 500 })
    )
    await waitFor(() =>
      expect(
        screen.getByTestId('boundary-suppress-preview-bc-d')
      ).toHaveTextContent('12 existing alerts')
    )
  })
})

describe('withoutKey', () => {
  it('drops one key and returns the same object when it is absent', () => {
    const rec = { a: 1, b: 2 }
    expect(withoutKey(rec, 'a')).toEqual({ b: 2 })
    expect(withoutKey(rec, 'z')).toBe(rec)
  })
})
