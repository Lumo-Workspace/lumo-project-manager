import { z } from 'zod'

/**
 * LUM-1336: the workspace Boundary Crossings tab (index-card queue).
 */

/** Query of GET /api/boundary-crossings/queue. */
export const crossingQueueQuerySchema = z.object({
  filter: z.enum(['all', 'tagged', 'blocking']).default('all'),
  projectId: z.string().min(1).optional(),
})

/**
 * Body for POST /api/boundary-crossings/[crossingId]/rule. Strict, and only
 * the two clearing values: reopening a crossing and repository suppression
 * rules stay in the task's Record tab. `stateHash` is the one the card's
 * context read returned — a ruling against a crossing that changed since is
 * refused 409.
 */
export const ruleCrossingSchema = z
  .object({
    disposition: z.enum(['FALSE_POSITIVE', 'CONFIRMED']),
    dispositionNote: z.string().trim().min(1).max(2000).optional(),
    stateHash: z.string().min(1).max(128),
  })
  .strict()

/** Body for POST /api/boundary-crossings/[crossingId]/tag. */
export const tagCrossingSchema = z
  .object({
    memberId: z.string().min(1),
    message: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

export type RuleCrossingInput = z.infer<typeof ruleCrossingSchema>
export type TagCrossingInput = z.infer<typeof tagCrossingSchema>
