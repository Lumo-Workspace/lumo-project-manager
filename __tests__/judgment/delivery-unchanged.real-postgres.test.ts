/**
 * @jest-environment node
 *
 * LUM-1356 — phase 1 changes nothing an agent receives. Against a real
 * Postgres: the sync bundle and the session-start sections of a project are
 * byte-for-byte the same with the workspace OFF and with it in REVIEW holding
 * an approved judgment, a pending candidate and a withdrawn one.
 */
import { readFileSync } from 'fs'
import path from 'path'
import { createPgliteHarness } from '../../scripts/test-support/pglite-harness'

const { PrismaClient } =
  jest.requireActual<typeof import('@prisma/client')>('@prisma/client')
const harness = createPgliteHarness(PrismaClient)

jest.mock('@/lib/db/prisma', () => ({
  get prisma() {
    return harness.prisma
  },
}))
// task.service pulls in ESM-only GitHub packages; the delivery code only uses
// it to resolve identifiers, which this test does not need.
jest.mock('@/lib/services/task.service', () => ({
  taskService: { resolveIdentifier: jest.fn() },
}))
jest.mock('@/lib/services/document.service', () => ({
  scheduleDocumentSummary: jest.fn(),
}))

import { memorySyncService } from '@/lib/services/memory/memory-sync.service'
import { taskContextService } from '@/lib/services/task-context.service'
import { judgmentService } from '@/lib/services/judgment/judgment.service'
import { judgmentContentSchema } from '@/lib/validation/judgment'

jest.setTimeout(180_000)

const WS = 'ws-delivery'
const PROJECT = 'proj-delivery'
const TASK = 'task-delivery'
const SYNCED_AT = '2026-11-19T00:00:00.000Z'
const ORIGINAL_ROLLOUT = process.env.LUMO_JUDGMENT_WORKSPACES

const db = () => harness.prisma!

async function delivered() {
  const [bundle, sections] = await Promise.all([
    memorySyncService.buildBundle(PROJECT, { syncedAtIso: SYNCED_AT }),
    taskContextService.buildSessionStartSections(TASK),
  ])
  return JSON.stringify({ bundle, sections })
}

beforeAll(async () => {
  process.env.LUMO_JUDGMENT_WORKSPACES = '*'
  await harness.start()
  await harness.insert('workspaces', { id: WS, name: WS, slug: WS })
  await harness.insert('workspace_members', {
    id: 'mem-delivery',
    workspaceId: WS,
    clerkId: 'user-delivery',
    role: 'OWNER',
  })
  await harness.insert('teams', {
    id: 'team-delivery',
    workspaceId: WS,
    name: 'Delivery',
    identifier: 'DLV',
  })
  await harness.insert('projects', {
    id: PROJECT,
    workspaceId: WS,
    teamId: 'team-delivery',
    name: 'Delivery',
    createdByMemberId: 'mem-delivery',
  })
  await harness.insert('tasks', {
    id: TASK,
    projectId: PROJECT,
    teamId: 'team-delivery',
    number: 1,
    title: 'Fix the flaky login test',
  })
  await db().memory.createMany({
    data: [
      {
        id: 'mem-conv',
        workspaceId: WS,
        projectId: PROJECT,
        scope: 'PROJECT',
        category: 'CONVENTION',
        content: { rule: 'Tests go under __tests__', scope: 'all packages' },
      },
      {
        id: 'mem-trap',
        workspaceId: WS,
        projectId: PROJECT,
        scope: 'PROJECT',
        category: 'TRAP',
        content: {
          trigger: 'Running the full jest suite with the dev server up',
          outcome: 'Port clashes make unrelated tests fail',
        },
      },
      {
        id: 'mem-task',
        workspaceId: WS,
        projectId: PROJECT,
        taskId: TASK,
        scope: 'TASK',
        category: 'DECISION',
        content: { what: 'Retry the login once', why: 'The IdP is slow' },
      },
    ],
  })
})

afterAll(async () => {
  if (ORIGINAL_ROLLOUT === undefined)
    delete process.env.LUMO_JUDGMENT_WORKSPACES
  else process.env.LUMO_JUDGMENT_WORKSPACES = ORIGINAL_ROLLOUT
  await harness.stop()
})

it('delivers the same bytes with the workspace OFF and in REVIEW', async () => {
  const whenOff = await delivered()
  // The fixture really is delivered: an empty result would prove nothing.
  expect(whenOff).toContain('Tests go under __tests__')
  expect(whenOff).toContain('Port clashes make unrelated tests fail')

  await db().workspace.update({
    where: { id: WS },
    data: { judgmentMode: 'REVIEW' },
  })
  const caller = {
    memberId: 'mem-delivery',
    workspaceId: WS,
    workspaceSlug: WS,
    via: 'WEB' as const,
  }
  const content = (statement: string) =>
    judgmentContentSchema.parse({
      description: statement,
      statement,
      kind: 'CONSTRAINT',
      rationale: 'Reviewed and agreed by the team.',
      limits: ['Applies to this project only.'],
    })

  const approved = await judgmentService.propose(caller, {
    name: 'approved-judgment',
    projectId: PROJECT,
    content: content('JUDGMENT-APPROVED-MARKER use pnpm, never npm'),
  })
  await judgmentService.approve(caller, {
    revisionId: approved.revision.id,
    digest: approved.revision.digest,
    reason: null,
  })
  await judgmentService.propose(caller, {
    name: 'pending-judgment',
    projectId: PROJECT,
    content: content('JUDGMENT-PENDING-MARKER prefer small PRs'),
  })
  const withdrawn = await judgmentService.propose(caller, {
    name: 'withdrawn-judgment',
    projectId: PROJECT,
    content: content('JUDGMENT-WITHDRAWN-MARKER squash before merge'),
  })
  await judgmentService.approve(caller, {
    revisionId: withdrawn.revision.id,
    digest: withdrawn.revision.digest,
    reason: null,
  })
  await judgmentService.withdraw(caller, {
    revisionId: withdrawn.revision.id,
    digest: withdrawn.revision.digest,
    reason: 'No longer the convention.',
  })
  expect(await db().judgment.count({ where: { workspaceId: WS } })).toBe(3)

  const inReview = await delivered()
  expect(inReview).toBe(whenOff)
  expect(inReview).not.toContain('JUDGMENT-')
})

it('no delivery module reads judgments yet', () => {
  // Phase 3 wires delivery; until then a reference here is a mistake.
  const deliveryModules = [
    'lib/services/memory/memory-sync.service.ts',
    'lib/services/memory/sync-bundle.ts',
    'lib/services/memory/sync-file-shape.ts',
    'lib/services/task-context.service.ts',
    'lib/memory/render.ts',
    'app/api/hooks/session-start/route.ts',
    'app/api/projects/[id]/memories/sync-bundle/route.ts',
  ]
  for (const file of deliveryModules) {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8')
    expect({ file, mentionsJudgment: /judgment/i.test(source) }).toEqual({
      file,
      mentionsJudgment: false,
    })
  }
})
