import { apiFetch } from './base'
import type {
  CardContextView,
  QueueFilter,
  QueueView,
} from '@/lib/services/crossing-queue.service'

export type {
  CardContextView,
  CardCrossingSection,
  CardDecisionView,
  CardPullRequestView,
  CardSection,
  CardTagView,
  CardTaskView,
  CardTestCaseView,
  QueueCardView,
  QueueFilter,
  QueueView,
} from '@/lib/services/crossing-queue.service'

/** LUM-1336: the workspace Boundary Crossings tab (index-card queue). */
export const boundaryCrossingQueueClient = {
  queue(opts: {
    filter: QueueFilter
    projectId?: string | null
  }): Promise<QueueView> {
    const params = new URLSearchParams({ filter: opts.filter })
    if (opts.projectId) params.set('projectId', opts.projectId)
    return apiFetch(`/api/boundary-crossings/queue?${params.toString()}`)
  },

  context(crossingId: string): Promise<CardContextView> {
    return apiFetch(
      `/api/boundary-crossings/${encodeURIComponent(crossingId)}/context`
    )
  },

  rule(
    crossingId: string,
    payload: {
      disposition: 'FALSE_POSITIVE' | 'CONFIRMED'
      dispositionNote?: string
      stateHash: string
    }
  ): Promise<{ crossingId: string; disposition: string | null }> {
    return apiFetch(
      `/api/boundary-crossings/${encodeURIComponent(crossingId)}/rule`,
      { method: 'POST', body: payload }
    )
  },

  tag(
    crossingId: string,
    payload: { memberId: string; message?: string }
  ): Promise<{ tag: { id: string; createdAt: string } }> {
    return apiFetch(
      `/api/boundary-crossings/${encodeURIComponent(crossingId)}/tag`,
      { method: 'POST', body: payload }
    )
  },
}
