import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { memberAuditContext } from '@/lib/api/audit-context'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { crossingQueueService } from '@/lib/services/crossing-queue.service'
import { ruleCrossingSchema } from '@/lib/validation/crossing-queue'

export const runtime = 'nodejs'

type Params = { params: Promise<{ crossingId: string }> }

/**
 * POST /api/boundary-crossings/[crossingId]/rule — LUM-1336: a human rules on
 * an index card in the Boundary Crossings tab. Same write as the Record tab
 * (channel WEB), behind two extra refusals: 403 unless the caller is the
 * task's assignee or a workspace OWNER, 409 when the crossing was ruled or
 * changed since the card was read.
 *
 * RED LINE (as the Record tab's route): a bearer identity — the agent/CLI
 * path — is refused 403 before the body is parsed. A ruling here is always a
 * person at the web UI.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity

  if (identity.source !== 'clerk') {
    return NextResponse.json(
      {
        error:
          'A boundary crossing can only be ruled on from a human-authenticated browser session',
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = ruleCrossingSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)

  const { crossingId } = await params
  try {
    const outcome = await crossingQueueService.rule(
      { memberId: identity.memberId, workspaceId: identity.workspaceId },
      crossingId,
      {
        disposition: parsed.data.disposition,
        note: parsed.data.dispositionNote ?? null,
        stateHash: parsed.data.stateHash,
      },
      {
        actorMemberId: identity.memberId,
        actorClerkId: identity.clerkId,
        audit: {
          workspaceId: identity.workspaceId,
          context: memberAuditContext(
            request.headers,
            { clerkId: identity.clerkId, memberId: identity.memberId },
            identity.source
          ),
        },
      }
    )
    return NextResponse.json(outcome)
  } catch (error) {
    return serviceErrorResponse(error, '[boundary-crossings/rule]')
  }
}
