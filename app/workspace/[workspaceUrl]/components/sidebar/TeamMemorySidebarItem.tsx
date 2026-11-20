'use client'

import Link from 'next/link'
import { BookOpenCheck } from 'lucide-react'
import { useIntl } from 'react-intl'
import { Badge } from '@/components/ui/badge'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Page } from '../../types'
import { useJudgmentInbox, useJudgmentSettings } from '../../hooks/useJudgments'

interface TeamMemorySidebarItemProps {
  workspaceUrl: string
  isActive: boolean
  onNavigate: (page: Page) => void
}

/**
 * LUM-1356: the sidebar entry for Team memory, with a badge of the candidates
 * waiting for review. Renders nothing while review is off for the workspace,
 * so a workspace that has not turned it on sees no change.
 */
export function TeamMemorySidebarItem({
  workspaceUrl,
  isActive,
  onNavigate,
}: TeamMemorySidebarItemProps) {
  const intl = useIntl()
  const { enabled } = useJudgmentSettings()
  const { items } = useJudgmentInbox(enabled)
  if (!enabled) return null

  const label = intl.formatMessage({ id: 'sidebar.teamMemory' })
  const waiting = items.length

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link
          href={`/workspace/${workspaceUrl}/team-memory`}
          onClick={e => {
            e.preventDefault()
            onNavigate('team-memory')
          }}
        >
          <BookOpenCheck />
          <span className='flex-1'>{label}</span>
          {waiting > 0 && (
            <Badge
              className='ml-auto h-4 min-w-4 justify-center rounded-full bg-muted-foreground px-1 text-caption font-semibold text-white hover:bg-muted-foreground'
              aria-label={intl.formatMessage(
                { id: 'sidebar.teamMemoryWaiting' },
                { count: waiting }
              )}
            >
              {waiting > 99 ? '99+' : waiting}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
