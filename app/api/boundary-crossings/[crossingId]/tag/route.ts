import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { crossingQueueService } from '@/lib/services/crossing-queue.service'
import { tagCrossingSchema } from '@/lib/validation/crossing-queue'

export const runtime = 'nodejs'

type Params = { params: Promise<{ crossingId: string }> }

/**
 * POST /api/boundary-crossings/[crossingId]/tag — LUM-1336: hand an index
 * card to a teammate who may rule on it (the task's assignee or a workspace
 * OWNER), with an in-app notification. A request, never a ruling — the
 * crossing stays OPEN. Browser sessions only: tagging is a web UI action.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity

  if (identity.source !== 'clerk') {
    return NextResponse.json(
      { error: 'Tagging a boundary crossing is a web UI action' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = tagCrossingSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)

  const { crossingId } = await params
  try {
    const tag = await crossingQueueService.tag(
      { memberId: identity.memberId, workspaceId: identity.workspaceId },
      crossingId,
      { memberId: parsed.data.memberId, message: parsed.data.message ?? null }
    )
    return NextResponse.json({ tag }, { status: 201 })
  } catch (error) {
    return serviceErrorResponse(error, '[boundary-crossings/tag]')
  }
}
