import { createHash } from 'crypto'

/**
 * The content of one judgment revision, as covered by its digest.
 *
 * Everything a reviewer approves is here. Governance and derived columns are
 * deliberately absent: `id`, `workspaceId`, `version`, `digest`, `state`,
 * `contentSignals`, `embedding`, `createdAt`.
 */
export interface JudgmentDigestContent {
  judgmentId: string
  baseRevisionId: string | null
  description: string
  statement: string
  kind: string
  rationale: string | null
  polarity: string | null
  assertionKey: string | null
  assertionValue: unknown
  scopeRepo: string | null
  scopePathGlobs: unknown
  scopeTopic: string | null
  when: unknown
  limits: unknown
  validFrom: Date | string | null
  validUntil: Date | string | null
  origin: string
  judgedByMemberId: string | null
  judgedByLabel: string | null
  recordedByMemberId: string | null
  recordedByAgent: string | null
  recordedVia: string
  captureMethod: string
  sourceSessionId: string | null
  sourceTaskId: string | null
  sourceRefs: unknown
  evidence: unknown
  context: unknown
  alternatives: unknown
  expectedOutcome: unknown
  legacyMemoryId: string | null
}

/**
 * The fixed field order of the canonical form. Appending a field changes every
 * digest, so a new content column needs a new DIGEST_VERSION — never reorder
 * or insert here in place.
 */
export const JUDGMENT_DIGEST_FIELDS = [
  'judgmentId',
  'baseRevisionId',
  'description',
  'statement',
  'kind',
  'rationale',
  'polarity',
  'assertionKey',
  'assertionValue',
  'scopeRepo',
  'scopePathGlobs',
  'scopeTopic',
  'when',
  'limits',
  'validFrom',
  'validUntil',
  'origin',
  'judgedByMemberId',
  'judgedByLabel',
  'recordedByMemberId',
  'recordedByAgent',
  'recordedVia',
  'captureMethod',
  'sourceSessionId',
  'sourceTaskId',
  'sourceRefs',
  'evidence',
  'context',
  'alternatives',
  'expectedOutcome',
  'legacyMemoryId',
] as const satisfies readonly (keyof JudgmentDigestContent)[]

export const JUDGMENT_DIGEST_VERSION = 'judgment-digest/v1'

/**
 * Canonical JSON of a value: object keys sorted, array order kept, dates as
 * ISO-8601 UTC, `undefined` as `null`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
    return `{${keys
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function canonicalDate(value: Date | string | null): string | null {
  if (value === null) return null
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

/** The exact string that is hashed. Exposed for the test vectors. */
export function canonicalizeJudgmentContent(
  content: JudgmentDigestContent
): string {
  const normalized: Record<string, unknown> = {
    ...content,
    validFrom: canonicalDate(content.validFrom),
    validUntil: canonicalDate(content.validUntil),
  }
  const pairs = JUDGMENT_DIGEST_FIELDS.map(
    field => `${JSON.stringify(field)}:${canonicalJson(normalized[field])}`
  )
  return `${JUDGMENT_DIGEST_VERSION}\n{${pairs.join(',')}}`
}

/** `sha256:<hex>` of the canonical content. */
export function computeJudgmentDigest(content: JudgmentDigestContent): string {
  const hash = createHash('sha256')
    .update(canonicalizeJudgmentContent(content), 'utf8')
    .digest('hex')
  return `sha256:${hash}`
}
