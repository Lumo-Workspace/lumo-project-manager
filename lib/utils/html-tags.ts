/**
 * Single source of truth for the HTML-tag vocabulary used by the format-
 * detection predicates that decide markdown-vs-HTML on the rich-text paths.
 *
 * Three predicates historically each hand-maintained their own near-identical
 * but subtly divergent tag list:
 *   - `isHtml`                (this file)           — permissive containment
 *   - `looksLikeHtmlDocument` (markdown.ts)         — strict, prefix-anchored
 *   - backfill `NESTED_BLOCK` (scripts/…)           — "inner has a nested block"
 *
 * The lists drifted (one had `li`, another `img`, a third neither). That drift
 * was the actual fragility flagged in review (#10). Centralizing the shared
 * block-level core here lets each predicate derive from one constant and keep
 * only its *intentional* delta local + documented — without changing which
 * strings match (the divergence between permissive `isHtml` and strict
 * `looksLikeHtmlDocument` is load-bearing; see normalizeRichText + LUM-107).
 *
 * Entries are regex alternation fragments, not literal tag names: `h[1-6]`
 * is a character-class shorthand, and callers that need a word boundary append
 * `\b` to their own extras. Compose with {@link tagGroup}.
 */

/** Structural block-level tags shared by every format-detection predicate. */
export const BLOCK_TAGS = [
  'p',
  'div',
  'h[1-6]',
  'ul',
  'ol',
  'pre',
  'blockquote',
  'table',
] as const

/**
 * Join tag fragments into a regex alternation group body, e.g.
 * `tagGroup(...BLOCK_TAGS, 'img')` → `"p|div|h[1-6]|…|table|img"`.
 * Returns just the inner alternation — callers wrap it in their own group
 * and anchors so the match strategy (contains vs prefix) stays explicit.
 */
export function tagGroup(...tags: readonly string[]): string {
  return tags.join('|')
}

/**
 * The permissive containment check: matches the shared block-level core
 * plus inline tags, list items, and images — i.e. *any* rich-text tag
 * appearing *anywhere* in the string. `a`/`img` carry a word boundary so
 * `<article>` / `<image>` don't false-match, and the group is followed by
 * `[>\s/]` to require a tag terminator (so `<pre-release` isn't HTML).
 *
 * Deliberately broader than `looksLikeHtmlDocument`; the divergence is
 * load-bearing — see `normalizeRichText`.
 */
const HTML_CONTAINS = new RegExp(
  `<(?:${tagGroup(...BLOCK_TAGS, 'span', 'br', 'li', 'a\\b', 'strong', 'em', 'code', 'img\\b')})[>\\s/]`,
  'i'
)

/**
 * Detect whether a string is likely HTML (as opposed to plain markdown).
 * Looks for common HTML tags that would appear in rich-text content.
 */
export function isHtml(text: string): boolean {
  return HTML_CONTAINS.test(text)
}
