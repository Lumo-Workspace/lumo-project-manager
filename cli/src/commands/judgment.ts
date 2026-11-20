import { readFileSync } from 'fs'
import { EXIT_USAGE } from '../lib/exit-codes'
import { apiCall, apiContext, type ApiContext } from '../lib/test-case-api'
import { detectAgentHost } from '../lib/feedback-env'
import { emitJson, listEnvelope, withVersion } from '../lib/json-output'
import { sanitizeField } from '../lib/sanitize'

/**
 * LUM-1356 — `lumo judgment propose | revise | list | show | inbox`.
 *
 * Team memory entries that take effect only after a human approves them in
 * the web app. An agent can propose a candidate, propose a revision, and
 * read; it cannot approve, reject, request changes or withdraw — there is no
 * command for those.
 */

// ── API shapes (GET/POST /api/judgments…) ──────────────────────────────────

export interface JudgmentRevisionView {
  id: string
  judgmentId: string
  version: number
  digest: string
  baseRevisionId: string | null
  description: string
  statement: string
  kind: string
  rationale: string | null
  polarity: string | null
  assertionKey: string | null
  assertionValue: unknown
  scopeRepo: string | null
  scopePathGlobs: string[] | null
  scopeTopic: string | null
  when: { field: string; equals: string | number | boolean }[]
  limits: string[]
  validFrom: string | null
  validUntil: string | null
  origin: string
  judgedByLabel: string | null
  recordedVia: string
  state: string
  createdAt: string
  conflictsWith?: { judgmentName: string; revisionId: string }[]
  approvalBlockers?: string[]
}

export interface JudgmentView {
  id: string
  name: string
  projectId: string | null
  activeRevisionId: string | null
  paused?: boolean
  activeRevision?: JudgmentRevisionView | null
  pendingRevisions?: JudgmentRevisionView[]
  revisions?: JudgmentRevisionView[]
  events?: {
    type: string
    revisionId: string | null
    channel: string
    reason: string | null
    createdAt: string
  }[]
}

interface ProposeResult {
  judgment: JudgmentView
  revision: JudgmentRevisionView
}

interface InboxResult {
  items: { judgment: JudgmentView; revision: JudgmentRevisionView }[]
}

interface ListResult {
  judgments: JudgmentView[]
  nextCursor: string | null
}

// ── options ────────────────────────────────────────────────────────────────

export interface JudgmentWriteOptions {
  file?: string
  project?: string
  base?: string
  json?: boolean
}

export interface JudgmentListOptions {
  all?: boolean
  project?: string
  limit?: string
  cursor?: string
  json?: boolean
}

export interface JudgmentShowOptions {
  history?: boolean
  json?: boolean
}

// ── helpers ────────────────────────────────────────────────────────────────

const BLOCKER_TEXT: Record<string, string> = {
  ORIGIN_UNKNOWN: 'origin unknown — a revision must say who judged this',
  RATIONALE_MISSING: 'no reason recorded — a revision must record why',
  CONFLICT: 'assertion conflict — must be resolved first',
  STALE_BASE: 'based on a revision no longer in effect — propose it again',
}

type ReadResult =
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; error: string }

/** Read the revision content from `--file <path>` (`-` = stdin). */
export function readJudgmentFile(
  path: string | undefined,
  read: (target: string | number) => string = target =>
    readFileSync(target, 'utf8')
): ReadResult {
  if (!path) {
    return {
      ok: false,
      error:
        '--file <path> is required: a JSON file with the content (description, statement, kind, rationale, limits, …); "-" reads stdin.',
    }
  }
  let raw: string
  try {
    raw = read(path === '-' ? 0 : path)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `could not read --file ${path === '-' ? '(stdin)' : path} (${msg}).`,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: '--file is not valid JSON.' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '--file must hold one JSON object.' }
  }
  return { ok: true, content: parsed as Record<string, unknown> }
}

/**
 * Add what the CLI knows for certain and the file left out: which agent host
 * is running and its session id. Whatever `origin` the file names, the server
 * stores an agent origin for a CLI key.
 */
export function withSessionProvenance(
  content: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const host = detectAgentHost(env)
  const sessionId =
    env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || env.CLAUDE_CODE_SESSION_ID
  return {
    ...content,
    ...(content.recordedByAgent === undefined && host
      ? { recordedByAgent: host }
      : {}),
    ...(content.sourceSessionId === undefined && sessionId
      ? { sourceSessionId: sessionId }
      : {}),
  }
}

function reviewUrl(ctx: ApiContext, revisionId: string): string {
  return `${ctx.base}/workspace/${ctx.workspaceSlug}/team-memory/${revisionId}`
}

