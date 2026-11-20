import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import { serviceErrorResponse } from '@/lib/api/helpers'
import { judgmentReadService } from '@/lib/services/judgment/judgment-read.service'

export const runtime = 'nodejs'

type Params = { params: Promise<{ revisionId: string }> }

/**
 * GET /api/judgment-revisions/[revisionId] — one exact revision with its
 * entry, its conflicts and what blocks its approval. What the review page
 * loads. Another workspace's revision is a 404.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const { revisionId } = await params
    return NextResponse.json(
      await judgmentReadService.showRevision(identity, revisionId)
    )
  } catch (error) {
    return serviceErrorResponse(
      error,
      '[GET /api/judgment-revisions/[revisionId]]'
    )
  }
}
