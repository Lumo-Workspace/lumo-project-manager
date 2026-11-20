import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse, zodError } from '@/lib/api/helpers'
import { judgmentCaller } from '@/lib/api/judgment-caller'
import { judgmentService } from '@/lib/services/judgment/judgment.service'
import { reviseJudgmentSchema } from '@/lib/validation/judgment'

export const runtime = 'nodejs'

type Params = { params: Promise<{ judgmentId: string }> }

/**
 * POST /api/judgments/[judgmentId]/revisions — propose a revision of an
 * entry. `baseRevisionId` must be the revision in effect right now (null when
 * there is none); otherwise 409. The revision in effect stays in effect until
 * a human approves the candidate.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const parsed = reviseJudgmentSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsed.success) return zodError(parsed)
    const { judgmentId } = await params
    const result = await judgmentService.revise(judgmentCaller(identity), {
      judgmentId,
      ...parsed.data,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return serviceErrorResponse(
      error,
      '[POST /api/judgments/[judgmentId]/revisions]'
    )
  }
}
