'use client'

import { useIntl } from 'react-intl'
import { ExternalLink, Info, Repeat, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type {
  CardContextView,
  QueueCardView,
} from '@/lib/api-client/boundary-crossing-queue'
import type { WorkspaceMemberInfo } from '../../../types'
import { statusLabel } from '../../../utils/taskStatus'
import {
  boundaryCategoryLabel,
  boundaryDispositionLabel,
  boundarySeverityLabel,
} from '../../TaskDetailTimeline/boundary-format'
import {
  AttributionLine,
  EditChangeBlock,
} from '../../TaskDetailTimeline/BoundaryCrossingsPanel'
import { ContextSection } from './ContextSection'
import { purposeExcerpt } from './card-state'

interface CrossingCardProps {
  card: QueueCardView
  context: CardContextView | null
  members: WorkspaceMemberInfo[]
  /** Link to the task's Record tab, at its crossings panel. */
  taskHref: string
  onRetry: () => void
  /** The action bar (rule / tag / shuffle), composed in by the page. */
  actions: React.ReactNode
}

/**
 * LUM-1336: one index card. The face carries what a reviewer needs to judge
 * the crossing away from the task page — the task, its purpose, the turn's
 * intent and what fired; the expandable sections carry the rest of the task
 * context. Member-written text renders as plain text (React escapes it).
 */
export function CrossingCard({
  card,
  context,
  members,
  taskHref,
  onRetry,
  actions,
}: CrossingCardProps) {
  const intl = useIntl()
  const memberName = (id: string | null) =>
    (id && members.find(m => m.id === id)?.name) ||
    intl.formatMessage({
      id: 'crossingQueue.someone',
      defaultMessage: 'a teammate',
    })

  const crossing = context?.crossing
  const task = context?.task
  const view = crossing?.status === 'ok' ? crossing.data.view : null
  const taskData = task?.status === 'ok' ? task.data : null
  const turnIntent = view?.agentContext ?? view?.editChange?.agentTurnContext
  const purpose = purposeExcerpt(taskData?.description ?? null)

  return (
    <article
      className='rounded-lg border border-border bg-card p-4 shadow-elevation-2 sm:p-5'
      aria-label={card.ref}
      data-testid='crossing-card'
    >
      {/* What fired */}
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='font-mono text-caption text-muted-foreground'>
          {card.ref}
        </span>
        <Badge
          variant={card.severity === 'HIGH' ? 'danger' : 'warning'}
          size='sm'
          shape='square'
        >
          {intl.formatMessage(
            {
              id: 'boundary.panel.severityBadge',
              defaultMessage: '{severity} severity',
            },
            { severity: boundarySeverityLabel(card.severity, intl) }
          )}
        </Badge>
        <Badge
          variant={card.blocking ? 'danger' : 'muted'}
          size='sm'
          shape='square'
        >
          {card.blocking
            ? intl.formatMessage({
                id: 'crossingQueue.blocksDone',
                defaultMessage: 'Blocks Done',
              })
            : intl.formatMessage({
                id: 'boundary.advisoryBadge',
                defaultMessage: 'Advisory',
              })}
        </Badge>
        {card.occurrenceCount > 1 && (
          <span className='flex items-center gap-1 text-caption text-muted-foreground'>
            <Repeat className='size-3' aria-hidden />
            {intl.formatMessage(
              {
                id: 'boundary.panel.recurrence',
                defaultMessage: 'seen ×{count}',
              },
              { count: card.occurrenceCount }
            )}
          </span>
        )}
      </div>
      <h2 className='mt-2 text-title'>
        {boundaryCategoryLabel(card.category, intl)}
      </h2>
      <p className='mt-1 break-words font-mono text-caption text-muted-foreground'>
        {card.summary}
      </p>

      {/* The task it happened on */}
      <div className='mt-4 rounded-md bg-muted/50 p-3'>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
          <a
            href={taskHref}
            className='font-mono text-caption text-primary hover:underline'
          >
            {card.taskIdentifier}
          </a>
          <span className='text-body-strong'>{card.taskTitle}</span>
        </div>
        <p className='mt-1 text-caption text-muted-foreground'>
          {[
            statusLabel(intl, card.taskStatus),
            taskData
              ? intl.formatMessage(
                  {
                    id: 'crossingQueue.assignee',
                    defaultMessage: 'Assignee: {name}',
                  },
                  {
                    name: taskData.assigneeMemberId
                      ? memberName(taskData.assigneeMemberId)
                      : intl.formatMessage({
                          id: 'crossingQueue.unassigned',
                          defaultMessage: 'unassigned',
                        }),
                  }
                )
              : null,
            card.projectName,
            taskData?.milestoneName,
            taskData?.sprintName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <FaceRow
          label={intl.formatMessage({
            id: 'crossingQueue.purpose',
            defaultMessage: 'Purpose',
          })}
          loading={!task}
          failed={task?.status === 'error'}
          value={
            purpose ??
            intl.formatMessage({
              id: 'crossingQueue.noDescription',
              defaultMessage: 'The task has no description.',
            })
          }
        />
        <FaceRow
          label={intl.formatMessage({
            id: 'crossingQueue.turnIntent',
            defaultMessage: 'Turn intent',
          })}
          loading={!crossing}
          failed={crossing?.status === 'error'}
          value={
            turnIntent ??
            intl.formatMessage({
              id: 'crossingQueue.noTurnIntent',
              defaultMessage: 'Not recorded for this action.',
            })
          }
        />
      </div>

      {card.taggedForMe && (
        <p className='mt-3 flex items-start gap-1.5 rounded-md border border-info-border bg-info-subtle px-3 py-2 text-caption text-info-text'>
          <Tag className='mt-0.5 size-3.5 shrink-0' aria-hidden />
          <span>
            {intl.formatMessage(
              {
                id: 'crossingQueue.taggedYou',
                defaultMessage: '{name} tagged you on this',
              },
              { name: memberName(card.taggedForMe.byMemberId) }
            )}
            {card.taggedForMe.message ? `: ${card.taggedForMe.message}` : ''}
          </span>
        </p>
      )}

      {/* The rest of the task context, one tap away */}
      <div className='mt-4'>
        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.spec',
            defaultMessage: 'Task spec',
          })}
          section={context?.task}
          onRetry={onRetry}
        >
          {t => (
            <div className='space-y-3'>
              <p className='whitespace-pre-wrap break-words'>
                {t.description ??
                  intl.formatMessage({
                    id: 'crossingQueue.noDescription',
                    defaultMessage: 'The task has no description.',
                  })}
              </p>
              <ContextSection
                title={intl.formatMessage({
                  id: 'crossingQueue.section.testCases',
                  defaultMessage: 'Acceptance checks',
                })}
                section={context?.testCases}
                hint={
                  context?.testCases.status === 'ok'
                    ? String(context.testCases.data.length)
                    : undefined
                }
                onRetry={onRetry}
              >
                {cases =>
                  cases.length === 0 ? (
                    <Muted>
                      {intl.formatMessage({
                        id: 'crossingQueue.noTestCases',
                        defaultMessage: 'No test cases on this task.',
                      })}
                    </Muted>
                  ) : (
                    <ul className='space-y-1'>
                      {cases.map(tc => (
                        <li key={tc.number} className='flex gap-2'>
                          <span className='font-mono text-caption text-muted-foreground'>
                            TC{tc.number}
                          </span>
                          <span className='flex-1'>{tc.title}</span>
                          <Badge
                            size='sm'
                            shape='square'
                            variant={
                              tc.latestResult === 'PASS'
                                ? 'success'
                                : tc.latestResult
                                  ? 'danger'
                                  : 'muted'
                            }
                          >
                            {tc.latestResult ??
                              intl.formatMessage({
                                id: 'crossingQueue.notRun',
                                defaultMessage: 'not run',
                              })}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )
                }
              </ContextSection>
            </div>
          )}
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.decisions',
            defaultMessage: 'Decisions',
          })}
          section={context?.decisions}
          hint={
            context?.decisions.status === 'ok'
              ? String(context.decisions.data.length)
              : undefined
          }
          onRetry={onRetry}
        >
          {decisions =>
            decisions.length === 0 ? (
              <Muted>
                {intl.formatMessage({
                  id: 'crossingQueue.noDecisions',
                  defaultMessage: 'No decisions recorded on this task.',
                })}
              </Muted>
            ) : (
              <ol className='space-y-2'>
                {decisions.map(d => (
                  <li key={d.number}>
                    <span className='font-mono text-caption text-muted-foreground'>
                      {d.number}.
                    </span>{' '}
                    <span className='whitespace-pre-wrap break-words'>
                      {d.text}
                    </span>
                    {d.rationale && (
                      <p className='text-caption text-muted-foreground'>
                        {d.rationale}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )
          }
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.landed',
            defaultMessage: 'Where the change landed',
          })}
          section={context?.pullRequests}
          hint={
            context?.pullRequests.status === 'ok'
              ? String(context.pullRequests.data.length)
              : undefined
          }
          onRetry={onRetry}
        >
          {prs => (
            <div className='space-y-2'>
              {prs.length === 0 ? (
                <Muted>
                  {intl.formatMessage({
                    id: 'boundary.editChange.noPr',
                    defaultMessage: 'No linked PR',
                  })}
                </Muted>
              ) : (
                <ul className='space-y-1'>
                  {prs.map(pr => (
                    <li
                      key={`${pr.repo}#${pr.number}`}
                      className='flex flex-wrap gap-x-2'
                    >
                      <a
                        href={pr.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-1 text-primary hover:underline'
                      >
                        #{pr.number} {pr.title}
                        <ExternalLink className='size-3' aria-hidden />
                      </a>
                      <span className='text-caption text-muted-foreground'>
                        {pr.state} ·{' '}
                        <span className='font-mono'>{pr.headBranch}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {view?.editChange?.prFileUrl && (
                <a
                  href={view.editChange.prFileUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 text-caption text-primary hover:underline'
                >
                  {intl.formatMessage({
                    id: 'crossingQueue.viewFileDiff',
                    defaultMessage: 'View this file in the PR',
                  })}
                  <ExternalLink className='size-3' aria-hidden />
                </a>
              )}
            </div>
          )}
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.why',
            defaultMessage: 'Why it fired',
          })}
          section={context?.crossing}
          onRetry={onRetry}
        >
          {({ view: v }) => (
            <div className='space-y-2'>
              {v.policyRuleText && (
                <LabeledText
                  label={intl.formatMessage({
                    id: 'boundary.field.rule',
                    defaultMessage: 'Rule',
                  })}
                  text={v.policyRuleText}
                />
              )}
              <LabeledText
                label={intl.formatMessage({
                  id: 'boundary.field.triggeredBy',
                  defaultMessage: 'Triggered by',
                })}
                text={v.detail}
                mono
              />
              {v.editChange && (
                <EditChangeBlock change={v.editChange} intl={intl} />
              )}
              {v.systemExplanation && (
                <LabeledText
                  label={intl.formatMessage({
                    id: 'crossingQueue.whyFlagged',
                    defaultMessage: 'Why flagged',
                  })}
                  text={v.systemExplanation}
                />
              )}
              {v.triageProbability != null && (
                <Muted>
                  {intl.formatMessage(
                    {
                      id: 'boundary.panel.triageScore',
                      defaultMessage:
                        'AI triage scored P(legit) {probability}.',
                    },
                    { probability: v.triageProbability.toFixed(2) }
                  )}
                </Muted>
              )}
            </div>
          )}
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.agent',
            defaultMessage: "Agent's side",
          })}
          section={context?.crossing}
          hint={view ? String(view.explanations.length) : undefined}
          onRetry={onRetry}
        >
          {({ view: v }) => (
            <div className='space-y-2'>
              <p className='text-caption font-semibold uppercase text-muted-foreground'>
                {intl.formatMessage({
                  id: 'boundary.panel.explanations.label',
                  defaultMessage: 'Agent self-report · unverified',
                })}
              </p>
              {v.explanations.length === 0 ? (
                <Muted>
                  {intl.formatMessage({
                    id: 'crossingQueue.noExplanations',
                    defaultMessage: 'The agent left no explanation.',
                  })}
                </Muted>
              ) : (
                <ul className='space-y-1'>
                  {v.explanations.map(e => (
                    <li key={e.id} className='whitespace-pre-wrap break-words'>
                      {e.note}
                    </li>
                  ))}
                </ul>
              )}
              <AttributionLine
                attribution={v.attribution}
                ownerName={
                  v.attribution.workspaceMemberId
                    ? memberName(v.attribution.workspaceMemberId)
                    : null
                }
                intl={intl}
              />
            </div>
          )}
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.history',
            defaultMessage: 'History on this task',
          })}
          section={context?.history}
          hint={
            context?.history.status === 'ok'
              ? String(context.history.data.others.length)
              : undefined
          }
          onRetry={onRetry}
        >
          {h => (
            <div className='space-y-2'>
              {h.sameCategoryRulings.map(r => (
                <p key={r.id} className='text-caption'>
                  {intl.formatMessage(
                    {
                      id: 'crossingQueue.similarRuling',
                      defaultMessage:
                        'A similar crossing ({ref}) was ruled {ruling} by {name}.',
                    },
                    {
                      ref: r.ref,
                      ruling: boundaryDispositionLabel(r.disposition!, intl),
                      name: memberName(r.dispositionedById),
                    }
                  )}
                </p>
              ))}
              <Muted>
                {intl.formatMessage(
                  {
                    id: 'crossingQueue.otherCrossings',
                    defaultMessage:
                      '{total, plural, =0 {No other crossings on this task.} one {# other crossing on this task} other {# other crossings on this task}}{open, plural, =0 {} other {, # still open}}',
                  },
                  { total: h.others.length, open: h.otherOpen }
                )}
              </Muted>
            </div>
          )}
        </ContextSection>

        <ContextSection
          title={intl.formatMessage({
            id: 'crossingQueue.section.tags',
            defaultMessage: 'Tags',
          })}
          section={context?.tags}
          hint={
            context?.tags.status === 'ok'
              ? String(context.tags.data.length)
              : undefined
          }
          onRetry={onRetry}
        >
          {tags =>
            tags.length === 0 ? (
              <Muted>
                {intl.formatMessage({
                  id: 'crossingQueue.noTags',
                  defaultMessage: 'Nobody has been tagged on this crossing.',
                })}
              </Muted>
            ) : (
              <ul className='space-y-1 text-caption'>
                {tags.map(t => (
                  <li key={`${t.createdAt}-${t.taggedMemberId}`}>
                    {intl.formatMessage(
                      {
                        id: 'crossingQueue.tagLine',
                        defaultMessage: '{by} tagged {to}',
                      },
                      {
                        by: memberName(t.taggedById),
                        to: memberName(t.taggedMemberId),
                      }
                    )}
                    {t.message ? `: ${t.message}` : ''}
                  </li>
                ))}
              </ul>
            )
          }
        </ContextSection>
      </div>

      <div className='mt-4 flex justify-end'>
        <a
          href={taskHref}
          className='inline-flex items-center gap-1 text-caption text-primary hover:underline'
        >
          {intl.formatMessage({
            id: 'crossingQueue.openInTask',
            defaultMessage: 'Open in task',
          })}
          <ExternalLink className='size-3' aria-hidden />
        </a>
      </div>

      <div className='mt-3 border-t border-border pt-4'>{actions}</div>
    </article>
  )
}

