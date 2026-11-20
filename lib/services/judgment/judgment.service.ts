import type {
  JudgmentChannel,
  JudgmentEventType,
  JudgmentOrigin,
  JudgmentRevisionState,
  Prisma,
} from '@prisma/client'
import { computeJudgmentDigest } from '@/lib/judgment/digest'
import {
  formatMemoryRejection,
  screenMemoryText,
} from '@/lib/memory/poison-gate'
import {
  judgmentRepository,
  type JudgmentRevisionRow,
  type JudgmentRow,
  type NewJudgmentRevision,
} from '@/lib/repositories/judgment.repository'
import { miscRepository } from '@/lib/repositories/misc.repository'
import { projectRepository } from '@/lib/repositories/project.repository'
import { workspaceRepository } from '@/lib/repositories/workspace.repository'
import { loadPolicyRulesForProject } from '@/lib/services/memory/write-gate'
import type { JudgmentContentInput } from '@/lib/validation/judgment'
import type { ContentSignals } from '@/shared/src/untrusted-content'
import {
  describeCounterparts,
  loadWorkspaceConflicts,
  reconcileConflictPauses,
} from './judgment-conflicts'
import { judgmentSettingsService } from './judgment-settings.service'

/**
 * LUM-1356 — team memory judgments, phase 1: propose, revise, review and
 * withdraw. Delivery to agents is untouched in this phase.
 *
 * State machine and concurrency rules: RFC LUM-1354 §5. In short —
 *  - a revision is immutable; "editing" is proposing another revision;
 *  - approval names the exact digest and is two conditional updates in one
 *    transaction, so of two racing approvals on one judgment only one lands;
 *  - approve / reject / request changes / withdraw are for a human in the web
 *    app, never an API key.
 */

type Tx = Prisma.TransactionClient

/** Days a candidate may wait for review before it is closed (LUM-1356 Decision 2). */
export const JUDGMENT_CANDIDATE_EXPIRY_DAYS = 30

export interface JudgmentCaller {
  memberId: string
  workspaceId: string
  workspaceSlug: string
  /** How the request authenticated; set by the route, never by the body. */
  via: 'WEB' | 'CLI'
}

