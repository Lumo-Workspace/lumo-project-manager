/** @jest-environment node */
jest.mock('@/cli/src/lib/config', () => ({
  readCredentials: jest.fn(() => ({
    token: 'lum_x',
    apiUrl: 'https://api.test',
    workspaceSlug: 'lumo',
  })),
}))

import fs, {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  PRUNED_PAYLOAD_KEY as CLI_PRUNED_KEY,
  REDACTED_FIELD as CLI_REDACTED_FIELD,
  taskRunDownload,
} from '@/cli/src/commands/task-run-download'
import {
  PRUNED_PAYLOAD_KEY,
  buildPrunedPayload,
  buildUserDeletedPayload,
} from '@/lib/hook-event/retention'
import { REDACTED_FIELD } from '@/lib/hook-payload/redact'

const PRUNED = buildPrunedPayload(new Date('2026-11-01T00:00:00Z'), 30)
const USER_DELETED = buildUserDeletedPayload(
  new Date('2026-11-02T00:00:00Z'),
  'wm_1'
)
const STRIPPED = {
  tool_name: 'Write',
  tool_input: { file_path: 'a.ts' },
  [REDACTED_FIELD]: {
    'tool_input.content': { bytes: 120, lines: 4, sha256: 'ab'.repeat(32) },
  },
}

function hook(id: string, type: string, payload: unknown, toolName?: string) {
  return {
    id,
    kind: 'hook',
    type,
    toolName: toolName ?? null,
    payload,
    turnSummary: null,
    turnCost: null,
    createdAt: '2026-11-18T01:00:00.000Z',
  }
}

