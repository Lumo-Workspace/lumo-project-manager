'use client'

import { useState } from 'react'
import { useIntl } from 'react-intl'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  JudgmentReviewAction,
  JudgmentReviewView,
  JudgmentRevisionDraft,
} from '@/lib/api-client/judgments'
import { useJudgmentReviewActions } from '../../../hooks/useJudgments'
import { JudgmentRevisionBody } from './JudgmentRevisionBody'
import { JudgmentReviseForm } from './JudgmentReviseForm'

interface JudgmentReviewProps {
  review: JudgmentReviewView
  memberNames: ReadonlyMap<string, string>
  /** The viewer may approve / reject / request changes / withdraw. */
  canReview: boolean
  backHref: string
  onBack: () => void
  hrefFor: (revisionId: string) => string
  onOpen: (revisionId: string) => void
}

type ReasonAction = Exclude<JudgmentReviewAction, 'approve'>

const STATE_TONE = {
  PROPOSED: 'info',
  APPROVED: 'success',
  CHANGES_REQUESTED: 'warning',
  REJECTED: 'muted',
  EXPIRED: 'muted',
  SUPERSEDED: 'muted',
  WITHDRAWN: 'muted',
} as const

/**
 * LUM-1356 — review one exact revision: what it says, where it came from,
 * what blocks its approval, and the actions a person may take on it. A
 * correction is a new revision, never an edit of this one.
 */