export interface ReviewInput {
  revisionId: string
  digest: string
  reason: string | null
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

async function assertEnabled(caller: JudgmentCaller): Promise<void> {
  const mode = await judgmentSettingsService.effectiveMode(caller)
  if (mode === 'OFF') {
    throw httpError(
      409,
      'Team memory review is not turned on for this workspace'
    )
  }
}

/**
 * The origin that gets stored. A human origin can only be written by a human
 * web session; whatever an API key sends is stored as an agent origin.
 */
export function resolveOrigin(
  via: JudgmentCaller['via'],
  requested: JudgmentOrigin | undefined
): JudgmentOrigin {
  if (via === 'CLI') {
    return requested === 'AGENT_ASSUMPTION'
      ? 'AGENT_ASSUMPTION'
      : 'AGENT_JUDGMENT'
  }
  return requested ?? 'HUMAN_JUDGMENT'
}

function isHumanOrigin(origin: JudgmentOrigin): boolean {
  return origin === 'HUMAN_GUIDANCE' || origin === 'HUMAN_JUDGMENT'
}

/** The untrusted text of a revision, as one block for the injection scan. */
export function judgmentScreenText(content: JudgmentContentInput): string {
  const parts: (string | null | undefined)[] = [
    content.description,
    content.statement,
    content.rationale,
    content.assertion
      ? `${content.assertion.key}: ${String(content.assertion.value)}`
      : null,
    content.scope.topic,
    ...content.limits,
    content.judgedByLabel,
    ...content.sourceRefs,
    ...content.evidence.flatMap(item => [item.reference, item.summary]),
    content.context?.situation,
    ...(content.alternatives ?? []).flatMap(item => [item.option, item.whyNot]),
    content.expectedOutcome?.description,
  ]
  return parts.filter((part): part is string => Boolean(part)).join('\n')
}

async function screenContent(
  projectId: string | null,
  content: JudgmentContentInput
): Promise<ContentSignals | null> {
  const policyRules = projectId
    ? await loadPolicyRulesForProject(projectId)
    : []
  const verdict = screenMemoryText({
    text: judgmentScreenText(content),
    policyRules,
  })
  if (!verdict.ok) throw httpError(422, formatMemoryRejection(verdict))
  return verdict.signals
}

function buildRevision(args: {
  caller: JudgmentCaller
  judgmentId: string
  version: number
  baseRevisionId: string | null
  content: JudgmentContentInput
  contentSignals: ContentSignals | null
}): NewJudgmentRevision {
  const { caller, content } = args
  const origin = resolveOrigin(caller.via, content.origin)
  const fields = {
    judgmentId: args.judgmentId,
    baseRevisionId: args.baseRevisionId,
    description: content.description,
    statement: content.statement,
    kind: content.kind,
    rationale: content.rationale ? content.rationale : null,
    polarity: content.polarity,
    assertionKey: content.assertion?.key ?? null,
    assertionValue: content.assertion?.value ?? null,
    scopeRepo: content.scope.repo,
    scopePathGlobs: content.scope.pathGlobs,
    scopeTopic: content.scope.topic,
    when: content.when,
    limits: content.limits,
    validFrom: content.validFrom,
    validUntil: content.validUntil,
    origin,
    judgedByMemberId:
      caller.via === 'WEB' && isHumanOrigin(origin) ? caller.memberId : null,
    judgedByLabel: content.judgedByLabel,
    recordedByMemberId: caller.memberId,
    recordedByAgent: caller.via === 'CLI' ? content.recordedByAgent : null,
    recordedVia: caller.via satisfies JudgmentChannel,
    captureMethod: 'EXPLICIT' as const,
    sourceSessionId: content.sourceSessionId,
    sourceTaskId: content.sourceTaskId,
    sourceRefs: content.sourceRefs,
    evidence: content.evidence,
    context: content.context,
    alternatives: content.alternatives,
    expectedOutcome: content.expectedOutcome,
    legacyMemoryId: null,
  }
  return {
    ...fields,
    workspaceId: caller.workspaceId,
    version: args.version,
    digest: computeJudgmentDigest(fields),
    contentSignals: args.contentSignals,
  }
}

async function recordEvent(
  tx: Tx,
  caller: JudgmentCaller,
  type: JudgmentEventType,
  revision: Pick<JudgmentRevisionRow, 'id' | 'judgmentId' | 'digest'>,
  reason: string | null
): Promise<void> {
  await judgmentRepository.createEvent(
    {
      workspaceId: caller.workspaceId,
      judgmentId: revision.judgmentId,
      revisionId: revision.id,
      revisionDigest: revision.digest,
      type,
      actorMemberId: caller.memberId,
      channel: caller.via,
      reason,
    },
    tx
  )
}

/** Store a new PROPOSED revision, its event, and any conflict it opens. */
async function addCandidate(
  tx: Tx,
  caller: JudgmentCaller,
  judgment: JudgmentRow,
  content: JudgmentContentInput,
  contentSignals: ContentSignals | null,
  now: Date
): Promise<JudgmentRevisionRow> {
  const version = await judgmentRepository.nextVersion(
    caller.workspaceId,
    judgment.id,
    tx
  )
  const revision = await judgmentRepository.createRevision(
    buildRevision({
      caller,
      judgmentId: judgment.id,
      version,
      baseRevisionId: judgment.activeRevisionId,
      content,
      contentSignals,
    }),
    tx
  )
  await recordEvent(tx, caller, 'PROPOSED', revision, null)

  const { byRevision } = await loadWorkspaceConflicts(caller.workspaceId, tx)
  const others = byRevision.get(revision.id) ?? []
  if (others.length > 0) {
    await judgmentRepository.createEvent(
      {
        workspaceId: caller.workspaceId,
        judgmentId: judgment.id,
        revisionId: revision.id,
        revisionDigest: revision.digest,
        type: 'CONFLICT_FLAGGED',
        actorMemberId: null,
        channel: 'PIPELINE',
        reason: `Cannot be approved: assertion conflict with ${describeCounterparts(others)}`,
      },
      tx
    )
  }
  await reconcileConflictPauses(caller.workspaceId, now, tx)
  return revision
}

async function withVersionRetry<T>(run: () => Promise<T>): Promise<T> {
  // Two candidates for one judgment proposed at the same moment race for the
  // same version number; the loser retries with the next one.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 3) throw error
    }
  }
}

