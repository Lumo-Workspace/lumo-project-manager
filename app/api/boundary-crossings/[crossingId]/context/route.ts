import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse } from '@/lib/api/helpers'
import { crossingQueueService } from '@/lib/services/crossing-queue.service'

export const runtime = 'nodejs'

type Params = { params: Promise<{ crossingId: string }> }

/**
 * GET /api/boundary-crossings/[crossingId]/context — LUM-1336: everything an
 * index card shows about one crossing and its task, section by section. A
 * section whose read failed comes back `{ status: 'error' }`, never empty.
 * 403 unless the caller is the task's assignee or a workspace OWNER.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity

  const { crossingId } = await params
  try {
    const context = await crossingQueueService.getCardContext(
      { memberId: identity.memberId, workspaceId: identity.workspaceId },
      crossingId
    )
    return NextResponse.json(context)
  } catch (error) {
    return serviceErrorResponse(error, '[boundary-crossings/context]')
  }
}
