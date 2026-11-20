import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse } from '@/lib/api/helpers'
import { judgmentReadService } from '@/lib/services/judgment/judgment-read.service'

export const runtime = 'nodejs'

type Params = { params: Promise<{ judgmentId: string }> }

/**
 * GET /api/judgments/[judgmentId] — one team memory entry, by id or name:
 * the revision in effect and the candidates waiting for review. `?history=1`
 * adds every revision and the governance events. Another workspace's entry
 * is a 404.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const { judgmentId } = await params
    const history = request.nextUrl.searchParams.get('history') === '1'
    return NextResponse.json(
      await judgmentReadService.show(identity, judgmentId, { history })
    )
  } catch (error) {
    return serviceErrorResponse(error, '[GET /api/judgments/[judgmentId]]')
  }
}
