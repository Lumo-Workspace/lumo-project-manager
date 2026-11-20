/**
 * LUM-1356 — the team memory page has two views on one workspace page: the
 * queue (`/team-memory`) and one revision's review (`/team-memory/<id>`).
 */
export function teamMemoryPath(
  workspaceUrl: string,
  revisionId?: string | null
): string {
  const base = `/workspace/${workspaceUrl}/team-memory`
  return revisionId ? `${base}/${encodeURIComponent(revisionId)}` : base
}

/** The revision id in a team memory pathname, or null on the queue. */
export function revisionIdFromPath(
  pathname: string,
  workspaceUrl: string
): string | null {
  const base = `/workspace/${workspaceUrl}/team-memory/`
  if (!pathname.startsWith(base)) return null
  const segment = pathname.slice(base.length).split('/')[0]
  return segment ? decodeURIComponent(segment) : null
}
