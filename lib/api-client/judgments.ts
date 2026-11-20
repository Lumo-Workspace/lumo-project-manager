import { apiFetch } from './base'
import type {
  JudgmentContentInput,
  judgmentReviewActions,
} from '@/lib/validation/judgment'

/**
 * LUM-1356 — team memory judgments: the review queue, one revision, the four
 * review actions and the workspace settings. Dates arrive as ISO strings.
 */

export type JudgmentReviewAction = (typeof judgmentReviewActions)[number]

export type ApprovalBlocker =
  | 'ORIGIN_UNKNOWN'
  | 'RATIONALE_MISSING'
  | 'CONFLICT'
  | 'STALE_BASE'

export interface JudgmentConflictView {
  judgmentId: string
  judgmentName: string
  revisionId: string
}

export interface JudgmentRevisionView {
  id: string
  judgmentId: string
  version: number
  digest: string
  baseRevisionId: string | null
  description: string
  statement: string
  kind: JudgmentContentInput['kind']
  rationale: string | null
  polarity: 'PREFER' | 'AVOID' | null
  assertionKey: string | null
  assertionValue: string | number | boolean | null
  scopeRepo: string | null
  scopePathGlobs: string[] | null
  scopeTopic: string | null
  when: { field: string; equals: string | number | boolean }[]
  limits: string[]
  validFrom: string | null
  validUntil: string | null
  origin:
    | 'HUMAN_GUIDANCE'
    | 'HUMAN_JUDGMENT'
    | 'AGENT_JUDGMENT'
    | 'AGENT_ASSUMPTION'
    | 'UNKNOWN'
  judgedByMemberId: string | null
  judgedByLabel: string | null
  recordedByMemberId: string | null
  recordedByAgent: string | null
  recordedVia: 'WEB' | 'CLI' | 'PIPELINE'
  captureMethod: string
  sourceSessionId: string | null
  sourceTaskId: string | null
  sourceRefs: string[]
  evidence: { reference: string; role: string; summary: string }[]
  context: { situation: string } | null
  alternatives: { option: string; whyNot: string | null }[] | null
  expectedOutcome: { description: string } | null
  state:
    | 'PROPOSED'
    | 'CHANGES_REQUESTED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'APPROVED'
    | 'SUPERSEDED'
    | 'WITHDRAWN'
  contentSignals: unknown
  createdAt: string
  conflictsWith: JudgmentConflictView[]
  approvalBlockers: ApprovalBlocker[]
}

export interface JudgmentView {
  id: string
  name: string
  projectId: string | null
  activeRevisionId: string | null
  pausedAt: string | null
  paused: boolean
}

export interface JudgmentSummaryView extends JudgmentView {
  activeRevision: JudgmentRevisionView | null
}

export interface JudgmentInboxItem {
  judgment: JudgmentView
  revision: JudgmentRevisionView
}

export interface JudgmentReviewView extends JudgmentInboxItem {
  /** The revision in effect, when it is not the one being looked at. */
  activeRevision: JudgmentRevisionView | null
}

export interface JudgmentSettingsView {
  mode: 'OFF' | 'REVIEW' | 'CUTOVER'
  effectiveMode: 'OFF' | 'REVIEW' | 'CUTOVER'
  admission: 'ANY_MEMBER' | 'OWNER_ONLY'
  available: boolean
  canEdit: boolean
}

/** The fields a reviewer can change when proposing a corrected revision. */
export type JudgmentRevisionDraft = Pick<
  JudgmentContentInput,
  'description' | 'statement' | 'kind' | 'rationale' | 'limits'
> & { origin: JudgmentRevisionView['origin'] }

export const judgmentsClient = {
  inbox(): Promise<{ items: JudgmentInboxItem[] }> {
    return apiFetch('/api/judgments?view=inbox')
  },

  listActive(): Promise<{
    judgments: JudgmentSummaryView[]
    nextCursor: string | null
  }> {
    return apiFetch('/api/judgments?view=active&limit=200')
  },

  revision(revisionId: string): Promise<JudgmentReviewView> {
    return apiFetch(`/api/judgment-revisions/${encodeURIComponent(revisionId)}`)
  },

  review(
    revisionId: string,
    action: JudgmentReviewAction,
    payload: { digest: string; reason: string | null }
  ): Promise<{ revision: JudgmentRevisionView }> {
    return apiFetch(
      `/api/judgment-revisions/${encodeURIComponent(revisionId)}/${action}`,
      { method: 'POST', body: payload }
    )
  },

  /**
   * Propose a corrected revision: the reviewed revision's content with the
   * draft's fields replacing its own.
   */
  revise(
    source: JudgmentRevisionView,
    baseRevisionId: string | null,
    draft: JudgmentRevisionDraft
  ): Promise<{ revision: JudgmentRevisionView }> {
    return apiFetch(
      `/api/judgments/${encodeURIComponent(source.judgmentId)}/revisions`,
      {
        method: 'POST',
        body: {
          baseRevisionId,
          content: {
            ...draft,
            polarity: source.polarity,
            assertion: source.assertionKey
              ? { key: source.assertionKey, value: source.assertionValue }
              : null,
            scope: {
              repo: source.scopeRepo,
              pathGlobs: source.scopePathGlobs,
              topic: source.scopeTopic,
            },
            when: source.when,
            validFrom: source.validFrom,
            validUntil: source.validUntil,
            judgedByLabel: source.judgedByLabel,
            sourceSessionId: source.sourceSessionId,
            sourceTaskId: source.sourceTaskId,
            sourceRefs: source.sourceRefs,
            evidence: source.evidence,
            context: source.context,
            alternatives: source.alternatives,
            expectedOutcome: source.expectedOutcome,
          },
        },
      }
    )
  },

  settings(): Promise<JudgmentSettingsView> {
    return apiFetch('/api/workspaces/me/judgments')
  },

  updateSettings(update: {
    mode?: 'OFF' | 'REVIEW'
    admission?: 'ANY_MEMBER' | 'OWNER_ONLY'
  }): Promise<JudgmentSettingsView> {
    return apiFetch('/api/workspaces/me/judgments', {
      method: 'PATCH',
      body: update,
    })
  },
}
