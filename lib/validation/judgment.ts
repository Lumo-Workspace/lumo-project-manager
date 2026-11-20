import { z } from 'zod'

export const JUDGMENT_KINDS = [
  'CONDITIONAL_GUIDANCE',
  'CASE',
  'HYPOTHESIS',
  'CONSTRAINT',
] as const
export const JUDGMENT_POLARITIES = ['PREFER', 'AVOID'] as const
export const JUDGMENT_ORIGINS = [
  'HUMAN_GUIDANCE',
  'HUMAN_JUDGMENT',
  'AGENT_JUDGMENT',
  'AGENT_ASSUMPTION',
  'UNKNOWN',
] as const
export const JUDGMENT_REVISION_STATES = [
  'PROPOSED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'EXPIRED',
  'APPROVED',
  'SUPERSEDED',
  'WITHDRAWN',
] as const
export const JUDGMENT_MODES = ['OFF', 'REVIEW', 'CUTOVER'] as const
export const JUDGMENT_ADMISSIONS = ['ANY_MEMBER', 'OWNER_ONLY'] as const
export const JUDGMENT_RECORDING_AGENTS = ['CLAUDE_CODE', 'CODEX'] as const

/**
 * The facts a `when` condition may test. Each one comes from the server or
 * the CLI, never from what an agent says about itself.
 */
export const JUDGMENT_WHEN_FIELDS = [
  'repo',
  'agent',
  'task.tag',
  'path',
] as const

export const judgmentNameSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,79}$/,
    'Use 2–80 lowercase letters, digits and hyphens, starting with a letter or digit'
  )

const text = (max: number) => z.string().trim().min(1).max(max)
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean()])

const whenConditionSchema = z
  .object({
    field: z.enum(JUDGMENT_WHEN_FIELDS),
    equals: scalar,
  })
  .strict()

const evidenceSchema = z
  .object({
    reference: text(500),
    role: z.enum(['supports', 'challenges', 'context']),
    summary: text(1000),
  })
  .strict()

const alternativeSchema = z
  .object({
    option: text(500),
    whyNot: z.string().trim().max(1000).nullable().default(null),
  })
  .strict()

/** The content of a revision as a caller may submit it. */
export const judgmentContentSchema = z
  .object({
    description: text(200),
    statement: text(4000),
    kind: z.enum(JUDGMENT_KINDS),
    rationale: z.string().trim().max(4000).nullable().default(null),
    polarity: z.enum(JUDGMENT_POLARITIES).nullable().default(null),
    assertion: z
      .object({ key: text(200), value: scalar })
      .strict()
      .nullable()
      .default(null),
    scope: z
      .object({
        repo: z
          .string()
          .trim()
          .regex(/^[^/\s]+\/[^/\s]+$/, 'Use owner/name')
          .max(200)
          .nullable()
          .default(null),
        pathGlobs: z.array(text(300)).max(20).nullable().default(null),
        topic: z.string().trim().max(80).nullable().default(null),
      })
      .strict()
      .default({ repo: null, pathGlobs: null, topic: null }),
    when: z.array(whenConditionSchema).max(10).default([]),
    limits: z.array(text(500)).min(1).max(10),
    validFrom: z.coerce.date().nullable().default(null),
    validUntil: z.coerce.date().nullable().default(null),
    origin: z.enum(JUDGMENT_ORIGINS).optional(),
    judgedByLabel: z.string().trim().max(200).nullable().default(null),
    recordedByAgent: z.enum(JUDGMENT_RECORDING_AGENTS).nullable().default(null),
    sourceSessionId: z.string().trim().max(200).nullable().default(null),
    sourceTaskId: z.string().trim().max(200).nullable().default(null),
    sourceRefs: z.array(text(500)).max(20).default([]),
    evidence: z.array(evidenceSchema).max(20).default([]),
    context: z
      .object({ situation: text(2000) })
      .strict()
      .nullable()
      .default(null),
    alternatives: z.array(alternativeSchema).max(10).nullable().default(null),
    expectedOutcome: z
      .object({ description: text(2000) })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    content =>
      !content.validFrom ||
      !content.validUntil ||
      content.validFrom < content.validUntil,
    { message: 'validFrom must be before validUntil', path: ['validUntil'] }
  )

export type JudgmentContentInput = z.infer<typeof judgmentContentSchema>

export const proposeJudgmentSchema = z
  .object({
    name: judgmentNameSchema,
    /** Project id; null or absent = the whole workspace. */
    projectId: z.string().trim().min(1).max(200).nullable().default(null),
    /** A project name or slug, as the CLI's `--project` gives it. */
    projectRef: z.string().trim().min(1).max(200).optional(),
    content: judgmentContentSchema,
  })
  .strict()
  .refine(input => !(input.projectId && input.projectRef), {
    message: 'Give projectId or projectRef, not both',
  })

export const reviseJudgmentSchema = z
  .object({
    /** The judgment's active revision the caller based this on; null = none. */
    baseRevisionId: z.string().trim().min(1).max(200).nullable(),
    content: judgmentContentSchema,
  })
  .strict()

const digestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, 'Expected sha256:<64 hex characters>')

export const judgmentReviewActions = [
  'approve',
  'reject',
  'request-changes',
  'withdraw',
] as const

/** Approve needs no reason; the other three must say why. */
export const reviewJudgmentRevisionSchema = z
  .object({
    digest: digestSchema,
    reason: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()

export const listJudgmentsQuerySchema = z.object({
  view: z.enum(['active', 'inbox', 'all']).default('active'),
  projectId: z.string().trim().min(1).max(200).optional(),
  projectRef: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).max(200).optional(),
})

export const judgmentSettingsSchema = z
  .object({
    /** CUTOVER arrives in a later phase and is refused here. */
    mode: z.enum(['OFF', 'REVIEW']).optional(),
    admission: z.enum(JUDGMENT_ADMISSIONS).optional(),
  })
  .strict()
  .refine(value => value.mode !== undefined || value.admission !== undefined, {
    message: 'Nothing to update',
  })
