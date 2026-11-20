import { NextRequest, NextResponse } from 'next/server'
import { requireIdentity } from '@/lib/auth'
import {
  resolveProjectRef,
  serviceErrorResponse,
  zodError,
} from '@/lib/api/helpers'
import { judgmentCaller } from '@/lib/api/judgment-caller'
import { judgmentReadService } from '@/lib/services/judgment/judgment-read.service'
import { judgmentService } from '@/lib/services/judgment/judgment.service'
import {
  listJudgmentsQuerySchema,
  proposeJudgmentSchema,
} from '@/lib/validation/judgment'

export const runtime = 'nodejs'

/**
 * GET /api/judgments — the workspace's team memory entries (LUM-1356).
 * `view=active` (default) lists entries with an approved revision in effect,
 * `view=all` every entry, `view=inbox` the candidates waiting for review
 * (conflicts first). Browser session or CLI bearer; any member may read.
 */
export async function GET(request: NextRequest) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const parsed = listJudgmentsQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    )
    if (!parsed.success) return zodError(parsed)
    const { view, limit, cursor, projectRef } = parsed.data
    if (view === 'inbox') {
      return NextResponse.json(await judgmentReadService.inbox(identity, limit))
    }
    const projectId = projectRef
      ? await resolveProjectRef(identity.workspaceId, projectRef)
      : parsed.data.projectId
    return NextResponse.json(
      await judgmentReadService.list(identity, {
        view,
        projectId,
        limit,
        cursor,
      })
    )
  } catch (error) {
    return serviceErrorResponse(error, '[GET /api/judgments]')
  }
}

/**
 * POST /api/judgments — propose a new team memory entry. The result is a
 * candidate waiting for a human review; nothing an agent receives changes.
 * Browser session or CLI bearer. A human origin is kept only for a browser
 * session — the service stores an agent origin for an API key.
 */
export async function POST(request: NextRequest) {
  const identity = await requireIdentity(request)
  if (identity instanceof NextResponse) return identity
  try {
    const parsed = proposeJudgmentSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsed.success) return zodError(parsed)
    const { name, content, projectRef } = parsed.data
    const projectId = projectRef
      ? await resolveProjectRef(identity.workspaceId, projectRef)
      : parsed.data.projectId
    const result = await judgmentService.propose(judgmentCaller(identity), {
      name,
      projectId,
      content,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return serviceErrorResponse(error, '[POST /api/judgments]')
  }
}