/** Three runs: a session with a subagent's event, an earlier session, and the unlinked run. */
const TIMELINE = {
  runs: [
    {
      sessionId: 'sess-main',
      agent: 'CLAUDE_CODE',
      runNumber: 3,
      items: [
        hook('e1', 'USER_PROMPT_SUBMIT', { prompt: 'SECRET-PROMPT-TEXT' }),
        hook(
          'e2',
          'POST_TOOL_USE',
          {
            // A subagent's event: the API folds it into the parent's run.
            agent_id: 'agent-7',
            tool_name: 'Bash',
            tool_response: { stdout: 'line1\nline2' },
          },
          'Bash'
        ),
        {
          id: 'm1',
          kind: 'memory',
          category: 'TRAP',
          agent: 'CLAUDE_CODE',
          content: { text: 'a memory, not a hook event' },
          createdAt: '2026-11-18T01:00:01.000Z',
        },
        hook('e3', 'STOP', STRIPPED),
      ],
    },
    {
      sessionId: 'sess-earlier',
      agent: 'CLAUDE_CODE',
      runNumber: 2,
      items: [
        hook('e4', 'PRE_TOOL_USE', PRUNED, 'Read'),
        hook('e5', 'POST_TOOL_USE', USER_DELETED, 'Read'),
      ],
    },
    {
      sessionId: null,
      agent: 'CODEX',
      runNumber: 1,
      items: [hook('e6', 'SESSION_START', { source: 'startup' })],
    },
  ],
  totals: { runCount: 3, loopCount: null, byModel: [] },
  perMember: [],
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const notFound = {
  ok: false,
  status: 404,
  json: async () => ({ error: 'Task not found' }),
} as unknown as Response

describe('taskRunDownload', () => {
  let dir: string
  let out: string
  let logSpy: jest.SpyInstance
  let errSpy: jest.SpyInstance

  beforeEach(() => {
    jest.restoreAllMocks()
    dir = mkdtempSync(join(tmpdir(), 'lumo-run-download-'))
    out = join(dir, 'records.jsonl')
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const stdout = () => logSpy.mock.calls.map(c => String(c[0])).join('\n')
  const stderr = () => errSpy.mock.calls.map(c => String(c[0])).join('\n')
  const lines = () =>
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as Record<string, unknown>)

  it('writes one JSON line per hook event, payload as the API returned it', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    const code = await taskRunDownload('LUM-9', { output: out })
    expect(code).toBeUndefined()
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      'https://api.test/api/tasks/LUM-9/agent-runs'
    )

    const apiEvents = TIMELINE.runs.flatMap(run =>
      run.items.filter(i => i.kind === 'hook').map(i => ({ run, item: i }))
    )
    const written = lines()
    expect(written).toHaveLength(6)
    expect(written).toHaveLength(apiEvents.length)
    written.forEach((line, i) => {
      const { run, item } = apiEvents[i]!
      expect(line).toEqual({
        task: 'LUM-9',
        runNumber: run.runNumber,
        sessionId: run.sessionId,
        agent: run.agent,
        id: item.id,
        type: (item as { type: string }).type,
        toolName: (item as { toolName: string | null }).toolName,
        createdAt: item.createdAt,
        payload: (item as { payload: unknown }).payload,
      })
    })
    // The file ends with a newline, so `wc -l` equals the event count.
    expect(readFileSync(out, 'utf8').endsWith('\n')).toBe(true)
  })

  it('prints one result line (path, events, bytes) and no payload on stdout', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    await taskRunDownload('LUM-9', { output: out })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const bytes = readFileSync(out).length
    expect(stdout()).toBe(
      `Saved 6 events of LUM-9 (3 runs, ${bytes} bytes; 2 pruned, 1 with code removed) to ${out}`
    )
    expect(stdout()).not.toContain('SECRET-PROMPT-TEXT')
  })

  it('exports a pruned payload as its stored marker and counts it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    await taskRunDownload('LUM-9', { output: out })
    const byId = new Map(lines().map(l => [l.id, l]))
    expect(byId.get('e4')!.payload).toEqual(PRUNED)
    expect(byId.get('e5')!.payload).toEqual(USER_DELETED)
    expect(byId.get('e3')!.payload).toEqual(STRIPPED)
    expect(stdout()).toContain('2 pruned, 1 with code removed')
  })

  it('refuses an existing output path before any request, leaving the file alone', async () => {
    writeFileSync(out, 'keep me')
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    const code = await taskRunDownload('LUM-9', { output: out })
    expect(code).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(readFileSync(out, 'utf8')).toBe('keep me')
    expect(stderr()).toContain('already exists')
    expect(stderr()).toContain('--force')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('overwrites an existing output path with --force', async () => {
    writeFileSync(out, 'old')
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    const code = await taskRunDownload('LUM-9', { output: out, force: true })
    expect(code).toBeUndefined()
    expect(lines()).toHaveLength(6)
  })

  it("exits 1 with the server's 404 for another workspace's task and writes nothing", async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(notFound)
    const code = await taskRunDownload('OTHER-1', { output: out })
    expect(code).toBe(1)
    expect(stderr()).toContain('Task not found')
    expect(existsSync(out)).toBe(false)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('refuses stdout (-o -) and a blank path as usage errors', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    expect(await taskRunDownload('LUM-9', { output: '-' })).toBe(2)
    expect(await taskRunDownload('LUM-9', { output: '  ' })).toBe(2)
    expect(await taskRunDownload('LUM-9', {})).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('writes an empty file and says so when the task has no hook events', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok({ ...TIMELINE, runs: [] }))
    const code = await taskRunDownload('LUM-9', { output: out })
    expect(code).toBeUndefined()
    expect(readFileSync(out, 'utf8')).toBe('')
    expect(stdout()).toContain('Saved 0 events of LUM-9 (0 runs, 0 bytes;')
  })

  it('uses the singular for one event and one run', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(ok({ ...TIMELINE, runs: [TIMELINE.runs[2]] }))
    await taskRunDownload('LUM-9', { output: out })
    expect(stdout()).toContain('Saved 1 event of LUM-9 (1 run, ')
  })

  it('creates the file readable by its owner only', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    await taskRunDownload('LUM-9', { output: out })
    expect(statSync(out).mode & 0o777).toBe(0o600)
  })

  it('exits 1 and removes the file it created when a write fails part-way', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    const realWrite = fs.writeSync
    let calls = 0
    jest.spyOn(fs, 'writeSync').mockImplementation(((
      ...args: Parameters<typeof fs.writeSync>
    ) => {
      if (++calls === 3)
        throw Object.assign(new Error('no space'), { code: 'ENOSPC' })
      return realWrite(...args)
    }) as typeof fs.writeSync)
    const code = await taskRunDownload('LUM-9', { output: out })
    expect(code).toBe(1)
    expect(existsSync(out)).toBe(false)
    expect(stderr()).toContain('ENOSPC')
    expect(stderr()).toContain('nothing was saved')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('keeps an overwritten file and says it is incomplete when a --force write fails', async () => {
    writeFileSync(out, 'old')
    jest.spyOn(global, 'fetch').mockResolvedValue(ok(TIMELINE))
    jest.spyOn(fs, 'writeSync').mockImplementation(() => {
      throw Object.assign(new Error('io'), { code: 'EIO' })
    })
    const code = await taskRunDownload('LUM-9', { output: out, force: true })
    expect(code).toBe(1)
    expect(existsSync(out)).toBe(true)
    expect(stderr()).toContain('the file is incomplete')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('uses the same marker keys as the server', () => {
    expect(CLI_PRUNED_KEY).toBe(PRUNED_PAYLOAD_KEY)
    expect(CLI_REDACTED_FIELD).toBe(REDACTED_FIELD)
  })
})