function scopeLine(revision: JudgmentRevisionView): string {
  const parts: string[] = []
  if (revision.scopeRepo) parts.push(`repo ${revision.scopeRepo}`)
  if (revision.scopePathGlobs?.length)
    parts.push(`paths ${revision.scopePathGlobs.join(', ')}`)
  for (const condition of revision.when ?? [])
    parts.push(`${condition.field} = ${String(condition.equals)}`)
  if (revision.validUntil) parts.push(`until ${revision.validUntil}`)
  return parts.length > 0 ? sanitizeField(parts.join(' · ')) : 'no conditions'
}

export function formatRevision(
  revision: JudgmentRevisionView,
  indent = '  '
): string {
  const lines = [
    `${indent}v${revision.version} · ${revision.state.toLowerCase()} · ${revision.kind.toLowerCase()} · revision ${revision.id}`,
    `${indent}  ${sanitizeField(revision.statement)}`,
    `${indent}  Why: ${revision.rationale ? sanitizeField(revision.rationale) : '(not recorded)'}`,
    `${indent}  Applies: ${scopeLine(revision)}`,
    ...(revision.limits ?? []).map(
      limit => `${indent}  Limit: ${sanitizeField(limit)}`
    ),
    ...(revision.assertionKey
      ? [
          `${indent}  Asserts: ${sanitizeField(revision.assertionKey)} = ${sanitizeField(String(revision.assertionValue))}`,
        ]
      : []),
    `${indent}  Origin: ${revision.origin.toLowerCase()}${revision.judgedByLabel ? ` (${sanitizeField(revision.judgedByLabel)})` : ''} · recorded via ${revision.recordedVia.toLowerCase()}`,
    `${indent}  Digest: ${revision.digest}`,
  ]
  for (const other of revision.conflictsWith ?? []) {
    lines.push(
      `${indent}  ⚠ Conflicts with ${sanitizeField(other.judgmentName)}`
    )
  }
  for (const blocker of revision.approvalBlockers ?? []) {
    if (blocker === 'CONFLICT') continue
    lines.push(
      `${indent}  Cannot be approved: ${BLOCKER_TEXT[blocker] ?? blocker}`
    )
  }
  return lines.join('\n')
}

export function formatJudgment(judgment: JudgmentView): string {
  const lines = [
    `${sanitizeField(judgment.name)}${judgment.paused ? '  [paused — assertion conflict]' : ''}`,
    `Applies to: ${judgment.projectId ? `project ${judgment.projectId}` : 'the whole workspace'}`,
    '',
  ]
  if (judgment.activeRevision) {
    lines.push('In effect:', formatRevision(judgment.activeRevision))
  } else {
    lines.push('In effect: nothing (no approved revision)')
  }
  const pending = judgment.pendingRevisions ?? []
  if (pending.length > 0) {
    lines.push('', `Waiting for review (${pending.length}):`)
    for (const revision of pending) lines.push(formatRevision(revision))
  }
  if (judgment.revisions) {
    lines.push('', 'All revisions:')
    for (const revision of judgment.revisions) {
      lines.push(
        `  v${revision.version}  ${revision.state.toLowerCase().padEnd(17)}  ${revision.id}  ${sanitizeField(revision.description)}`
      )
    }
  }
  if (judgment.events) {
    lines.push('', 'Events:')
    for (const event of judgment.events) {
      lines.push(
        `  ${event.createdAt}  ${event.type.toLowerCase().padEnd(17)}  ${event.channel.toLowerCase()}${event.reason ? `  ${sanitizeField(event.reason)}` : ''}`
      )
    }
  }
  return lines.join('\n')
}

function printProposed(
  ctx: ApiContext,
  verb: string,
  result: ProposeResult
): void {
  const { judgment, revision } = result
  console.log(
    `${verb} ${sanitizeField(judgment.name)} v${revision.version} — a candidate, not in effect until a person approves it in the web app.`
  )
  console.log(`  Revision: ${revision.id}`)
  console.log(`  Digest:   ${revision.digest}`)
  console.log(`  Origin:   ${revision.origin.toLowerCase()}`)
  console.log(`  Review:   ${reviewUrl(ctx, revision.id)}`)
}

// ── commands ───────────────────────────────────────────────────────────────

export async function judgmentPropose(
  name: string,
  options: JudgmentWriteOptions
): Promise<number | void> {
  const file = readJudgmentFile(options.file)
  if (!file.ok) {
    console.error(`Error: ${file.error}`)
    return EXIT_USAGE
  }
  const ctx = apiContext()
  if (!ctx) return 1
  const res = await apiCall<ProposeResult>(
    ctx,
    '/api/judgments',
    {
      method: 'POST',
      json: {
        name,
        ...(options.project ? { projectRef: options.project } : {}),
        content: withSessionProvenance(file.content),
      },
    },
    'judgment propose'
  )
  if (!res.ok || !res.data) return 1
  if (options.json) emitJson(withVersion(res.data))
  else printProposed(ctx, 'Proposed', res.data)
}

