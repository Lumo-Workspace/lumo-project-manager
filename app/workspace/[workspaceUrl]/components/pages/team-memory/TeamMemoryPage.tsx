'use client'

import { useMemo } from 'react'
import { useIntl } from 'react-intl'
import { useParams, usePathname } from 'next/navigation'
import { BookOpenCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { WorkspaceMemberInfo } from '../../../types'
import {
  useActiveJudgments,
  useJudgmentInbox,
  useJudgmentRevision,
  useJudgmentSettings,
} from '../../../hooks/useJudgments'
import { JudgmentQueue } from './JudgmentQueue'
import { JudgmentReview } from './JudgmentReview'
import { revisionIdFromPath, teamMemoryPath } from './team-memory-path'

interface TeamMemoryPageProps {
  members: WorkspaceMemberInfo[]
}

/**
 * LUM-1356 — the workspace Team memory page: the queue of candidates waiting
 * for a person's review, and the review of one exact revision. Which of the
 * two shows is the URL: `/team-memory` or `/team-memory/<revisionId>`.
 */
export function TeamMemoryPage({ members }: TeamMemoryPageProps) {
  const { workspaceUrl } = useParams<{ workspaceUrl: string }>()
  const pathname = usePathname()
  return (
    <TeamMemoryView
      members={members}
      workspaceUrl={workspaceUrl}
      revisionId={revisionIdFromPath(pathname ?? '', workspaceUrl)}
      // Next keeps usePathname in step with history.pushState, so the view
      // follows the URL without leaving the workspace shell.
      onOpen={id =>
        window.history.pushState(null, '', teamMemoryPath(workspaceUrl, id))
      }
    />
  )
}

interface TeamMemoryViewProps extends TeamMemoryPageProps {
  workspaceUrl: string
  /** The revision under review; null shows the queue. */
  revisionId: string | null
  onOpen: (revisionId: string | null) => void
}

/** The page without its URL handling. */
export function TeamMemoryView({
  members,
  workspaceUrl,
  revisionId,
  onOpen: open,
}: TeamMemoryViewProps) {
  const intl = useIntl()
  const t = (id: string) => intl.formatMessage({ id })

  const { settings, loading: settingsLoading, enabled } = useJudgmentSettings()
  const inbox = useJudgmentInbox(enabled && !revisionId)
  const active = useActiveJudgments(enabled && !revisionId)
  const revision = useJudgmentRevision(enabled ? revisionId : null)

  const memberNames = useMemo(
    () => new Map(members.map(member => [member.id, member.name])),
    [members]
  )
  // `canEdit` is "the viewer is a workspace owner".
  const canReview =
    settings?.admission !== 'OWNER_ONLY' || settings.canEdit === true

  const hrefFor = (id: string) => teamMemoryPath(workspaceUrl, id)

  return (
    <div
      data-testid='team-memory-page'
      className='min-h-0 flex-1 overflow-y-auto'
    >
      <div className='mx-auto w-full max-w-3xl px-4 py-6 sm:px-6'>
        {settingsLoading ? (
          <div className='h-64 animate-pulse rounded-lg border border-border bg-muted/40' />
        ) : !enabled ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <BookOpenCheck />
              </EmptyMedia>
              <EmptyTitle>{t('teamMemory.off.title')}</EmptyTitle>
              <EmptyDescription>
                {t('teamMemory.off.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : revisionId ? (
          revision.loading ? (
            <div className='h-64 animate-pulse rounded-lg border border-border bg-muted/40' />
          ) : revision.review ? (
            <JudgmentReview
              key={revision.review.revision.id}
              review={revision.review}
              memberNames={memberNames}
              canReview={canReview}
              backHref={teamMemoryPath(workspaceUrl)}
              onBack={() => open(null)}
              hrefFor={hrefFor}
              onOpen={open}
            />
          ) : (
            <div className='flex flex-wrap items-center gap-2 text-body text-danger-text'>
              <span>{t('teamMemory.review.notFound')}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => open(null)}
              >
                {t('teamMemory.review.back')}
              </Button>
            </div>
          )
        ) : (
          <>
            <header className='mb-4'>
              <h1 className='text-heading'>{t('teamMemory.title')}</h1>
              <p className='mt-1 text-body text-muted-foreground'>
                {t('teamMemory.subtitle')}
              </p>
            </header>
            <JudgmentQueue
              pending={inbox.items}
              active={active.judgments}
              loading={inbox.loading || active.loading}
              error={inbox.error ?? active.error}
              onRetry={() => void inbox.refresh()}
              hrefFor={hrefFor}
              onOpen={open}
            />
          </>
        )}
      </div>
    </div>
  )
}