function FaceRow({
  label,
  value,
  loading,
  failed,
}: {
  label: string
  value: string
  loading: boolean
  failed: boolean
}) {
  const intl = useIntl()
  return (
    <div className='mt-2 flex gap-2 text-caption'>
      <Info
        className='mt-0.5 size-3.5 shrink-0 text-muted-foreground'
        aria-hidden
      />
      <div className='min-w-0'>
        <span className='font-semibold text-foreground'>{label}</span>{' '}
        {loading ? (
          <span className='text-muted-foreground'>
            {intl.formatMessage({
              id: 'crossingQueue.section.loading',
              defaultMessage: 'Loading…',
            })}
          </span>
        ) : failed ? (
          <span className='text-danger-text'>
            {intl.formatMessage({
              id: 'crossingQueue.section.failedShort',
              defaultMessage: "Couldn't load",
            })}
          </span>
        ) : (
          <span className='whitespace-pre-wrap break-words text-muted-foreground'>
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

function LabeledText({
  label,
  text,
  mono,
}: {
  label: string
  text: string
  mono?: boolean
}) {
  return (
    <div>
      <p className='text-caption font-semibold text-muted-foreground'>
        {label}
      </p>
      <p
        className={`whitespace-pre-wrap break-words ${mono ? 'font-mono text-caption' : ''}`}
      >
        {text}
      </p>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className='text-caption text-muted-foreground'>{children}</p>
}
