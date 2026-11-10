'use client'

import { useState } from 'react'
import { useIntl } from 'react-intl'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDownToLine, FlagOff, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CardContextView } from '@/lib/api-client/boundary-crossing-queue'
import type { WorkspaceMemberInfo } from '../../../types'
import { boundaryDispositionLabel } from '../../TaskDetailTimeline/boundary-format'
import { useCrossingCardActions } from '../../../hooks/useCrossingQueue'
import { canRule, failedSections } from './card-state'

const COMPACT_ICON = '[&_svg]:size-3.5'
const TONE_DANGER = `${COMPACT_ICON} border-danger-border text-danger-text hover:bg-danger-subtle hover:text-danger-text`

interface CardActionsProps {
  crossingId: string
  context: CardContextView | null
  members: WorkspaceMemberInfo[]
  onShuffle: () => void
}

/**
 * LUM-1336: a card's three moves. Ruling takes a deliberate click per card —
 * no bulk ruling, no shortcut, nothing pre-selected — and stays disabled until
 * every context section has loaded. Tagging only offers members who may rule
 * (the task's assignee and OWNERs). Shuffling only reorders this browser
 * session's queue.
 */
export function CardActions({
  crossingId,
  context,
  members,
  onShuffle,
}: CardActionsProps) {
  const intl = useIntl()
  const { rule, tag } = useCrossingCardActions(crossingId)
  const [note, setNote] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const [tagMember, setTagMember] = useState('')
  const [tagMessage, setTagMessage] = useState('')

  const ready = canRule(context)
  const failed = context ? failedSections(context) : []
  const pending = rule.isPending || tag.isPending
  const stateHash =
    context?.crossing.status === 'ok' ? context.crossing.data.stateHash : null
  const tagTargets =
    context?.tagTargets.status === 'ok' ? context.tagTargets.data : []
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? id

  const onRule = (disposition: 'FALSE_POSITIVE' | 'CONFIRMED') => {
    if (!stateHash) return
    rule.mutate(
      {
        disposition,
        stateHash,
        ...(note.trim() ? { dispositionNote: note.trim() } : {}),
      },
      {
        onSuccess: () => {
          setNote('')
          toast.success(
            intl.formatMessage(
              {
                id: 'crossingQueue.toast.ruled',
                defaultMessage: 'Ruled {ruling}',
              },
              { ruling: boundaryDispositionLabel(disposition, intl) }
            )
          )
        },
        onError: error => toast.error(error.message),
      }
    )
  }

  const onTag = () => {
    if (!tagMember) return
    tag.mutate(
      {
        memberId: tagMember,
        ...(tagMessage.trim() ? { message: tagMessage.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            intl.formatMessage(
              {
                id: 'crossingQueue.toast.tagged',
                defaultMessage: 'Tagged {name}',
              },
              { name: nameOf(tagMember) }
            )
          )
          setTagOpen(false)
          setTagMember('')
          setTagMessage('')
        },
        onError: error => toast.error(error.message),
      }
    )
  }

  return (
    <div className='space-y-3'>
      {context && failed.length > 0 && (
        <p className='text-caption text-danger-text' role='status'>
          {intl.formatMessage({
            id: 'crossingQueue.rulingDisabled',
            defaultMessage:
              'Ruling is disabled until every section of this card has loaded.',
          })}
        </p>
      )}
      <Input
        type='text'
        value={note}
        disabled={pending || !ready}
        onChange={e => setNote(e.target.value)}
        placeholder={intl.formatMessage({
          id: 'boundary.panel.notePlaceholder',
          defaultMessage: 'Disposition note (optional)',
        })}
        className='h-control-sm text-caption md:text-caption'
        aria-label={intl.formatMessage({
          id: 'boundary.panel.notePlaceholder',
          defaultMessage: 'Disposition note (optional)',
        })}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className={COMPACT_ICON}
          disabled={pending || !ready}
          onClick={() => onRule('FALSE_POSITIVE')}
          data-testid='crossing-card-false-positive'
        >
          <FlagOff aria-hidden />
          {boundaryDispositionLabel('FALSE_POSITIVE', intl)}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className={TONE_DANGER}
          disabled={pending || !ready}
          onClick={() => onRule('CONFIRMED')}
          data-testid='crossing-card-confirm'
        >
          <AlertTriangle aria-hidden />
          {intl.formatMessage({
            id: 'boundary.panel.confirmCrossing',
            defaultMessage: 'Confirm crossing',
          })}
        </Button>

        <span className='flex-1' />

        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className={COMPACT_ICON}
              disabled={pending || tagTargets.length === 0}
              data-testid='crossing-card-tag'
            >
              <Tag aria-hidden />
              {intl.formatMessage({
                id: 'crossingQueue.tag',
                defaultMessage: 'Tag a teammate',
              })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-72 space-y-2'>
            <p className='text-caption text-muted-foreground'>
              {intl.formatMessage({
                id: 'crossingQueue.tagHint',
                defaultMessage:
                  "Only the task's assignee and workspace owners can rule on a crossing, so only they can be tagged. A tag doesn't rule on it.",
              })}
            </p>
            <Select value={tagMember} onValueChange={setTagMember}>
              <SelectTrigger
                aria-label={intl.formatMessage({
                  id: 'crossingQueue.tagWho',
                  defaultMessage: 'Who should look at this?',
                })}
              >
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'crossingQueue.tagWho',
                    defaultMessage: 'Who should look at this?',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {tagTargets.map(t => (
                  <SelectItem key={t.memberId} value={t.memberId}>
                    {nameOf(t.memberId)}
                    {t.role === 'OWNER'
                      ? ` · ${intl.formatMessage({
                          id: 'crossingQueue.owner',
                          defaultMessage: 'owner',
                        })}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={tagMessage}
              onChange={e => setTagMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={intl.formatMessage({
                id: 'crossingQueue.tagMessage',
                defaultMessage: 'Message (optional)',
              })}
            />
            <Button
              type='button'
              size='sm'
              className='w-full'
              disabled={!tagMember || tag.isPending}
              onClick={onTag}
            >
              {intl.formatMessage({
                id: 'crossingQueue.tagSend',
                defaultMessage: 'Send tag',
              })}
            </Button>
          </PopoverContent>
        </Popover>

        <Button
          type='button'
          variant='ghost'
          size='sm'
          className={COMPACT_ICON}
          disabled={pending}
          onClick={onShuffle}
          data-testid='crossing-card-shuffle'
        >
          <ArrowDownToLine aria-hidden />
          {intl.formatMessage({
            id: 'crossingQueue.shuffle',
            defaultMessage: 'Shuffle to back',
          })}
        </Button>
      </div>
    </div>
  )
}