async function loadRevisionForReview(
  caller: JudgmentCaller,
  revisionId: string,
  tx: Tx
): Promise<{ revision: JudgmentRevisionRow; judgment: JudgmentRow }> {
  const revision = await judgmentRepository.findRevisionById(
    caller.workspaceId,
    revisionId,
    tx
  )
  if (!revision) throw httpError(404, 'Not found')
  const judgment = await judgmentRepository.findJudgmentById(
    caller.workspaceId,
    revision.judgmentId,
    tx
  )
  if (!judgment) throw httpError(404, 'Not found')
  return { revision, judgment }
}

/**
 * Review actions are for a human in the web app. The route refuses an API key
 * first; this is the same rule held at the service so no other caller can
 * skip it.
 */
async function assertMayReview(caller: JudgmentCaller): Promise<void> {
  if (caller.via !== 'WEB') {
    throw httpError(
      403,
      'Team memory can only be reviewed from a human-authenticated browser session — the agent/CLI path is closed by design'
    )
  }
  const [settings, role] = await Promise.all([
    workspaceRepository.findJudgmentSettings(caller.workspaceId),
    miscRepository.findMemberRoleById(caller.memberId),
  ])
  if (!role) throw httpError(403, 'Forbidden')
  if (settings?.admission === 'OWNER_ONLY' && role !== 'OWNER') {
    throw httpError(403, 'Only workspace owners can review team memory here')
  }
}

function requireReason(reason: string | null): string {
  const trimmed = reason?.trim()
  if (!trimmed) throw httpError(400, 'A reason is required')
  return trimmed
}

const STALE_REVIEW =
  'This revision changed or was already handled — reload and review it again'

async function closeCandidate(
  caller: JudgmentCaller,
  input: ReviewInput,
  to: Extract<JudgmentRevisionState, 'REJECTED' | 'CHANGES_REQUESTED'>,
  now: Date
): Promise<JudgmentRevisionRow> {
  await assertEnabled(caller)
  await assertMayReview(caller)
  const reason = requireReason(input.reason)
  return judgmentRepository.transaction(async tx => {
    const { revision } = await loadRevisionForReview(
      caller,
      input.revisionId,
      tx
    )
    const changed = await judgmentRepository.setRevisionStateIf(
      {
        workspaceId: caller.workspaceId,
        revisionId: revision.id,
        from: 'PROPOSED',
        to,
        digest: input.digest,
      },
      tx
    )
    if (changed === 0) throw httpError(409, STALE_REVIEW)
    await recordEvent(tx, caller, to, revision, reason)
    await reconcileConflictPauses(caller.workspaceId, now, tx)
    return { ...revision, state: to }
  })
}

