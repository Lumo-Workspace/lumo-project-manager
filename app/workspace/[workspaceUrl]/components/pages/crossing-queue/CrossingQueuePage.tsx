'use client'

import { useMemo, useState } from 'react'
import { useIntl } from 'react-intl'
import { useParams } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import type { QueueFilter } from '@/lib/api-client/boundary-crossing-queue'
import type { WorkspaceMemberInfo } from '../../../types'
import { BOUNDARY_CROSSINGS_ANCHOR } from '../../TaskDetailTimeline/taskTabs'
import {
  useCrossingCard,
  useCrossingQueue,
  useShuffledIds,
} from '../../../hooks/useCrossingQueue'
import { applyShuffle } from './shuffle-order'
import { CrossingCard } from './CrossingCard'
import { CardActions } from './CardActions'

const ALL_PROJECTS = '__all__'

interface CrossingQueuePageProps {
  members: WorkspaceMemberInfo[]
  projects: { id: string; name: string }[]
}

/**
 * LUM-1336: the workspace Boundary Crossings tab. The viewer's OPEN task
 * crossings — only the ones they may rule on — dealt one index card at a
 * time: blocking first, then by severity, then oldest. Shuffled cards go to
 * the back for the rest of this browser session.
 */
export function CrossingQueuePage({
  members,
  projects,
}: CrossingQueuePageProps) {
  const intl = useIntl()
  const { workspaceUrl } = useParams<{ workspaceUrl: string }>()
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [projectId, setProjectId] = useState<string | null>(null)
  const { queue, loading, error, refresh } = useCrossingQueue(filter, projectId)
  const { shuffled, shuffle } = useShuffledIds()

  const ordered = useMemo(
    () => applyShuffle(queue?.cards ?? [], shuffled),
    [queue, shuffled]
  )
  const current = ordered[0] ?? null
  const card = useCrossingCard(current?.id ?? null)

  return (
    <div className='mx-auto w-full max-w-3xl px-4 py-6 sm:px-6'>
      <header className='mb-4'>
        <h1 className='text-heading'>
          {intl.formatMessage({
            id: 'crossingQueue.title',
            defaultMessage: 'Boundary Crossings',
          })}
        </h1>
        <p className='mt-1 text-body text-muted-foreground'>
          {intl.formatMessage({
            id: 'crossingQueue.subtitle',
            defaultMessage:
              'Crossings waiting on your ruling, one card at a time. Rule on it, tag a teammate, or shuffle it to the back.',
          })}
        </p>
      </header>

      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <ToggleGroup
          type='single'
          variant='chip'
          value={filter}
          onValueChange={v => v && setFilter(v as QueueFilter)}
          aria-label={intl.formatMessage({
            id: 'crossingQueue.filter',
            defaultMessage: 'Filter',
          })}
        >
          <ToggleGroupItem value='all'>
            {intl.formatMessage({
              id: 'crossingQueue.filter.all',
              defaultMessage: 'All',
            })}
          </ToggleGroupItem>
          <ToggleGroupItem value='tagged'>
            {intl.formatMessage({
              id: 'crossingQueue.filter.tagged',
              defaultMessage: 'Tagged for me',
            })}
          </ToggleGroupItem>
          <ToggleGroupItem value='blocking'>
            {intl.formatMessage({
              id: 'crossingQueue.filter.blocking',
              defaultMessage: 'Blocking only',
            })}
          </ToggleGroupItem>
        </ToggleGroup>
        <Select
          value={projectId ?? ALL_PROJECTS}
          onValueChange={v => setProjectId(v === ALL_PROJECTS ? null : v)}
        >
          <SelectTrigger
            className='h-control-sm w-48'
            aria-label={intl.formatMessage({
              id: 'crossingQueue.project',
              defaultMessage: 'Project',
            })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROJECTS}>
              {intl.formatMessage({
                id: 'crossingQueue.allProjects',
                defaultMessage: 'All projects',
              })}
            </SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {queue && ordered.length > 0 && (
          <span
            className='ml-auto text-caption text-muted-foreground'
            role='status'
          >
            {intl.formatMessage(
              {
                id: 'crossingQueue.counter',
                defaultMessage:
                  '{count, plural, one {# card} other {# cards}} · {blocking} blocking Done',
              },
              { count: ordered.length, blocking: queue.blockingCount }
            )}
          </span>
        )}
      </div>

      {queue?.truncated && (
        <p className='mb-3 text-caption text-muted-foreground'>
          {intl.formatMessage({
            id: 'crossingQueue.truncated',
            defaultMessage:
              'Showing the first 500 open crossings — rule on some to see the rest.',
          })}
        </p>
      )}

      {loading ? (
        <div className='h-64 animate-pulse rounded-lg border border-border bg-muted/40' />
      ) : error ? (
        <div className='flex flex-wrap items-center gap-2 text-body text-danger-text'>
          <span>
            {intl.formatMessage({
              id: 'crossingQueue.loadFailed',
              defaultMessage: "Couldn't load your queue.",
            })}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => refresh()}
          >
            {intl.formatMessage({
              id: 'crossingQueue.retry',
              defaultMessage: 'Retry',
            })}
          </Button>
        </div>
      ) : current ? (
        <div className='relative pb-3'>
          {/* The rest of the deck peeking out behind the top card. */}
          {ordered.length > 2 && (
            <div
              aria-hidden
              className='absolute inset-x-6 bottom-0 top-3 rounded-lg border border-border bg-card/60'
            />
          )}
          {ordered.length > 1 && (
            <div
              aria-hidden
              className='absolute inset-x-3 bottom-1.5 top-1.5 rounded-lg border border-border bg-card/80'
            />
          )}
          <div className='relative'>
            <CrossingCard
              key={current.id}
              card={current}
              context={card.context}
              members={members}
              taskHref={`/workspace/${workspaceUrl}/my-tasks/${current.taskIdentifier}/record#${BOUNDARY_CROSSINGS_ANCHOR}`}
              onRetry={() => card.refresh()}
              actions={
                <CardActions
                  key={current.id}
                  crossingId={current.id}
                  context={card.context}
                  members={members}
                  onShuffle={() => shuffle(current.id)}
                />
              }
            />
          </div>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>
              {filter === 'tagged'
                ? intl.formatMessage({
                    id: 'crossingQueue.empty.tagged',
                    defaultMessage: 'Nothing tagged for you',
                  })
                : intl.formatMessage({
                    id: 'crossingQueue.empty.title',
                    defaultMessage: 'Nothing to rule on',
                  })}
            </EmptyTitle>
            <EmptyDescription>
              {intl.formatMessage({
                id: 'crossingQueue.empty.description',
                defaultMessage:
                  "Crossings on tasks assigned to you show up here. Workspace owners see every task's crossings.",
              })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
