/** @jest-environment node */
/**
 * LUM-1356 — `lumo judgment`: reading the content file, the provenance the
 * CLI adds, the text output, and the request each command sends.
 */
const mockApiCall = jest.fn()
jest.mock('../../cli/src/lib/test-case-api', () => ({
  apiContext: () => ({
    base: 'https://lumo.test',
    token: 't',
    workspaceSlug: 'acme',
  }),
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}))

import {
  formatJudgment,
  formatRevision,
  judgmentInbox,
  judgmentList,
  judgmentPropose,
  judgmentRevise,
  judgmentShow,
  readJudgmentFile,
  withSessionProvenance,
  type JudgmentRevisionView,
} from '../../cli/src/commands/judgment'
import { EXIT_USAGE } from '../../cli/src/lib/exit-codes'

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv

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
  judgedByLabel: null,
  recordedVia: 'CLI',
  state: 'PROPOSED',
  createdAt: '2026-11-19T00:00:00.000Z',
  ...overrides,
})

let out: string[]
let err: string[]
beforeEach(() => {
  jest.clearAllMocks()
  out = []
  err = []
  jest.spyOn(console, 'log').mockImplementation((...a) => {
    out.push(a.join(' '))
  })
  jest.spyOn(console, 'error').mockImplementation((...a) => {
    err.push(a.join(' '))
  })
})
afterEach(() => jest.restoreAllMocks())

describe('readJudgmentFile', () => {
  it('requires --file', () => {
    expect(readJudgmentFile(undefined)).toMatchObject({ ok: false })
  })
  it('reads a path, and stdin for "-"', () => {
    const read = jest.fn(() => '{"statement":"x"}')
    expect(readJudgmentFile('c.json', read)).toEqual({
      ok: true,
      content: { statement: 'x' },
    })
    expect(read).toHaveBeenLastCalledWith('c.json')
    readJudgmentFile('-', read)
    expect(read).toHaveBeenLastCalledWith(0)
  })
  it('refuses invalid JSON, arrays and unreadable files', () => {
    expect(readJudgmentFile('c.json', () => 'nope')).toMatchObject({
      ok: false,
      error: '--file is not valid JSON.',
    })
    expect(readJudgmentFile('c.json', () => '[]')).toMatchObject({ ok: false })
    expect(
      readJudgmentFile('c.json', () => {
        throw new Error('ENOENT')
      })
    ).toMatchObject({ ok: false })
  })
})

describe('withSessionProvenance', () => {
  it('adds the agent host and session id the file left out', () => {
    expect(
      withSessionProvenance(
        { statement: 'x' },
        env({ CLAUDE_CODE_SESSION_ID: 's1' })
      )
    ).toEqual({
      statement: 'x',
      recordedByAgent: 'CLAUDE_CODE',
      sourceSessionId: 's1',
    })
    expect(
      withSessionProvenance(
        {},
        env({ CODEX_THREAD_ID: 'c1', CLAUDE_CODE_SESSION_ID: 's1' })
      )
    ).toEqual({ recordedByAgent: 'CODEX', sourceSessionId: 'c1' })
  })
  it('keeps what the file says and adds nothing outside a session', () => {
    expect(
      withSessionProvenance(
        { recordedByAgent: 'CODEX', sourceSessionId: null },
        env({ CLAUDE_CODE_SESSION_ID: 's1' })
      )
    ).toEqual({ recordedByAgent: 'CODEX', sourceSessionId: null })
    expect(withSessionProvenance({ a: 1 }, env({}))).toEqual({ a: 1 })
  })
})

describe('formatting', () => {
  it('prints a revision with its blockers and conflicts', () => {
    const text = formatRevision(
      revision({
        rationale: null,
        assertionKey: 'tests.location',
        assertionValue: 'tests',
        scopeRepo: 'acme/app',
        conflictsWith: [
          { judgmentName: 'tests-under-tests-dir', revisionId: 'r9' },
        ],
        approvalBlockers: ['RATIONALE_MISSING', 'CONFLICT'],
      })
    )
    expect(text).toContain('v1 · proposed · constraint · revision rev_1')
    expect(text).toContain('Why: (not recorded)')
    expect(text).toContain('Applies: repo acme/app')
    expect(text).toContain('Asserts: tests.location = tests')
    expect(text).toContain('⚠ Conflicts with tests-under-tests-dir')
    expect(text).toContain('Cannot be approved: no reason recorded')
  })

  it('prints a paused judgment, what is in effect and what waits', () => {
    const text = formatJudgment({
      id: 'jdg_1',
      name: 'tests-location',
      projectId: null,
      activeRevisionId: 'rev_1',
      paused: true,
      activeRevision: revision({ state: 'APPROVED' }),
      pendingRevisions: [revision({ id: 'rev_2', version: 2 })],
    })
    expect(text.split('\n')[0]).toBe(
      'tests-location  [paused — assertion conflict]'
    )
    expect(text).toContain('Applies to: the whole workspace')
    expect(text).toContain('In effect:')
    expect(text).toContain('Waiting for review (1):')
    expect(text).not.toContain('All revisions:')
  })

  it('strips terminal control characters from stored text', () => {
    const text = formatRevision(
      revision({ statement: 'safe\u001b[31m red\u0007' })
    )
    expect(text).not.toContain('\u001b')
    expect(text).not.toContain('\u0007')
  })
})

