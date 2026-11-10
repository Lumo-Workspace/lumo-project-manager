/**
 * LUM-1336: the pure rules behind the workspace Boundary Crossings tab — who
 * receives a crossing as an index card, the order cards are dealt in, and the
 * "how was this ruled before on this task" summary a card shows. No I/O, so
 * every rule is unit-testable on its own.
 */
import type {
  BoundaryCrossingDisposition,
  BoundaryCrossingSeverity,
  WorkspaceRole,
} from '@prisma/client'

export interface QueueViewer {
  role: WorkspaceRole
  /** The viewer's HUMAN actor; null when the member has none (no tasks). */
  actorId: string | null
}

/**
 * Cards go only to the task's assignee and to workspace OWNERs (Decision 2).
 * An unassigned task's crossings therefore reach OWNERs only.
 */
export function isEligibleRuler(
  viewer: QueueViewer,
  assigneeActorId: string | null
): boolean {
  if (viewer.role === 'OWNER') return true
  return viewer.actorId != null && viewer.actorId === assigneeActorId
}

const SEVERITY_RANK: Record<BoundaryCrossingSeverity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export interface OrderableCard {
  blocking: boolean
  severity: BoundaryCrossingSeverity
  /** ISO timestamp. */
  detectedAt: string
}

/**
 * The default deal order: blocking before advisory, then severity
 * HIGH → LOW, then oldest first — the card a reviewer must act on first is
 * always on top. Returns a new array.
 */
export function orderQueueCards<T extends OrderableCard>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    const blocking = Number(b.blocking) - Number(a.blocking)
    if (blocking !== 0) return blocking
    const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severity !== 0) return severity
    return a.detectedAt.localeCompare(b.detectedAt)
  })
}

export interface HistoryCrossing {
  id: string
  ref: string
  category: string
  severity: BoundaryCrossingSeverity
  disposition: BoundaryCrossingDisposition | null
  dispositionedAt: string | null
  dispositionedById: string | null
  detectedAt: string
}

export interface TaskCrossingHistory {
  /** Other crossings on the task still awaiting a ruling. */
  otherOpen: number
  /** Earlier rulings on crossings of the same category, newest first. */
  sameCategoryRulings: HistoryCrossing[]
  /** Every other crossing on the task, oldest first. */
  others: HistoryCrossing[]
}

/** What the rest of the task's crossings say about the one on the card. */
export function summarizeTaskHistory(
  crossings: HistoryCrossing[],
  crossingId: string
): TaskCrossingHistory {
  const self = crossings.find(c => c.id === crossingId)
  const others = crossings
    .filter(c => c.id !== crossingId)
    .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
  return {
    otherOpen: others.filter(c => c.disposition == null).length,
    sameCategoryRulings: others
      .filter(c => c.disposition != null && c.category === self?.category)
      .sort((a, b) =>
        (b.dispositionedAt ?? '').localeCompare(a.dispositionedAt ?? '')
      ),
    others,
  }
}

/** First line of a crossing's detail, for the card face. */
export function firstLine(text: string): string {
  return text.split('\n', 1)[0]!.trim()
}
