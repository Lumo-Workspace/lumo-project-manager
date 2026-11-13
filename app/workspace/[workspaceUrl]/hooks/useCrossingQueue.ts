'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  boundaryCrossingQueueClient,
  type QueueFilter,
  type QueueView,
  type CardContextView,
} from '@/lib/api-client/boundary-crossing-queue'
import { queryKeys } from '@/lib/query/keys'
import {
  pushShuffled,
  readShuffled,
  sessionStore,
  writeShuffled,
} from '../components/pages/crossing-queue/shuffle-order'

/** LUM-1336: the viewer's Boundary Crossings queue for one filter. */
export function useCrossingQueue(
  filter: QueueFilter,
  projectId: string | null
) {
  const query = useQuery<QueueView>({
    queryKey: queryKeys.crossingQueue(filter, projectId),
    queryFn: () => boundaryCrossingQueueClient.queue({ filter, projectId }),
  })
  return {
    queue: query.data ?? null,
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
    refresh: query.refetch,
  }
}

/** The sidebar badge: blocking cards across the viewer's whole queue. */
export function useCrossingQueueBadge(): number {
  const query = useQuery<QueueView>({
    queryKey: queryKeys.crossingQueue('all', null),
    queryFn: () => boundaryCrossingQueueClient.queue({ filter: 'all' }),
    staleTime: 60_000,
  })
  return query.data?.blockingCount ?? 0
}

/** One card's task context, section by section. */
export function useCrossingCard(crossingId: string | null) {
  const query = useQuery<CardContextView>({
    queryKey: queryKeys.crossingCard(crossingId ?? ''),
    queryFn: () => boundaryCrossingQueueClient.context(crossingId!),
    enabled: !!crossingId,
  })
  return {
    context: query.data ?? null,
    loading: query.isPending && !!crossingId,
    error: query.error ? (query.error as Error).message : null,
    refresh: query.refetch,
  }
}

/** Rule on / tag a card; both refresh the queue (and its badge) and the card. */
export function useCrossingCardActions(crossingId: string) {
  const queryClient = useQueryClient()
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.crossingQueueAll() }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.crossingCard(crossingId),
      }),
    ])
  }, [queryClient, crossingId])

  const rule = useMutation({
    mutationFn: (payload: {
      disposition: 'FALSE_POSITIVE' | 'CONFIRMED'
      dispositionNote?: string
      stateHash: string
    }) => boundaryCrossingQueueClient.rule(crossingId, payload),
    onSettled: refresh,
  })
  const tag = useMutation({
    mutationFn: (payload: { memberId: string; message?: string }) =>
      boundaryCrossingQueueClient.tag(crossingId, payload),
    onSuccess: refresh,
  })
  return { rule, tag }
}

/**
 * Cards sent to the back this browser session (Decision 1). Starts empty and
 * loads from sessionStorage after mount, so render stays pure.
 */
export function useShuffledIds() {
  const [shuffled, setShuffled] = useState<string[]>([])
  useEffect(() => {
    setShuffled(readShuffled(sessionStore()))
  }, [])
  const shuffle = useCallback(
    (id: string) => {
      const next = pushShuffled(shuffled, id)
      setShuffled(next)
      writeShuffled(sessionStore(), next)
    },
    [shuffled]
  )
  return { shuffled, shuffle }
}
