'use client'

import { useIntl } from 'react-intl'
import { Badge } from '@/components/ui/badge'
import type { JudgmentRevisionView } from '@/lib/api-client/judgments'
import { ContentSignalsBadge } from '../../ContentSignalsBadge'

interface JudgmentRevisionBodyProps {
  revision: JudgmentRevisionView
  /** Member id → display name, for who judged and who recorded. */
  memberNames: ReadonlyMap<string, string>
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3'>
      <dt className='text-caption text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 whitespace-pre-wrap break-words text-body text-foreground'>
        {children}
      </dd>
    </div>
  )
}

/**
 * LUM-1356 — the content of one exact revision. Everything here was written
 * by a member or an agent and is shown as plain text: no markup is rendered.
 */
export function JudgmentRevisionBody({
  revision,
  memberNames,
}: JudgmentRevisionBodyProps) {
  const intl = useIntl()
  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values)
  const member = (id: string | null) =>
    id ? (memberNames.get(id) ?? t('teamMemory.provenance.formerMember')) : null

  const applies: string[] = []
  if (revision.scopeRepo) applies.push(revision.scopeRepo)
  if (revision.scopePathGlobs?.length)
    applies.push(revision.scopePathGlobs.join(', '))
  for (const condition of revision.when)
    applies.push(`${condition.field} = ${String(condition.equals)}`)

  const judgedBy = member(revision.judgedByMemberId)
  const recordedBy = member(revision.recordedByMemberId)

  return (
    <dl className='grid gap-3' data-testid='judgment-revision-body'>
      <Field label={t('teamMemory.field.statement')}>
        {revision.statement}
      </Field>
      <Field label={t('teamMemory.field.rationale')}>
        {revision.rationale ?? (
          <span className='text-muted-foreground'>
            {t('teamMemory.field.rationale.missing')}
          </span>
        )}
      </Field>
      <Field label={t('teamMemory.field.kind')}>
        {t(`teamMemory.kind.${revision.kind}`)}
        {revision.polarity &&
          ` · ${t(`teamMemory.polarity.${revision.polarity}`)}`}
      </Field>
      <Field label={t('teamMemory.field.applies')}>
        {applies.length > 0 ? (
          applies.join(' · ')
        ) : (
          <span className='text-muted-foreground'>
            {t('teamMemory.field.applies.unconditional')}
          </span>
        )}
      </Field>
      {(revision.validFrom || revision.validUntil) && (
        <Field label={t('teamMemory.field.validity')}>
          {[
            revision.validFrom &&
              t('teamMemory.field.validity.from', {
                date: intl.formatDate(revision.validFrom, {
                  dateStyle: 'medium',
                  timeZone: 'UTC',
                }),
              }),
            revision.validUntil &&
              t('teamMemory.field.validity.until', {
                date: intl.formatDate(revision.validUntil, {
                  dateStyle: 'medium',
                  timeZone: 'UTC',
                }),
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Field>
      )}
      <Field label={t('teamMemory.field.limits')}>
        <ul className='list-disc pl-4'>
          {revision.limits.map(limit => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </Field>
      {revision.assertionKey && (
        <Field label={t('teamMemory.field.assertion')}>
          <code className='font-mono text-caption'>
            {revision.assertionKey} = {String(revision.assertionValue)}
          </code>
        </Field>
      )}
      <Field label={t('teamMemory.field.origin')}>
        <span className='flex flex-wrap items-center gap-2'>
          <Badge
            variant={
              revision.origin === 'UNKNOWN' ? 'warning' : 'outline-muted'
            }
            size='xs'
            shape='square'
          >
            {t(`teamMemory.origin.${revision.origin}`)}
          </Badge>
          {judgedBy && (
            <span>
              {t('teamMemory.provenance.judgedBy', { name: judgedBy })}
            </span>
          )}
          {revision.judgedByLabel && <span>{revision.judgedByLabel}</span>}
        </span>
      </Field>
      <Field label={t('teamMemory.field.recorded')}>
        {t(`teamMemory.channel.${revision.recordedVia}`)}
        {recordedBy && ` · ${recordedBy}`}
        {revision.sourceTaskId && ` · ${revision.sourceTaskId}`}
      </Field>
      {revision.sourceRefs.length > 0 && (
        <Field label={t('teamMemory.field.sources')}>
          <ul className='list-disc pl-4'>
            {revision.sourceRefs.map(ref => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        </Field>
      )}
      {revision.evidence.length > 0 && (
        <Field label={t('teamMemory.field.evidence')}>
          <ul className='list-disc pl-4'>
            {revision.evidence.map(item => (
              <li key={`${item.role}:${item.reference}`}>
                {t(`teamMemory.evidence.${item.role}`)}: {item.summary} (
                {item.reference})
              </li>
            ))}
          </ul>
        </Field>
      )}
      {revision.context && (
        <Field label={t('teamMemory.field.context')}>
          {revision.context.situation}
        </Field>
      )}
      {revision.alternatives && revision.alternatives.length > 0 && (
        <Field label={t('teamMemory.field.alternatives')}>
          <ul className='list-disc pl-4'>
            {revision.alternatives.map(item => (
              <li key={item.option}>
                {item.option}
                {item.whyNot && ` — ${item.whyNot}`}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {revision.expectedOutcome && (
        <Field label={t('teamMemory.field.expectedOutcome')}>
          {revision.expectedOutcome.description}
        </Field>
      )}
      <Field label={t('teamMemory.field.signals')}>
        {revision.contentSignals ? (
          <ContentSignalsBadge signals={revision.contentSignals} />
        ) : (
          <span className='text-muted-foreground'>
            {t('teamMemory.field.signals.none')}
          </span>
        )}
      </Field>
      <Field label={t('teamMemory.field.digest')}>
        <code className='break-all font-mono text-caption text-muted-foreground'>
          {revision.digest}
        </code>
      </Field>
    </dl>
  )
}
