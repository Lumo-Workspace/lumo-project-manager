/**
 * LUM-1354 Decision 9 — team memory review is opened workspace by workspace.
 * `LUMO_JUDGMENT_WORKSPACES` is the platform ceiling: a comma-separated list
 * of workspace slugs that may turn it on, or `*` for every workspace. Unset =
 * no workspace. An OWNER can only turn the feature on under this ceiling.
 */
export function isJudgmentRolloutAvailable(
  workspaceSlug: string,
  raw: string | undefined = process.env.LUMO_JUDGMENT_WORKSPACES
): boolean {
  if (!raw) return false
  const slugs = raw
    .split(',')
    .map(slug => slug.trim().toLowerCase())
    .filter(Boolean)
  return slugs.includes('*') || slugs.includes(workspaceSlug.toLowerCase())
}
