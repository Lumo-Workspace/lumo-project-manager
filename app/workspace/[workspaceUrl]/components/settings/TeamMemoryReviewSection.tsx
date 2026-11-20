'use client'

import { useState } from 'react'
import { useIntl } from 'react-intl'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { judgmentsClient } from '@/lib/api-client/judgments'
import { queryKeys } from '@/lib/query/keys'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useJudgmentSettings } from '../../hooks/useJudgments'
import { SettingsSection } from './SettingsSection'

type Row = 'review' | 'ownerOnly'

/**
 * LUM-1356 — the OWNER switches for team memory review: whether candidates
 * can be proposed and reviewed at all, and whether only owners may review.
 * Renders nothing until the platform has opened the feature for this
 * workspace, so other workspaces see no new setting.
 */
export function TeamMemoryReviewSection() {
  const intl = useIntl()
  const queryClient = useQueryClient()
  const { settings } = useJudgmentSettings()
  const [saving, setSaving] = useState<Row | null>(null)
  if (!settings?.available) return null

  const values: Record<Row, boolean> = {
    review: settings.mode !== 'OFF',
    ownerOnly: settings.admission === 'OWNER_ONLY',
  }

  const handleToggle = async (row: Row, next: boolean) => {
    setSaving(row)
    try {
      const updated = await judgmentsClient.updateSettings(
        row === 'review'
          ? { mode: next ? 'REVIEW' : 'OFF' }
          : { admission: next ? 'OWNER_ONLY' : 'ANY_MEMBER' }
      )
      queryClient.setQueryData(queryKeys.judgmentSettings(), updated)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.judgmentsAll(),
      })
      toast.success(
        intl.formatMessage({ id: 'workspaceSettings.teamMemory.saved' })
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : intl.formatMessage({
              id: 'workspaceSettings.teamMemory.saveFailed',
            })
      )
    } finally {
      setSaving(null)
    }
  }

  const rows: Row[] = ['review', 'ownerOnly']
  return (
    <SettingsSection
      id='team-memory-review'
      title={intl.formatMessage({ id: 'workspaceSettings.teamMemory.title' })}
    >
      <div
        data-testid='team-memory-review-card'
        className='rounded-lg border border-border overflow-hidden'
      >
        <p className='px-5 py-3 border-b border-border text-caption text-muted-foreground'>
          {intl.formatMessage({
            id: 'workspaceSettings.teamMemory.description',
          })}
        </p>
        {rows.map((row, i) => (
          <div
            key={row}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              i < rows.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <div className='min-w-0'>
              <Label
                htmlFor={`team-memory-${row}`}
                className='text-body-strong text-foreground'
              >
                {intl.formatMessage({
                  id: `workspaceSettings.teamMemory.${row}.label`,
                })}
              </Label>
              <p className='text-caption text-muted-foreground mt-0.5'>
                {intl.formatMessage({
                  id: `workspaceSettings.teamMemory.${row}.description`,
                })}
              </p>
            </div>
            <Switch
              id={`team-memory-${row}`}
              data-testid={`team-memory-${row}`}
              checked={values[row]}
              disabled={saving !== null || !settings.canEdit}
              onCheckedChange={next => void handleToggle(row, next)}
            />
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}
