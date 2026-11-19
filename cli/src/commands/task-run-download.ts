import { closeSync, existsSync, openSync, rmSync, writeSync } from 'fs'
import { EXIT_USAGE } from '../lib/exit-codes'
import { cmd, hint } from '../lib/feedback'
import { sanitizeField } from '../lib/sanitize'
import { apiCall, apiContext } from '../lib/test-case-api'

/**
 * `lumo task run download [task] -o <file>` — save a task's raw agent session
 * records (the stored hook events, payload included) as JSONL.
 *
 * The payloads hold untrusted content (prompts, tool output, fetched pages)
 * and can be large, so they only ever go to the file: stdout gets one result
 * line. A payload the server already reduced (pruned by retention or a delete,
 * or stripped of code) is written exactly as stored and counted in that line.
 *
 * A separate command rather than a flag on `task show --runs`, for the same
 * reason as `task testcase download`: Codex rules match command names, so a
 * flag that writes local files would take `task show` out of server-only.
 */

/** Marker key of a cleared payload. Mirrors `lib/hook-event/retention.ts` (parity-tested). */
export const PRUNED_PAYLOAD_KEY = '_lumo_pruned'
/** Key holding the stats of code removed from a payload. Mirrors `lib/hook-payload/redact.ts`. */
export const REDACTED_FIELD = '_lumo_redacted'

// Local copy of the wire shape of GET /api/tasks/[id]/agent-runs — the CLI is
// a separate package and must not import from the app.
interface TimelineItem {
  id: string
  kind: string
  type?: string
  toolName?: string | null
  payload?: unknown
  createdAt: string
}
interface TimelineRun {
  sessionId: string | null
  agent: string
  runNumber: number
  items: TimelineItem[]
}
interface TimelineResponse {
  runs: TimelineRun[]
}

export interface TaskRunDownloadOptions {
  output?: string
  force?: boolean
}

function hasObjectKey(payload: unknown, key: string): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return false
  const value = (payload as Record<string, unknown>)[key]
  return !!value && typeof value === 'object'
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export async function taskRunDownload(
  task: string,
  opts: TaskRunDownloadOptions
): Promise<number | void> {
  const output = opts.output?.trim()
  if (!output) {
    console.error('Error: missing -o <file>, e.g. -o records.jsonl')
    return EXIT_USAGE
  }
  if (output === '-') {
    console.error(
      'Error: raw session records are not printed to stdout (they hold untrusted tool output and can be large)'
    )
    console.error(hint('name a file, e.g. -o records.jsonl'))
    return EXIT_USAGE
  }
  // Checked before the request so a refused run costs nothing; the open below
  // repeats the check atomically.
  if (!opts.force && existsSync(output)) {
    console.error(`Error: ${sanitizeField(output)} already exists`)
    console.error(
      hint(`choose another path, or pass ${cmd('--force')} to overwrite it`)
    )
    return 1
  }

  const ctx = apiContext()
  if (!ctx) return 1
  const r = await apiCall<TimelineResponse>(
    ctx,
    `/api/tasks/${encodeURIComponent(task)}/agent-runs`,
    {},
    'task run download'
  )
  if (!r.ok || !r.data) return 1
  const runs = r.data.runs ?? []

  // Only a file this run creates is removed when the export fails part-way.
  const replacing = !!opts.force && existsSync(output)
  let fd: number
  try {
    // 0600: the records hold prompts and tool output, so a new file is
    // readable by its owner only. An overwritten file keeps its own mode.
    fd = openSync(output, opts.force ? 'w' : 'wx', 0o600)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    console.error(
      code === 'EEXIST'
        ? `Error: ${sanitizeField(output)} already exists`
        : `Error: could not write ${sanitizeField(output)} (${code ?? String(err)})`
    )
    return 1
  }

  let events = 0
  let bytes = 0
  let pruned = 0
  let stripped = 0
  let runsWithEvents = 0
  let writeError: unknown = null
  try {
    for (const run of runs) {
      let inRun = 0
      for (const item of run.items) {
        if (item.kind !== 'hook') continue
        if (hasObjectKey(item.payload, PRUNED_PAYLOAD_KEY)) pruned++
        else if (hasObjectKey(item.payload, REDACTED_FIELD)) stripped++
        bytes += writeSync(
          fd,
          JSON.stringify({
            task,
            runNumber: run.runNumber,
            sessionId: run.sessionId,
            agent: run.agent,
            id: item.id,
            type: item.type,
            toolName: item.toolName ?? null,
            createdAt: item.createdAt,
            payload: item.payload,
          }) + '\n'
        )
        inRun++
      }
      events += inRun
      if (inRun > 0) runsWithEvents++
    }
  } catch (err) {
    writeError = err
  } finally {
    closeSync(fd)
  }
  if (writeError) {
    // A partial file would pass for a complete export, so do not leave one.
    if (!replacing) rmSync(output, { force: true })
    const code = (writeError as NodeJS.ErrnoException).code
    console.error(
      `Error: could not write ${sanitizeField(output)} (${code ?? String(writeError)})`
    )
    console.error(
      hint(
        replacing
          ? 'the file is incomplete; run the command again'
          : 'nothing was saved; run the command again'
      )
    )
    return 1
  }

  console.log(
    `Saved ${plural(events, 'event')} of ${sanitizeField(task)} (${plural(runsWithEvents, 'run')}, ${bytes} bytes; ${pruned} pruned, ${stripped} with code removed) to ${sanitizeField(output)}`
  )
}
