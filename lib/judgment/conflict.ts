import { canonicalJson } from './digest'

/**
 * Deterministic assertion-conflict check between judgment revisions
 * (LUM-1354 Decision 10; overlap rule: LUM-1356 Decision 1).
 *
 * The overlap rule is conservative on purpose: when it cannot prove two
 * scopes are disjoint it reports an overlap. It may pause more than strictly
 * needed; it never misses a real overlap.
 */

export interface WhenCondition {
  field: string
  equals: string | number | boolean
}

export interface ConflictSubject {
  revisionId: string
  judgmentId: string
  /** Null = workspace-wide. */
  projectId: string | null
  scopeRepo: string | null
  scopePathGlobs: string[] | null
  when: WhenCondition[]
  validFrom: Date | null
  validUntil: Date | null
  assertionKey: string | null
  assertionValue: unknown
}

export interface ConflictPair {
  a: ConflictSubject
  b: ConflictSubject
}

const GLOB_META = /[*?[\]{}!]/

/** The part of a glob before its first wildcard, without a leading `./` or `/`. */
export function globLiteralPrefix(glob: string): string {
  const trimmed = glob.trim().replace(/^\.\//, '').replace(/^\/+/, '')
  const index = trimmed.search(GLOB_META)
  return index === -1 ? trimmed : trimmed.slice(0, index)
}

function pathGlobsOverlap(a: string[] | null, b: string[] | null): boolean {
  if (!a || a.length === 0 || !b || b.length === 0) return true
  return a.some(globA => {
    const prefixA = globLiteralPrefix(globA)
    return b.some(globB => {
      const prefixB = globLiteralPrefix(globB)
      return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)
    })
  })
}

function whenIsDisjoint(a: WhenCondition[], b: WhenCondition[]): boolean {
  return a.some(conditionA =>
    b.some(
      conditionB =>
        conditionA.field === conditionB.field &&
        conditionA.equals !== conditionB.equals
    )
  )
}

type ValidityWindow = Pick<ConflictSubject, 'validFrom' | 'validUntil'>

function validityIsDisjoint(a: ValidityWindow, b: ValidityWindow): boolean {
  // Windows are [validFrom, validUntil); null is unbounded.
  if (a.validUntil && b.validFrom && a.validUntil <= b.validFrom) return true
  if (b.validUntil && a.validFrom && b.validUntil <= a.validFrom) return true
  return false
}

export type ApplicabilityScope = Omit<
  ConflictSubject,
  'revisionId' | 'judgmentId' | 'assertionKey' | 'assertionValue'
>

/** Whether two revisions could both apply to the same piece of work. */
export function scopesOverlap(
  a: ApplicabilityScope,
  b: ApplicabilityScope
): boolean {
  if (a.projectId && b.projectId && a.projectId !== b.projectId) return false
  if (
    a.scopeRepo &&
    b.scopeRepo &&
    a.scopeRepo.toLowerCase() !== b.scopeRepo.toLowerCase()
  ) {
    return false
  }
  if (!pathGlobsOverlap(a.scopePathGlobs, b.scopePathGlobs)) return false
  if (whenIsDisjoint(a.when, b.when)) return false
  return !validityIsDisjoint(a, b)
}

/**
 * Two revisions conflict when they belong to different judgments, assert the
 * same key with different values, and their scopes overlap. Revisions of the
 * same judgment never conflict; a revision without an assertion never does.
 */
export function revisionsConflict(
  a: ConflictSubject,
  b: ConflictSubject
): boolean {
  if (a.judgmentId === b.judgmentId) return false
  if (!a.assertionKey || !b.assertionKey) return false
  if (a.assertionKey !== b.assertionKey) return false
  if (canonicalJson(a.assertionValue) === canonicalJson(b.assertionValue)) {
    return false
  }
  return scopesOverlap(a, b)
}

/** Every conflicting pair among the given revisions, each pair once. */
export function findConflictPairs(subjects: ConflictSubject[]): ConflictPair[] {
  const byKey = new Map<string, ConflictSubject[]>()
  for (const subject of subjects) {
    if (!subject.assertionKey) continue
    const group = byKey.get(subject.assertionKey)
    if (group) group.push(subject)
    else byKey.set(subject.assertionKey, [subject])
  }
  const pairs: ConflictPair[] = []
  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]
        const b = group[j]
        if (a && b && revisionsConflict(a, b)) pairs.push({ a, b })
      }
    }
  }
  return pairs
}

/** revisionId → the revisions it conflicts with. */
export function conflictsByRevision(
  subjects: ConflictSubject[]
): Map<string, ConflictSubject[]> {
  const result = new Map<string, ConflictSubject[]>()
  const add = (from: ConflictSubject, other: ConflictSubject) => {
    const list = result.get(from.revisionId)
    if (list) list.push(other)
    else result.set(from.revisionId, [other])
  }
  for (const { a, b } of findConflictPairs(subjects)) {
    add(a, b)
    add(b, a)
  }
  return result
}
