/** @jest-environment node */
const mockRole = jest.fn()
const mockSettings = jest.fn()
const mockUpdateWorkspace = jest.fn()
jest.mock('@/lib/repositories/misc.repository', () => ({
  miscRepository: { findMemberRoleById: (...a: unknown[]) => mockRole(...a) },
}))
jest.mock('@/lib/repositories/workspace.repository', () => ({
  workspaceRepository: {
    findJudgmentSettings: (...a: unknown[]) => mockSettings(...a),
  },
}))
jest.mock('@/lib/services/workspace.service', () => ({
  workspaceService: {
    updateWorkspace: (...a: unknown[]) => mockUpdateWorkspace(...a),
  },
}))

import { isJudgmentRolloutAvailable } from '@/lib/judgment/availability'
import { judgmentSettingsService } from '@/lib/services/judgment/judgment-settings.service'
import { judgmentSettingsSchema } from '@/lib/validation/judgment'

const caller = { memberId: 'mem_1', workspaceId: 'ws_1', workspaceSlug: 'acme' }
const ORIGINAL = process.env.LUMO_JUDGMENT_WORKSPACES

beforeEach(() => {
  jest.clearAllMocks()
  mockRole.mockResolvedValue('OWNER')
  mockSettings.mockResolvedValue({ mode: 'REVIEW', admission: 'ANY_MEMBER' })
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.LUMO_JUDGMENT_WORKSPACES
  else process.env.LUMO_JUDGMENT_WORKSPACES = ORIGINAL
})

describe('isJudgmentRolloutAvailable', () => {
  it('is closed unless the workspace is listed', () => {
    expect(isJudgmentRolloutAvailable('acme', undefined)).toBe(false)
    expect(isJudgmentRolloutAvailable('acme', '')).toBe(false)
    expect(isJudgmentRolloutAvailable('acme', 'lumo')).toBe(false)
    expect(isJudgmentRolloutAvailable('acme', 'lumo, ACME')).toBe(true)
    expect(isJudgmentRolloutAvailable('acme', '*')).toBe(true)
  })
})

describe('judgmentSettingsService', () => {
  it('reports OFF as the effective mode outside the rollout', async () => {
    process.env.LUMO_JUDGMENT_WORKSPACES = 'lumo'
    await expect(judgmentSettingsService.get(caller)).resolves.toEqual({
      mode: 'REVIEW',
      effectiveMode: 'OFF',
      admission: 'ANY_MEMBER',
      available: false,
      canEdit: true,
    })
    await expect(judgmentSettingsService.effectiveMode(caller)).resolves.toBe(
      'OFF'
    )
  })

  it('reports the stored mode inside the rollout', async () => {
    process.env.LUMO_JUDGMENT_WORKSPACES = 'acme'
    mockRole.mockResolvedValue('MEMBER')
    await expect(judgmentSettingsService.get(caller)).resolves.toMatchObject({
      effectiveMode: 'REVIEW',
      available: true,
      canEdit: false,
    })
  })

  it('refuses to turn REVIEW on outside the rollout, and writes nothing', async () => {
    process.env.LUMO_JUDGMENT_WORKSPACES = 'lumo'
    await expect(
      judgmentSettingsService.update(caller, { mode: 'REVIEW' })
    ).rejects.toMatchObject({ status: 403 })
    expect(mockUpdateWorkspace).not.toHaveBeenCalled()
  })

  it('passes the change and the role to updateWorkspace (which enforces OWNER)', async () => {
    process.env.LUMO_JUDGMENT_WORKSPACES = 'acme'
    mockRole.mockResolvedValue('MEMBER')
    await judgmentSettingsService.update(caller, {
      mode: 'REVIEW',
      admission: 'OWNER_ONLY',
    })
    expect(mockUpdateWorkspace).toHaveBeenCalledWith(
      'ws_1',
      'MEMBER',
      'acme',
      { judgmentMode: 'REVIEW', judgmentAdmission: 'OWNER_ONLY' },
      undefined
    )
  })

  it('turning it OFF is always allowed', async () => {
    process.env.LUMO_JUDGMENT_WORKSPACES = ''
    await judgmentSettingsService.update(caller, { mode: 'OFF' })
    expect(mockUpdateWorkspace).toHaveBeenCalledTimes(1)
  })
})

describe('judgmentSettingsSchema', () => {
  it('does not accept CUTOVER in this phase, nor an empty update', () => {
    expect(judgmentSettingsSchema.safeParse({ mode: 'CUTOVER' }).success).toBe(
      false
    )
    expect(judgmentSettingsSchema.safeParse({}).success).toBe(false)
    expect(judgmentSettingsSchema.safeParse({ mode: 'REVIEW' }).success).toBe(
      true
    )
  })
})
