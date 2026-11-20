'use client'

import { useState } from 'react'
import { useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  JudgmentRevisionDraft,
  JudgmentRevisionView,
} from '@/lib/api-client/judgments'
import { JUDGMENT_KINDS, JUDGMENT_ORIGINS } from '@/lib/validation/judgment'

interface JudgmentReviseFormProps {
  /** The revision being corrected; its other fields carry over unchanged. */
  source: JudgmentRevisionView
  saving: boolean
  onCancel: () => void
  onSubmit: (draft: JudgmentRevisionDraft) => void
}

/**
 * LUM-1356 — a reviewer's correction is a new revision. This form edits the
 * fields a review most often has to fix — what it says, why, its kind, where
 * it stops applying and who judged it — and proposes the result as the next
 * revision, which is then reviewed like any other.
 */
export function JudgmentReviseForm({
  source,
  saving,
  onCancel,
  onSubmit,
}: JudgmentReviseFormProps) {
  const intl = useIntl()
  const t = (id: string) => intl.formatMessage({ id })
  const [description, setDescription] = useState(source.description)
  const [statement, setStatement] = useState(source.statement)
  const [rationale, setRationale] = useState(source.rationale ?? '')
  const [kind, setKind] = useState(source.kind)
  const [origin, setOrigin] = useState(source.origin)
  const [limits, setLimits] = useState(source.limits.join('\n'))

  const limitLines = limits
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const valid =
    description.trim().length > 0 &&
    statement.trim().length > 0 &&
    limitLines.length > 0

  return (
    <form
      data-testid='judgment-revise-form'
      className='grid gap-4'
      onSubmit={event => {
        event.preventDefault()
        if (!valid) return
        onSubmit({
          description: description.trim(),
          statement: statement.trim(),
          rationale: rationale.trim() ? rationale.trim() : null,
          kind,
          origin,
          limits: limitLines,
        })
      }}
    >
      <p className='text-caption text-muted-foreground'>
        {t('teamMemory.revise.intro')}
      </p>
      <div className='grid gap-1.5'>
        <Label htmlFor='judgment-description'>
          {t('teamMemory.field.description')}
        </Label>
        <Input
          id='judgment-description'
          value={description}
          maxLength={200}
          onChange={event => setDescription(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='judgment-statement'>
          {t('teamMemory.field.statement')}
        </Label>
        <Textarea
          id='judgment-statement'
          rows={4}
          value={statement}
          maxLength={4000}
          onChange={event => setStatement(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='judgment-rationale'>
          {t('teamMemory.field.rationale')}
        </Label>
        <Textarea
          id='judgment-rationale'
          rows={3}
          value={rationale}
          maxLength={4000}
          onChange={event => setRationale(event.target.value)}
        />
        <p className='text-caption text-muted-foreground'>
          {t('teamMemory.revise.rationaleHint')}
        </p>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='grid gap-1.5'>
          <Label htmlFor='judgment-kind'>{t('teamMemory.field.kind')}</Label>
          <Select
            value={kind}
            onValueChange={value => setKind(value as typeof kind)}
          >
            <SelectTrigger id='judgment-kind'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUDGMENT_KINDS.map(value => (
                <SelectItem key={value} value={value}>
                  {t(`teamMemory.kind.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='judgment-origin'>
            {t('teamMemory.field.origin')}
          </Label>
          <Select
            value={origin}
            onValueChange={value => setOrigin(value as typeof origin)}
          >
            <SelectTrigger id='judgment-origin'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUDGMENT_ORIGINS.map(value => (
                <SelectItem key={value} value={value}>
                  {t(`teamMemory.origin.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='judgment-limits'>{t('teamMemory.field.limits')}</Label>
        <Textarea
          id='judgment-limits'
          rows={3}
          value={limits}
          onChange={event => setLimits(event.target.value)}
        />
        <p className='text-caption text-muted-foreground'>
          {t('teamMemory.revise.limitsHint')}
        </p>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button type='submit' disabled={saving || !valid}>
          {t('teamMemory.revise.submit')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          disabled={saving}
          onClick={onCancel}
        >
          {t('teamMemory.action.cancel')}
        </Button>
      </div>
    </form>
  )
}