export async function judgmentRevise(
  ref: string,
  options: JudgmentWriteOptions
): Promise<number | void> {
  if (options.base === undefined) {
    console.error(
      'Error: --base <revision-id|none> is required: the revision in effect that you read (`lumo judgment show`), or "none" when nothing is in effect.'
    )
    return EXIT_USAGE
  }
  const file = readJudgmentFile(options.file)
  if (!file.ok) {
    console.error(`Error: ${file.error}`)
    return EXIT_USAGE
  }
  const ctx = apiContext()
  if (!ctx) return 1
  const found = await apiCall<JudgmentView>(
    ctx,
    `/api/judgments/${encodeURIComponent(ref)}`,
    {},
    'judgment revise'
  )
  if (!found.ok || !found.data) return 1
  const res = await apiCall<ProposeResult>(
    ctx,
    `/api/judgments/${encodeURIComponent(found.data.id)}/revisions`,
    {
      method: 'POST',
      json: {
        baseRevisionId: options.base === 'none' ? null : options.base,
        content: withSessionProvenance(file.content),
      },
    },
    'judgment revise'
  )
  if (!res.ok || !res.data) return 1
  if (options.json) emitJson(withVersion(res.data))
  else printProposed(ctx, 'Proposed a revision of', res.data)
}

export async function judgmentList(
  options: JudgmentListOptions
): Promise<number | void> {
  const query = new URLSearchParams({ view: options.all ? 'all' : 'active' })
  if (options.project) query.set('projectRef', options.project)
  if (options.cursor) query.set('cursor', options.cursor)
  if (options.limit !== undefined) {
    const limit = Number(options.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      console.error(
        `Error: invalid --limit "${options.limit}". Expected a whole number from 1 to 200.`
      )
      return EXIT_USAGE
    }
    query.set('limit', String(limit))
  }
  const ctx = apiContext()
  if (!ctx) return 1
  const res = await apiCall<ListResult>(
    ctx,
    `/api/judgments?${query.toString()}`,
    {},
    'judgment list'
  )
  if (!res.ok || !res.data) return 1
  const { judgments, nextCursor } = res.data
  if (options.json) {
    emitJson(listEnvelope('judgments', judgments, { total: null, nextCursor }))
    return
  }
  if (judgments.length === 0) {
    console.log(
      options.all
        ? 'No team memory entries yet.'
        : 'No approved team memory entries. `lumo judgment inbox` lists what is waiting for review.'
    )
    return
  }
  for (const judgment of judgments) {
    const active = judgment.activeRevision
    const status = !active
      ? 'no approved revision'
      : judgment.paused
        ? `v${active.version} paused (conflict)`
        : `v${active.version} approved`
    console.log(
      [
        sanitizeField(judgment.name),
        status,
        active ? sanitizeField(active.description) : '',
      ].join('\t')
    )
  }
  if (nextCursor) {
    console.log(`Next page: lumo judgment list --cursor ${nextCursor}`)
  }
}

export async function judgmentShow(
  ref: string,
  options: JudgmentShowOptions
): Promise<number | void> {
  const ctx = apiContext()
  if (!ctx) return 1
  const res = await apiCall<JudgmentView>(
    ctx,
    `/api/judgments/${encodeURIComponent(ref)}${options.history ? '?history=1' : ''}`,
    {},
    'judgment show'
  )
  if (!res.ok || !res.data) return 1
  if (options.json) emitJson(withVersion({ judgment: res.data }))
  else console.log(formatJudgment(res.data))
}

export async function judgmentInbox(options: {
  json?: boolean
}): Promise<number | void> {
  const ctx = apiContext()
  if (!ctx) return 1
  const res = await apiCall<InboxResult>(
    ctx,
    '/api/judgments?view=inbox',
    {},
    'judgment inbox'
  )
  if (!res.ok || !res.data) return 1
  const { items } = res.data
  if (options.json) {
    emitJson(listEnvelope('candidates', items))
    return
  }
  if (items.length === 0) {
    console.log('Nothing is waiting for review.')
    return
  }
  console.log(
    `${items.length} candidate${items.length === 1 ? '' : 's'} waiting for a human review (approval happens in the web app only):`
  )
  for (const { judgment, revision } of items) {
    console.log('')
    console.log(sanitizeField(judgment.name))
    console.log(formatRevision(revision))
    console.log(`    Review: ${reviewUrl(ctx, revision.id)}`)
  }
}
