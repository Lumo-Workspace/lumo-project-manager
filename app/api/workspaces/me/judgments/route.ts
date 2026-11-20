import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth/identity'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { memberAuditContext } from '@/lib/api/audit-context'
import { judgmentSettingsService } from '@/lib/services/judgment/judgment-settings.service'
import { judgmentSettingsSchema } from '@/lib/validation/judgment'

/**
 * GET /api/workspaces/me/judgments — the team memory review settings
 * (LUM-1356): the mode, who may review, whether the platform has opened the
 * feature for this workspace and whether the caller may change it. Any member
 * may read. Browser session or CLI bearer.
 */
export async function GET(request: NextRequest) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const settings = await judgmentSettingsService.get(identity)
    return NextResponse.json(settings, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return serviceErrorResponse(error, '[GET /api/workspaces/me/judgments]')
  }
}

/**
 * PATCH /api/workspaces/me/judgments — `{ mode?, admission? }`. OWNER only.
 * Returns the settings as GET does.
 */
export async function PATCH(request: NextRequest) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const parsed = judgmentSettingsSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsed.success) return zodError(parsed)
    const settings = await judgmentSettingsService.update(
      identity,
      parsed.data,
      memberAuditContext(request.headers, identity, identity.source)
    )
    return NextResponse.json(settings)
  } catch (error) {
    return serviceErrorResponse(error, '[PATCH /api/workspaces/me/judgments]')
  }
}
