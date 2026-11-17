/**
 * LUM-1336 — stored rich HTML (a task description) as plain text with its
 * line structure kept: block ends and `<br>` become newlines, list items
 * become "- " lines. Script/style source is dropped, not shown.
 *
 * Pure and DOM-free, so it runs the same on the server, in the browser and in
 * node tests. The result is only ever rendered as a React text node, never
 * parsed back into HTML, so a tag strip is safe here.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntity(match: string, body: string): string {
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X'
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
    // Out-of-range or surrogate code points would throw / render garbage.
    if (
      !Number.isFinite(code) ||
      code <= 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      return match
    return String.fromCodePoint(code)
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match
}

export function htmlToPlainText(html: string): string {
  return (
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|pre|blockquote|tr|ul|ol|table)\s*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]*>/g, '')
      // Decoded last, so an escaped `&lt;b&gt;` reads as text, not a tag.
      .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, decodeEntity)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
