'use client'

import { useIntl } from 'react-intl'
import { BookOpenCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  JudgmentInboxItem,
  JudgmentRevisionView,
  JudgmentSummaryView,
} from '@/lib/api-client/judgments'

interface JudgmentQueueProps {
  pending: JudgmentInboxItem[]
  active: JudgmentSummaryView[]
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Href of a revision's review view, and the in-app navigation to it. */
  hrefFor: (revisionId: string) => string
  onOpen: (revisionId: string) => void
}

interface RowProps {
  name: string
  revision: JudgmentRevisionView
  paused: boolean
  href: string
  onOpen: () => void
}

function Row({ name, revision, paused, href, onOpen }: RowProps) {
  const intl = useIntl()
  const conflict = revision.conflictsWith.length > 0
  return (
    <li>
      <a
        href={href}
        onClick={event => {
          // Keep modified clicks (new tab) to the browser.
          if (event.metaKey || event.ctrlKey || event.shiftKey) return
          event.preventDefault()
          onOpen()
        }}
        data-testid='judgment-row'
        data-conflict={conflict ? 'true' : 'false'}
        className={`block rounded-lg border px-4 py-3 transition-colors hover:bg-accent ${
          conflict ? 'border-danger-border bg-danger-subtle' : 'border-border'
        }`}
      >
        <div className='flex flex-wrap items-center gap-2'>
          <span className='min-w-0 break-all font-mono text-caption text-muted-foreground'>
            {name}
          </span>
          <Badge variant='outline-muted' size='xs' shape='square'>
            {intl.formatMessage(
              { id: 'teamMemory.version' },
              { version: revision.version }
            )}
          </Badge>
          <Badge variant='outline-muted' size='xs' shape='square'>
            {intl.formatMessage({ id: `teamMemory.kind.${revision.kind}` })}
          </Badge>
          <Badge
            variant={
              revision.origin === 'UNKNOWN' ? 'warning' : 'outline-muted'
            }
            size='xs'
            shape='square'
          >
            {intl.formatMessage({ id: `teamMemory.origin.${revision.origin}` })}
          </Badge>
          {conflict && (
            <Badge variant='danger' size='xs' shape='square'>
              <TriangleAlert size={12} aria-hidden='true' />
              {intl.formatMessage({ id: 'teamMemory.badge.conflict' })}
            </Badge>
          )}
          {paused && (
            <Badge variant='warning' size='xs' shape='square'>
              {intl.formatMessage({ id: 'teamMemory.badge.paused' })}
            </Badge>
          )}
        </div>
        <p className='mt-1.5 break-words text-body-strong text-foreground'>
          {revision.description}
        </p>
        <p className='mt-0.5 line-clamp-2 break-words text-body text-muted-foreground'>
          {revision.statement}
        </p>
        {conflict && (
          <p className='mt-1.5 text-caption text-danger-text'>
            {intl.formatMessage(
              { id: 'teamMemory.conflict.with' },
              {
                names: [
                  ...new Set(revision.conflictsWith.map(c => c.judgmentName)),
                ].join(', '),
              }
            )}
          </p>
        )}
      </a>
    </li>
  )
}

/**
 * LUM-1356 — the team memory queue: candidates waiting for a person's review
 * (conflicts first, as the server orders them) and the entries in effect.
 */
export function JudgmentQueue({
  pending,
  active,
  loading,
  error,
  onRetry,
  hrefFor,
  onOpen,
}: JudgmentQueueProps) {
  const intl = useIntl()
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values)

  if (loading) {
    return (
      <div className='h-64 animate-pulse rounded-lg border border-border bg-muted/40' />
    )
  }
  if (error) {
    return (
      <div className='flex flex-wrap items-center gap-2 text-body text-danger-text'>
        <span>{t('teamMemory.loadFailed')}</span>
        <Button type='button' variant='outline' size='sm' onClick={onRetry}>
          {t('teamMemory.retry')}
        </Button>
      </div>
    )
  }

  const conflicts = pending.filter(
    item => item.revision.conflictsWith.length > 0
  ).length

  return (
    <Tabs defaultValue='pending'>
      <TabsList>
        <TabsTrigger value='pending' data-testid='team-memory-tab-pending'>
          {t('teamMemory.tab.pending', { count: pending.length })}
        </TabsTrigger>
        <TabsTrigger value='active' data-testid='team-memory-tab-active'>
          {t('teamMemory.tab.active', { count: active.length })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value='pending' className='mt-4'>
        {pending.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <BookOpenCheck />
              </EmptyMedia>
              <EmptyTitle>{t('teamMemory.pending.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('teamMemory.pending.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {conflicts > 0 && (
              <p
                className='mb-3 text-caption text-danger-text'
                role='status'
                data-testid='team-memory-conflict-note'
              >
                {t('teamMemory.pending.conflictNote', { count: conflicts })}
              </p>
            )}
            <ul className='grid gap-2' data-testid='team-memory-pending-list'>
              {pending.map(({ judgment, revision }) => (
                <Row
                  key={revision.id}
                  name={judgment.name}
                  revision={revision}
                  paused={false}
                  href={hrefFor(revision.id)}
                  onOpen={() => onOpen(revision.id)}
                />
              ))}
            </ul>
          </>
        )}
      </TabsContent>

      <TabsContent value='active' className='mt-4'>
        {active.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <BookOpenCheck />
              </EmptyMedia>
              <EmptyTitle>{t('teamMemory.active.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('teamMemory.active.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className='grid gap-2' data-testid='team-memory-active-list'>
            {active.map(
              judgment =>
                judgment.activeRevision && (
                  <Row
                    key={judgment.id}
                    name={judgment.name}
                    revision={judgment.activeRevision}
                    paused={judgment.paused}
                    href={hrefFor(judgment.activeRevision.id)}
                    onOpen={() => onOpen(judgment.activeRevision!.id)}
                  />
                )
            )}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  )
}
