/**
 * LUM-1336: "Shuffle to back" for the Boundary Crossings tab. Shuffles live
 * only for the viewer's browser session (Decision 1) — kept in
 * sessionStorage, never sent to the server. Pure helpers plus guarded storage
 * access: a browser without storage simply starts in the default order.
 */

export const SHUFFLE_STORAGE_KEY = 'lumo:crossing-queue:shuffled'

/**
 * Cards never shuffled keep their deal order and come first; shuffled cards
 * follow in the order they were sent back. Ids no longer in the queue are
 * ignored. Returns a new array.
 */
export function applyShuffle<T extends { id: string }>(
  cards: T[],
  shuffled: string[]
): T[] {
  const position = new Map(shuffled.map((id, i) => [id, i]))
  const fresh = cards.filter(c => !position.has(c.id))
  const sentBack = cards
    .filter(c => position.has(c.id))
    .sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return [...fresh, ...sentBack]
}

/** Send `id` to the very back, even if it was shuffled before. */
export function pushShuffled(shuffled: string[], id: string): string[] {
  return [...shuffled.filter(s => s !== id), id]
}

export function readShuffled(
  storage: Pick<Storage, 'getItem'> | null
): string[] {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(SHUFFLE_STORAGE_KEY) ?? '[]'
    )
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

export function writeShuffled(
  storage: Pick<Storage, 'setItem'> | null,
  shuffled: string[]
): void {
  if (!storage) return
  try {
    storage.setItem(SHUFFLE_STORAGE_KEY, JSON.stringify(shuffled))
  } catch {
    // Storage full or blocked: the shuffle still holds for this page view.
  }
}

/** sessionStorage, or null where reading it throws (blocked site data). */
export function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}
