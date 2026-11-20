import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireIdentity } from '@/lib/auth'
import { requireHumanWebSession } from '@/lib/auth/human-web-session'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { judgmentCaller } from '@/lib/api/judgment-caller'
import { judgmentService } from '@/lib/services/judgment/judgment.service'
import {
  judgmentReviewActions,
  reviewJudgmentRevisionSchema,
} from '@/lib/validation/judgment'

export const runtime = 'nodejs'

type Params = { params: Promise<{ revisionId: string; action: string }> }

const actionSchema = z.enum(judgmentReviewActions)

/**
 * POST /api/judgment-revisions/[revisionId]/[action] — the four review
 * actions on one exact revision: `approve`, `reject`, `request-changes`,
 * `withdraw`. Body: `{ digest, reason? }` — the digest of the revision the
 * reviewer looked at; a reason is required for everything but approve.
 *
 * Human-only: an API key (the agent / CLI path) is refused with 403 before
 * anything is read or written.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity

  const webOnly = requireHumanWebSession(
    identity,
    'Team memory can only be reviewed from a human-authenticated browser session — the agent/CLI path is closed by design'
  )
  if (webOnly) return webOnly

  try {
    const { revisionId, action: rawAction } = await params
    const action = actionSchema.safeParse(rawAction)
    if (!action.success) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const parsed = reviewJudgmentRevisionSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsed.success) return zodError(parsed)

    const caller = judgmentCaller(identity)
    const input = { revisionId, ...parsed.data }
    const handlers = {
      approve: judgmentService.approve,
      reject: judgmentService.reject,
      'request-changes': judgmentService.requestChanges,
      withdraw: judgmentService.withdraw,
    } as const
    const revision = await handlers[action.data](caller, input)
    return NextResponse.json({ revision })
  } catch (error) {
    return serviceErrorResponse(
      error,
      '[POST /api/judgment-revisions/[revisionId]/[action]]'
    )
  }
}
