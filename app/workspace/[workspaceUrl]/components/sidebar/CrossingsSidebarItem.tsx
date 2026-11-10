'use client'

import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useIntl } from 'react-intl'
import { Badge } from '@/components/ui/badge'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Page } from '../../types'
import { useCrossingQueueBadge } from '../../hooks/useCrossingQueue'

interface CrossingsSidebarItemProps {
  workspaceUrl: string
  isActive: boolean
  onNavigate: (page: Page) => void
}

/**
 * LUM-1336: the sidebar entry for the Boundary Crossings tab, with a badge of
 * the viewer's blocking open crossings. Fetches its own count so every page
 * that renders the sidebar gets it.
 */
export function CrossingsSidebarItem({
  workspaceUrl,
  isActive,
  onNavigate,
}: CrossingsSidebarItemProps) {
  const intl = useIntl()
  const blocking = useCrossingQueueBadge()
  const label = intl.formatMessage({
    id: 'sidebar.boundaryCrossings',
    defaultMessage: 'Boundary Crossings',
  })

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link
          href={`/workspace/${workspaceUrl}/boundary-crossings`}
          onClick={e => {
            e.preventDefault()
            onNavigate('boundary-crossings')
          }}
        >
          <ShieldAlert />
          <span className='flex-1'>{label}</span>
          {blocking > 0 && (
            <Badge
              className='ml-auto h-4 min-w-4 justify-center rounded-full bg-danger px-1 text-caption font-semibold text-white hover:bg-danger'
              aria-label={intl.formatMessage(
                {
                  id: 'sidebar.boundaryCrossingsBlocking',
                  defaultMessage:
                    '{count, plural, one {# crossing blocks} other {# crossings block}} Done',
                },
                { count: blocking }
              )}
            >
              {blocking > 99 ? '99+' : blocking}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
