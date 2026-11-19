import { createHash } from 'node:crypto'
import {
  renderMemoryItem,
  memoryHeadline,
  truncateHeadline,
  wrapUntrustedMemory,
  type RenderableMemory,
} from '@/lib/memory/render'
import { guardPromptLine } from '@/lib/security-scan/inject-guard'
import { sanitizeField } from '@/lib/utils/sanitize'
import type { MemorySyncEntry } from '@/lib/services/memory/sync-bundle'

/** A sync entry plus the local-file projection the CLI writes. */
export interface ShapedSyncEntry extends MemorySyncEntry {
  relPath: string
  frontmatter: string
  indexLine: string
}

/** The over-the-wire downsync bundle the server returns and the CLI writes. */
export interface ShapedSyncBundle {
  projectId: string
  entries: ShapedSyncEntry[]
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'memory'
  )
}

/** A line break and the whitespace around it. Built from escapes so the
 *  separators stay visible in source. */
const LINE_BREAKS = new RegExp('\\s*[\\n\\u2028\\u2029]\\s*', 'g')

/** Headline length kept in the resident index line, markers included. */
const INDEX_HEADLINE_MAX = 100
/** Floor for the headline text when a marker takes most of that length. */
const INDEX_HEADLINE_MIN = 40

/**
 * Guard a memory headline for the places it is written as ONE line: the index
 * line (resident in MEMORY.md) and the frontmatter description. Same chain as
 * an injected prompt line — control characters stripped, credentials redacted,
 * fence-shaped tags defanged, a marker appended when the line reads as an
 * instruction — plus two things only a file line needs: line breaks collapsed,
 * so the headline cannot start a line of its own in MEMORY.md, and HTML comment
 * delimiters defanged, so it cannot spell the marker that closes the managed
 * block there.
 */
export function guardSyncHeadline(headline: string): {
  text: string
  marker: string
} {
  const oneLine = sanitizeField(headline)
    // sanitizeField already dropped \r and U+0085; U+2028 / U+2029 are the
    // line breaks it keeps.
    .replace(LINE_BREAKS, ' ')
    .trim()
  const guarded = guardPromptLine(oneLine)
  return {
    text: guarded.text.replace(/<!--/g, '(!--').replace(/-->/g, '--)'),
    marker: guarded.marker,
  }
}

/**
 * Render one team memory into Claude Code local-file shape. The body is the
 * canonical {@link renderMemoryItem} output behind the same guard as the
 * injection path ({@link wrapUntrustedMemory}, LUM-1355): the files land in the
 * agent's local memory directory, so they are untrusted text entering its
 * context just as much as an injected block is. The guard runs here, on the
 * server, so every CLI version receives guarded files.
 *
 * The contentHash is sha256 of that guarded body ONLY (never the syncedAt
 * stamp) so re-syncing the same content is a no-op and a drifted on-disk body
 * is detectable — the CLI hashes what it wrote, so the guard has to come
 * before the hash. The `metadata.lumo` marker is what the CLI uses to recognise
 * files it owns — dev-authored files lack it and are never touched.
 */
export function toSyncEntry(
  m: RenderableMemory,
  syncedAtIso: string
): ShapedSyncEntry {
  const body = wrapUntrustedMemory(renderMemoryItem(m))
  const contentHash = createHash('sha256').update(body).digest('hex')
  const rawHeadline = memoryHeadline(m)
  // The slug only keeps [a-z0-9-], so it is taken from the raw headline and a
  // file's name does not change with the guard.
  const slug = slugify(rawHeadline)
  const headline = guardSyncHeadline(rawHeadline)
  const description = `${headline.text}${headline.marker}`
  // A marker counts toward the clip, so a flagged line is no longer than an
  // ordinary one and the managed block's byte budget holds as many lines.
  const indexHeadline = `${truncateHeadline(
    headline.text,
    Math.max(INDEX_HEADLINE_MIN, INDEX_HEADLINE_MAX - headline.marker.length)
  )}${headline.marker}`
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `description: ${JSON.stringify(description)}`,
    'metadata:',
    '  type: project',
    `  lumo: { id: ${m.id}, category: ${m.category}, scope: ${m.scope}, source: team, contentHash: ${contentHash}, syncedAt: ${syncedAtIso} }`,
    '---',
  ].join('\n')
  return {
    id: m.id,
    slug,
    category: m.category,
    scope: m.scope,
    description,
    body,
    contentHash,
    relPath: `team/${m.id}.md`,
    frontmatter,
    // Index line is the resident hook in MEMORY.md — clip the headline so a
    // folded subsystem card (hundreds of chars) stays one scannable line; the
    // full content lives in the linked team/*.md (LUM-556 follow-up).
    indexLine: `- [${indexHeadline}](team/${m.id}.md) — ${m.category}`,
  }
}
