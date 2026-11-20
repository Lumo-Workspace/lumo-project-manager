'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  judgmentsClient,
  type JudgmentInboxItem,
  type JudgmentReviewAction,
  type JudgmentReviewView,
  type JudgmentRevisionDraft,
  type JudgmentRevisionView,
  type JudgmentSettingsView,
  type JudgmentSummaryView,
} from '@/lib/api-client/judgments'
import { queryKeys } from '@/lib/query/keys'

/** LUM-1356: the workspace's team memory review settings. */
export function useJudgmentSettings() {
  const query = useQuery<JudgmentSettingsView>({
    queryKey: queryKeys.judgmentSettings(),
    queryFn: () => judgmentsClient.settings(),
    staleTime: 60_000,
  })
  return {
    settings: query.data ?? null,
    loading: query.isPending,
    /** True once the server says review is on for this workspace. */
    enabled: !!query.data && query.data.effectiveMode !== 'OFF',
  }
}

/** Candidates waiting for review, conflicts first. Idle while review is off. */
export function useJudgmentInbox(enabled: boolean) {
  const query = useQuery<{ items: JudgmentInboxItem[] }>({
    queryKey: queryKeys.judgmentInbox(),
    queryFn: () => judgmentsClient.inbox(),
    enabled,
    staleTime: 30_000,
  })
  return {
    items: query.data?.items ?? [],
    loading: enabled && query.isPending,
    error: query.error ? (query.error as Error).message : null,
    refresh: query.refetch,
  }
}

/** Entries with an approved revision in effect. */
export function useActiveJudgments(enabled: boolean) {
  const query = useQuery<{ judgments: JudgmentSummaryView[] }>({
    queryKey: queryKeys.judgmentActive(),
    queryFn: () => judgmentsClient.listActive(),
    enabled,
    staleTime: 30_000,
  })
  return {
    judgments: query.data?.judgments ?? [],
    loading: enabled && query.isPending,
    error: query.error ? (query.error as Error).message : null,
  }
}

/** One exact revision with its entry — what the review page shows. */
export function useJudgmentRevision(revisionId: string | null) {
  const query = useQuery<JudgmentReviewView>({
    queryKey: queryKeys.judgmentRevision(revisionId ?? ''),
    queryFn: () => judgmentsClient.revision(revisionId!),
    enabled: !!revisionId,
  })
  return {
    review: query.data ?? null,
    loading: query.isPending && !!revisionId,
    error: query.error ? (query.error as Error).message : null,
    refresh: query.refetch,
  }
}

/** The review actions and "propose a corrected revision"; each refreshes every judgment query. */
export function useJudgmentReviewActions() {
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.judgmentsAll() })

  const act = useMutation({
    mutationFn: (input: {
      revision: Pick<JudgmentRevisionView, 'id' | 'digest'>
      action: JudgmentReviewAction
      reason: string | null
    }) =>
      judgmentsClient.review(input.revision.id, input.action, {
        digest: input.revision.digest,
        reason: input.reason,
      }),
    onSettled: refresh,
  })

  const revise = useMutation({
    mutationFn: (input: {
      source: JudgmentRevisionView
      baseRevisionId: string | null
      draft: JudgmentRevisionDraft
    }) =>
      judgmentsClient.revise(input.source, input.baseRevisionId, input.draft),
    onSettled: refresh,
  })

  return { act, revise }
}