export const judgmentService = {
  /** Propose a new judgment: creates it with its first candidate revision. */
  async propose(
    caller: JudgmentCaller,
    input: {
      name: string
      projectId: string | null
      content: JudgmentContentInput
    },
    now: Date = new Date()
  ): Promise<{ judgment: JudgmentRow; revision: JudgmentRevisionRow }> {
    await assertEnabled(caller)
    if (input.projectId) {
      const project = await projectRepository.findWorkspaceId(input.projectId)
      if (!project || project.workspaceId !== caller.workspaceId) {
        throw httpError(404, 'Project not found')
      }
    }
    const nameTaken = () =>
      httpError(
        409,
        `A team memory entry named "${input.name}" already exists — propose a revision of it instead`
      )
    const existing = await judgmentRepository.findJudgmentByName(
      caller.workspaceId,
      input.name
    )
    if (existing) throw nameTaken()
    const signals = await screenContent(input.projectId, input.content)
    try {
      return await judgmentRepository.transaction(async tx => {
        const judgment = await judgmentRepository.createJudgment(
          {
            workspaceId: caller.workspaceId,
            projectId: input.projectId,
            name: input.name,
          },
          tx
        )
        const revision = await addCandidate(
          tx,
          caller,
          judgment,
          input.content,
          signals,
          now
        )
        return { judgment, revision }
      })
    } catch (error) {
      // Two proposals of the same name at the same moment: the unique index
      // decides, and the loser gets the same answer as the check above.
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  },

  /**
   * Propose a revision of an existing judgment. `baseRevisionId` must be the
   * judgment's active revision right now (null when it has none); several
   * candidates on the same base may wait side by side.
   */
  async revise(
    caller: JudgmentCaller,
    input: {
      judgmentId: string
      baseRevisionId: string | null
      content: JudgmentContentInput
    },
    now: Date = new Date()
  ): Promise<{ judgment: JudgmentRow; revision: JudgmentRevisionRow }> {
    await assertEnabled(caller)
    const existing = await judgmentRepository.findJudgmentById(
      caller.workspaceId,
      input.judgmentId
    )
    if (!existing) throw httpError(404, 'Not found')
    const signals = await screenContent(existing.projectId, input.content)
    return withVersionRetry(() =>
      judgmentRepository.transaction(async tx => {
        const judgment = await judgmentRepository.findJudgmentById(
          caller.workspaceId,
          input.judgmentId,
          tx
        )
        if (!judgment) throw httpError(404, 'Not found')
        if (judgment.activeRevisionId !== input.baseRevisionId) {
          throw httpError(
            409,
            'The revision in effect has changed — base your revision on the current one'
          )
        }
        const revision = await addCandidate(
          tx,
          caller,
          judgment,
          input.content,
          signals,
          now
        )
        return { judgment, revision }
      })
    )
  },

  /**
   * Approve the exact revision named by `digest`. One transaction, two
   * conditional updates: the revision must still be PROPOSED with that digest,
   * and the judgment's active revision must still be the candidate's base.
   * Either one changing nothing rolls the whole approval back.
   */
  async approve(
    caller: JudgmentCaller,
    input: ReviewInput,
    now: Date = new Date()
  ): Promise<JudgmentRevisionRow> {
    await assertEnabled(caller)
    await assertMayReview(caller)
    return judgmentRepository.transaction(async tx => {
      const { revision } = await loadRevisionForReview(
        caller,
        input.revisionId,
        tx
      )
      if (revision.origin === 'UNKNOWN') {
        throw httpError(
          422,
          'A revision of unknown origin cannot be approved — propose a revision that says who judged this'
        )
      }
      if (!revision.rationale?.trim()) {
        throw httpError(
          422,
          'A revision without a reason cannot be approved — propose a revision that records why'
        )
      }
      const { byRevision } = await loadWorkspaceConflicts(
        caller.workspaceId,
        tx
      )
      const others = byRevision.get(revision.id) ?? []
      if (others.length > 0) {
        throw httpError(
          409,
          `This candidate conflicts with ${describeCounterparts(others)} — resolve the conflict before approving`
        )
      }

      const approved = await judgmentRepository.setRevisionStateIf(
        {
          workspaceId: caller.workspaceId,
          revisionId: revision.id,
          from: 'PROPOSED',
          to: 'APPROVED',
          digest: input.digest,
        },
        tx
      )
      if (approved === 0) throw httpError(409, STALE_REVIEW)

      const activated = await judgmentRepository.setActiveRevisionIf(
        {
          workspaceId: caller.workspaceId,
          judgmentId: revision.judgmentId,
          expectedActiveRevisionId: revision.baseRevisionId,
          activeRevisionId: revision.id,
        },
        tx
      )
      if (activated === 0) {
        throw httpError(
          409,
          'Another revision was approved first — this candidate is based on a revision that is no longer in effect and must be proposed again'
        )
      }

      if (revision.baseRevisionId) {
        await judgmentRepository.setRevisionStateIf(
          {
            workspaceId: caller.workspaceId,
            revisionId: revision.baseRevisionId,
            from: 'APPROVED',
            to: 'SUPERSEDED',
          },
          tx
        )
      }
      await recordEvent(tx, caller, 'APPROVED', revision, input.reason)
      await reconcileConflictPauses(caller.workspaceId, now, tx)
      return { ...revision, state: 'APPROVED' as const }
    })
  },

  async reject(
    caller: JudgmentCaller,
    input: ReviewInput,
    now: Date = new Date()
  ): Promise<JudgmentRevisionRow> {
    return closeCandidate(caller, input, 'REJECTED', now)
  },

  async requestChanges(
    caller: JudgmentCaller,
    input: ReviewInput,
    now: Date = new Date()
  ): Promise<JudgmentRevisionRow> {
    return closeCandidate(caller, input, 'CHANGES_REQUESTED', now)
  },

  /**
   * Withdraw the approved revision in effect. Earlier revisions do not come
   * back: the judgment has no active revision afterwards.
   */
  async withdraw(
    caller: JudgmentCaller,
    input: ReviewInput,
    now: Date = new Date()
  ): Promise<JudgmentRevisionRow> {
    await assertEnabled(caller)
    await assertMayReview(caller)
    const reason = requireReason(input.reason)
    return judgmentRepository.transaction(async tx => {
      const { revision } = await loadRevisionForReview(
        caller,
        input.revisionId,
        tx
      )
      const withdrawn = await judgmentRepository.setRevisionStateIf(
        {
          workspaceId: caller.workspaceId,
          revisionId: revision.id,
          from: 'APPROVED',
          to: 'WITHDRAWN',
          digest: input.digest,
        },
        tx
      )
      if (withdrawn === 0) throw httpError(409, STALE_REVIEW)
      const cleared = await judgmentRepository.setActiveRevisionIf(
        {
          workspaceId: caller.workspaceId,
          judgmentId: revision.judgmentId,
          expectedActiveRevisionId: revision.id,
          activeRevisionId: null,
        },
        tx
      )
      if (cleared === 0) throw httpError(409, STALE_REVIEW)
      await recordEvent(tx, caller, 'WITHDRAWN', revision, reason)
      await reconcileConflictPauses(caller.workspaceId, now, tx)
      return { ...revision, state: 'WITHDRAWN' as const }
    })
  },

  /**
   * Close candidates nobody reviewed for JUDGMENT_CANDIDATE_EXPIRY_DAYS, in
   * every workspace. A candidate that is part of a conflict is left for a
   * person: expiring it would lift the pause without anyone deciding.
   */
  async expireStaleCandidates(
    now: Date = new Date(),
    limit = 500
  ): Promise<{ expired: number; keptForConflict: number }> {
    const cutoff = new Date(
      now.getTime() - JUDGMENT_CANDIDATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    )
    const stale = await judgmentRepository.listStaleCandidates(cutoff, limit)
    let expired = 0
    let keptForConflict = 0
    for (const candidate of stale) {
      const outcome = await judgmentRepository.transaction(async tx => {
        const { byRevision } = await loadWorkspaceConflicts(
          candidate.workspaceId,
          tx
        )
        if (byRevision.has(candidate.id)) return 'conflict' as const
        const revision = await judgmentRepository.findRevisionById(
          candidate.workspaceId,
          candidate.id,
          tx
        )
        if (!revision) return 'gone' as const
        const changed = await judgmentRepository.setRevisionStateIf(
          {
            workspaceId: candidate.workspaceId,
            revisionId: candidate.id,
            from: 'PROPOSED',
            to: 'EXPIRED',
          },
          tx
        )
        if (changed === 0) return 'gone' as const
        await judgmentRepository.createEvent(
          {
            workspaceId: candidate.workspaceId,
            judgmentId: revision.judgmentId,
            revisionId: revision.id,
            revisionDigest: revision.digest,
            type: 'EXPIRED',
            actorMemberId: null,
            channel: 'PIPELINE',
            reason: `No review in ${JUDGMENT_CANDIDATE_EXPIRY_DAYS} days`,
          },
          tx
        )
        return 'expired' as const
      })
      if (outcome === 'expired') expired += 1
      if (outcome === 'conflict') keptForConflict += 1
    }
    return { expired, keptForConflict }
  },
}
