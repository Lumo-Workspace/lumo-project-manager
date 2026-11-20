import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/api/cron-auth'
import { judgmentService } from '@/lib/services/judgment/judgment.service'

/**
 * GET /api/cron/expire-judgment-candidates
 * Daily Vercel Cron (LUM-1356). Closes team memory candidates nobody
 * reviewed for 30 days (state EXPIRED, never deleted; they can be proposed
 * again). A candidate that is part of an assertion conflict is left for a
 * person to resolve.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized
  return NextResponse.json(await judgmentService.expireStaleCandidates())
}
