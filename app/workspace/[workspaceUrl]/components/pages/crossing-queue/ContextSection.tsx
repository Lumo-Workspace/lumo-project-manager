'use client'

import { useIntl } from 'react-intl'
import { ChevronRight, CircleAlert } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import type { CardSection } from '@/lib/api-client/boundary-crossing-queue'

interface ContextSectionProps<T> {
  title: string
  section: CardSection<T> | undefined
  /** Shown in the header while collapsed, e.g. a count. */
  hint?: string | undefined
  onRetry: () => void
  children: (data: T) => React.ReactNode
}

/**
 * LUM-1336: one expandable section of an index card's task context. A section
 * whose read failed says so — it is never rendered as an empty one — and
 * offers a retry; while loading it shows a placeholder line.
 */
export function ContextSection<T>({
  title,
  section,
  hint,
  onRetry,
  children,
}: ContextSectionProps<T>) {
  const intl = useIntl()
  return (
    <Collapsible className='border-t border-border first:border-t-0'>
      <CollapsibleTrigger className='flex w-full items-center gap-2 py-2 text-left text-body-strong hover:text-foreground'>
        <ChevronRight
          className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90'
          aria-hidden
        />
        <span className='flex-1'>{title}</span>
        {section?.status === 'error' ? (
          <span className='flex items-center gap-1 text-caption text-danger-text'>
            <CircleAlert className='size-3.5' aria-hidden />
            {intl.formatMessage({
              id: 'crossingQueue.section.failedShort',
              defaultMessage: "Couldn't load",
            })}
          </span>
        ) : hint ? (
          <span className='text-caption text-muted-foreground'>{hint}</span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='pb-3 pl-6 text-body'>
          {section === undefined ? (
            <p className='text-caption text-muted-foreground'>
              {intl.formatMessage({
                id: 'crossingQueue.section.loading',
                defaultMessage: 'Loading…',
              })}
            </p>
          ) : section.status === 'error' ? (
            <div className='flex flex-wrap items-center gap-2 text-caption text-danger-text'>
              <span>
                {intl.formatMessage({
                  id: 'crossingQueue.section.failed',
                  defaultMessage:
                    "This section couldn't be loaded. It isn't empty — it's unknown.",
                })}
              </span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={onRetry}
              >
                {intl.formatMessage({
                  id: 'crossingQueue.retry',
                  defaultMessage: 'Retry',
                })}
              </Button>
            </div>
          ) : (
            children(section.data)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