export function JudgmentReview({
  review,
  memberNames,
  canReview,
  backHref,
  onBack,
  hrefFor,
  onOpen,
}: JudgmentReviewProps) {
  const intl = useIntl()
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values)
  const { judgment, revision, activeRevision } = review
  const { act, revise } = useJudgmentReviewActions()
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)

  const pending = revision.state === 'PROPOSED'
  const inEffect =
    revision.state === 'APPROVED' && judgment.activeRevisionId === revision.id
  const blockers = revision.approvalBlockers
  const busy = act.isPending || revise.isPending

  const run = async (action: JudgmentReviewAction, why: string | null) => {
    try {
      await act.mutateAsync({ revision, action, reason: why })
      toast.success(t(`teamMemory.action.${action}.done`))
      setReasonFor(null)
      setReason('')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('teamMemory.action.failed')
      )
    }
  }

  const submitRevision = async (draft: JudgmentRevisionDraft) => {
    try {
      const result = await revise.mutateAsync({
        source: revision,
        baseRevisionId: judgment.activeRevisionId,
        draft,
      })
      toast.success(t('teamMemory.revise.done'))
      setEditing(false)
      onOpen(result.revision.id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('teamMemory.action.failed')
      )
    }
  }

  return (
    <div data-testid='judgment-review'>
      <a
        href={backHref}
        onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return
          event.preventDefault()
          onBack()
        }}
        className='mb-3 inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft size={14} aria-hidden='true' />
        {t('teamMemory.review.back')}
      </a>

      <header className='mb-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='break-all font-mono text-caption text-muted-foreground'>
            {judgment.name}
          </span>
          <Badge variant='outline-muted' size='xs' shape='square'>
            {t('teamMemory.version', { version: revision.version })}
          </Badge>
          <Badge
            variant={STATE_TONE[revision.state]}
            size='xs'
            shape='square'
            data-testid='judgment-state'
          >
            {t(`teamMemory.state.${revision.state}`)}
          </Badge>
          {judgment.paused && (
            <Badge variant='warning' size='xs' shape='square'>
              {t('teamMemory.badge.paused')}
            </Badge>
          )}
        </div>
        <h1 className='mt-1.5 break-words text-heading'>
          {revision.description}
        </h1>
        <p className='mt-1 text-caption text-muted-foreground'>
          {judgment.projectId
            ? t('teamMemory.review.scope.project')
            : t('teamMemory.review.scope.workspace')}
        </p>
      </header>

      {revision.conflictsWith.length > 0 && (
        <Alert
          variant='danger'
          className='mb-4 px-4 py-3'
          data-testid='judgment-conflict-alert'
        >
          <TriangleAlert aria-hidden='true' />
          <AlertTitle>{t('teamMemory.conflict.title')}</AlertTitle>
          <AlertDescription>
            <p>
              {pending
                ? t('teamMemory.conflict.candidate')
                : t('teamMemory.conflict.approved')}
            </p>
            <ul className='mt-1 list-disc pl-4'>
              {revision.conflictsWith.map(other => (
                <li key={other.revisionId}>
                  <a
                    href={hrefFor(other.revisionId)}
                    onClick={event => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) {
                        return
                      }
                      event.preventDefault()
                      onOpen(other.revisionId)
                    }}
                    className='font-mono text-caption text-primary hover:underline'
                  >
                    {other.judgmentName}
                  </a>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {pending && blockers.some(blocker => blocker !== 'CONFLICT') && (
        <Alert
          variant='warning'
          className='mb-4 px-4 py-3'
          data-testid='judgment-blockers'
        >
          <TriangleAlert aria-hidden='true' />
          <AlertTitle>{t('teamMemory.blockers.title')}</AlertTitle>
          <AlertDescription>
            <ul className='list-disc pl-4'>
              {blockers
                .filter(blocker => blocker !== 'CONFLICT')
                .map(blocker => (
                  <li key={blocker}>{t(`teamMemory.blocker.${blocker}`)}</li>
                ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <section className='rounded-lg border border-border px-5 py-4'>
        <JudgmentRevisionBody revision={revision} memberNames={memberNames} />
      </section>

      {activeRevision && (
        <details className='mt-4 rounded-lg border border-border px-5 py-3'>
          <summary className='cursor-pointer text-body-strong'>
            {t('teamMemory.review.inEffect', {
              version: activeRevision.version,
            })}
          </summary>
          <div className='mt-3'>
            <JudgmentRevisionBody
              revision={activeRevision}
              memberNames={memberNames}
            />
          </div>
        </details>
      )}

      {editing ? (
        <section className='mt-4 rounded-lg border border-border px-5 py-4'>
          <JudgmentReviseForm
            source={revision}
            saving={revise.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={draft => void submitRevision(draft)}
          />
        </section>
      ) : (
        <footer className='mt-4' data-testid='judgment-actions'>
          {!canReview && (pending || inEffect) && (
            <p className='mb-2 text-caption text-muted-foreground'>
              {t('teamMemory.review.ownerOnly')}
            </p>
          )}
          {reasonFor ? (
            <div className='rounded-lg border border-border px-5 py-4'>
              <Label htmlFor='judgment-reason' className='text-body-strong'>
                {t(`teamMemory.action.${reasonFor}.reason`)}
              </Label>
              <Textarea
                id='judgment-reason'
                className='mt-2'
                rows={3}
                value={reason}
                onChange={event => setReason(event.target.value)}
                maxLength={2000}
              />
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant={
                    reasonFor === 'request-changes' ? 'default' : 'destructive'
                  }
                  disabled={busy || reason.trim().length === 0}
                  onClick={() => void run(reasonFor, reason.trim())}
                >
                  {t(`teamMemory.action.${reasonFor}`)}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => {
                    setReasonFor(null)
                    setReason('')
                  }}
                >
                  {t('teamMemory.action.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {pending && (
                <>
                  <Button
                    type='button'
                    data-testid='judgment-approve'
                    disabled={busy || !canReview || blockers.length > 0}
                    onClick={() => void run('approve', null)}
                  >
                    {t('teamMemory.action.approve')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy || !canReview}
                    onClick={() => setReasonFor('request-changes')}
                  >
                    {t('teamMemory.action.request-changes')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy || !canReview}
                    onClick={() => setReasonFor('reject')}
                  >
                    {t('teamMemory.action.reject')}
                  </Button>
                </>
              )}
              {inEffect && (
                <Button
                  type='button'
                  variant='outline'
                  data-testid='judgment-withdraw'
                  disabled={busy || !canReview}
                  onClick={() => setReasonFor('withdraw')}
                >
                  {t('teamMemory.action.withdraw')}
                </Button>
              )}
              {(pending ||
                inEffect ||
                revision.state === 'CHANGES_REQUESTED') && (
                <Button
                  type='button'
                  variant='ghost'
                  data-testid='judgment-edit'
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  {t('teamMemory.action.edit')}
                </Button>
              )}
            </div>
          )}
          {pending && (
            <p className='mt-2 text-caption text-muted-foreground'>
              {t('teamMemory.review.approveNote')}
            </p>
          )}
        </footer>
      )}
    </div>
  )
}
