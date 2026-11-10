import type { CardContextView } from '@/lib/api-client/boundary-crossing-queue'

/**
 * LUM-1336: the sections of a card's context. Every one must load before a
 * ruling is allowed — a reviewer never rules with part of the picture
 * silently missing.
 */
export const CARD_SECTIONS = [
  'crossing',
  'history',
  'task',
  'testCases',
  'decisions',
  'pullRequests',
  'tags',
  'tagTargets',
] as const satisfies readonly (keyof CardContextView)[]

export type CardSectionName = (typeof CARD_SECTIONS)[number]

/** Sections whose read failed. */
export function failedSections(ctx: CardContextView): CardSectionName[] {
  return CARD_SECTIONS.filter(name => ctx[name].status === 'error')
}

/** True only when every section loaded and the crossing is still open. */
export function canRule(ctx: CardContextView | null): boolean {
  if (!ctx) return false
  if (failedSections(ctx).length > 0) return false
  return (
    ctx.crossing.status === 'ok' && ctx.crossing.data.view.disposition == null
  )
}

/** The first `lines` non-empty lines of a description, for the card face. */
export function purposeExcerpt(
  description: string | null,
  lines = 3
): string | null {
  if (!description) return null
  const kept = description
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, lines)
  return kept.length > 0 ? kept.join('\n') : null
}
