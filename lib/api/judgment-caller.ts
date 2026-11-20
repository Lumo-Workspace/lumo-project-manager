import type { Identity } from '@/lib/auth/identity'
import { isHumanWebSession } from '@/lib/auth/human-web-session'
import type { JudgmentCaller } from '@/lib/services/judgment/judgment.service'

/**
 * The judgment service's caller for a request. `via` comes from how the
 * request authenticated — never from anything the request body says.
 */
export function judgmentCaller(identity: Identity): JudgmentCaller {
  return {
    memberId: identity.memberId,
    workspaceId: identity.workspaceId,
    workspaceSlug: identity.workspaceSlug,
    via: isHumanWebSession(identity) ? 'WEB' : 'CLI',
  }
}
