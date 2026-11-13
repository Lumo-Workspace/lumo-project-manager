import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { crossingQueueService } from '@/lib/services/crossing-queue.service'
import { crossingQueueQuerySchema } from '@/lib/validation/crossing-queue'

export const runtime = 'nodejs'

/**
 * GET /api/boundary-crossings/queue?filter=all|tagged|blocking&projectId= —
 * LUM-1336: the caller's index-card queue of OPEN task crossings, in deal
 * order. Only crossings the caller may rule on (the task's assignee, or any
 * crossing for a workspace OWNER). Read-only.
 */
export async function GET(request: NextRequest) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity

  const params = request.nextUrl.searchParams
  const parsed = crossingQueueQuerySchema.safeParse({
    filter: params.get('filter') ?? undefined,
    projectId: params.get('projectId') ?? undefined,
  })
  if (!parsed.success) return zodError(parsed)

  try {
    const queue = await crossingQueueService.getQueue(
      { memberId: identity.memberId, workspaceId: identity.workspaceId },
      { filter: parsed.data.filter, projectId: parsed.data.projectId ?? null }
    )
    return NextResponse.json(queue)
  } catch (error) {
    return serviceErrorResponse(error, '[boundary-crossings/queue]')
  }
}