describe('commands', () => {
  const proposed = {
    judgment: {
      id: 'jdg_1',
      name: 'tests-location',
      projectId: null,
      activeRevisionId: null,
    },
    revision: revision(),
  }

  it('propose: usage error without a readable file, no request sent', async () => {
    expect(await judgmentPropose('tests-location', {})).toBe(EXIT_USAGE)
    expect(mockApiCall).not.toHaveBeenCalled()
    expect(err.join('\n')).toContain('--file <path> is required')
  })

  it('revise: --base is required and "none" means null', async () => {
    expect(await judgmentRevise('tests-location', { file: 'x.json' })).toBe(
      EXIT_USAGE
    )
    expect(mockApiCall).not.toHaveBeenCalled()
  })

  it('list: sends the view and prints one TAB-separated row per entry', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      data: {
        judgments: [
          {
            id: 'jdg_1',
            name: 'tests-location',
            projectId: null,
            activeRevisionId: 'rev_1',
            paused: true,
            activeRevision: revision({ state: 'APPROVED', version: 3 }),
          },
        ],
        nextCursor: 'jdg_1',
      },
    })
    await judgmentList({ all: true, limit: '10', project: 'app' })
    expect(mockApiCall.mock.calls[0][1]).toBe(
      '/api/judgments?view=all&projectRef=app&limit=10'
    )
    expect(out[0]).toBe(
      'tests-location\tv3 paused (conflict)\tTests live under __tests__'
    )
    expect(out[1]).toBe('Next page: lumo judgment list --cursor jdg_1')
  })

  it('list: refuses a bad --limit before any request', async () => {
    expect(await judgmentList({ limit: '0' })).toBe(EXIT_USAGE)
    expect(await judgmentList({ limit: 'many' })).toBe(EXIT_USAGE)
    expect(mockApiCall).not.toHaveBeenCalled()
  })

  it('show: asks for history only when told to; --json wraps with a version', async () => {
    mockApiCall.mockResolvedValue({ ok: true, data: proposed.judgment })
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await judgmentShow('tests-location', { json: true })
    await judgmentShow('tests-location', { history: true })
    expect(mockApiCall.mock.calls[0][1]).toBe('/api/judgments/tests-location')
    expect(mockApiCall.mock.calls[1][1]).toBe(
      '/api/judgments/tests-location?history=1'
    )
    const json = [...write.mock.calls.map(c => String(c[0])), ...out].find(
      line => line.trim().startsWith('{')
    )
    expect(JSON.parse(json!)).toMatchObject({
      version: 1,
      judgment: { name: 'tests-location' },
    })
  })

  it('inbox: says approval is web-only and links each candidate', async () => {
    mockApiCall.mockResolvedValue({
      ok: true,
      data: { items: [{ judgment: proposed.judgment, revision: revision() }] },
    })
    await judgmentInbox({})
    expect(mockApiCall.mock.calls[0][1]).toBe('/api/judgments?view=inbox')
    const text = out.join('\n')
    expect(text).toContain('1 candidate waiting for a human review')
    expect(text).toContain(
      'Review: https://lumo.test/workspace/acme/team-memory/rev_1'
    )
  })

  it('a failed request exits 1', async () => {
    mockApiCall.mockResolvedValue({ ok: false })
    expect(await judgmentInbox({})).toBe(1)
    expect(await judgmentShow('x', {})).toBe(1)
  })
})

describe('there is no review command', () => {
  it('the judgment group has exactly the five agent-safe subcommands', () => {
    const grammar = jest.requireActual<{
      commands: Record<string, unknown>
    }>('../../scripts/cli-grammar/grammar.json')
    const names = Object.keys(grammar.commands).filter(path =>
      path.startsWith('judgment ')
    )
    expect([...names].sort()).toEqual([
      'judgment inbox',
      'judgment list',
      'judgment propose',
      'judgment revise',
      'judgment show',
    ])
  })
})
