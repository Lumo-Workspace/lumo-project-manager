/**
 * LUM-1356 — the workspace's team memory judgment settings: the rollout mode
 * (OFF / REVIEW; CUTOVER arrives in a later phase) and who may review. The
 * change goes through `workspaceService.updateWorkspace`: OWNER only, audited.
 */
import type { JudgmentAdmission, JudgmentMode } from '@prisma/client'
import { isJudgmentRolloutAvailable } from '@/lib/judgment/availability'
import { miscRepository } from '@/lib/repositories/misc.repository'
import { workspaceRepository } from '@/lib/repositories/workspace.repository'
import { workspaceService } from '@/lib/services/workspace.service'
import type { AuditContext } from '@/lib/services/audit.service'

export interface JudgmentSettingsCaller {
  memberId: string
  workspaceId: string
  workspaceSlug: string
}

export interface JudgmentSettings {
  /** The stored switch. */
  mode: JudgmentMode
  /** What actually applies: OFF whenever the platform has not opened it here. */
  effectiveMode: JudgmentMode
  admission: JudgmentAdmission
  /** The platform allows this workspace to turn it on. */
  available: boolean
  /** The caller may change the settings (OWNER). */
  canEdit: boolean
}

export interface JudgmentSettingsUpdate {
  mode?: 'OFF' | 'REVIEW' | undefined
  admission?: JudgmentAdmission | undefined
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

export const judgmentSettingsService = {
  async get(caller: JudgmentSettingsCaller): Promise<JudgmentSettings> {
    const [role, stored] = await Promise.all([
      miscRepository.findMemberRoleById(caller.memberId),
      workspaceRepository.findJudgmentSettings(caller.workspaceId),
    ])
    if (!stored) throw httpError(404, 'Workspace not found')
    const available = isJudgmentRolloutAvailable(caller.workspaceSlug)
    return {
      mode: stored.mode,
      effectiveMode: available ? stored.mode : 'OFF',
      admission: stored.admission,
      available,
      canEdit: role === 'OWNER',
    }
  },

  /** The mode in force for a workspace; OFF when it does not exist. */
  async effectiveMode(caller: {
    workspaceId: string
    workspaceSlug: string
  }): Promise<JudgmentMode> {
    if (!isJudgmentRolloutAvailable(caller.workspaceSlug)) return 'OFF'
    const stored = await workspaceRepository.findJudgmentSettings(
      caller.workspaceId
    )
    return stored?.mode ?? 'OFF'
  },

  /** OWNER only (enforced by `updateWorkspace`); returns the new settings. */
  async update(
    caller: JudgmentSettingsCaller,
    update: JudgmentSettingsUpdate,
    audit?: AuditContext
  ): Promise<JudgmentSettings> {
    if (
      update.mode === 'REVIEW' &&
      !isJudgmentRolloutAvailable(caller.workspaceSlug)
    ) {
      throw httpError(
        403,
        'Team memory review is not available for this workspace yet'
      )
    }
    const role = await miscRepository.findMemberRoleById(caller.memberId)
    await workspaceService.updateWorkspace(
      caller.workspaceId,
      role ?? '',
      caller.workspaceSlug,
      {
        ...(update.mode !== undefined ? { judgmentMode: update.mode } : {}),
        ...(update.admission !== undefined
          ? { judgmentAdmission: update.admission }
          : {}),
      },
      audit
    )
    return this.get(caller)
  },
}
