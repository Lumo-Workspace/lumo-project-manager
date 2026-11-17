// @ts-ignore — turndown is CJS; bundler interop may wrap as { default }
import TurndownModule from 'turndown'
import { isHtml } from './html-tags'

type TurndownCtor = new (options?: object) => { turndown(html: string): string }

/** Resolve CJS/ESM interop: bundler may deliver the class directly or as { default } */
const TurndownService: TurndownCtor =
  typeof TurndownModule === 'function'
    ? (TurndownModule as unknown as TurndownCtor)
    : (TurndownModule as unknown as { default: TurndownCtor }).default

// `isHtml` lives in the dependency-free html-tags module so client code can
// use it without pulling in turndown; re-exported here for existing callers.
export { isHtml }

/**
 * Convert HTML back to Markdown. If the input doesn't look like HTML,
 * returns it as-is (treating it as already-markdown).
 *
 * Lives in its own module so callers that only need this direction
 * (e.g. the documents service rendering a stored HTML body back to
 * markdown for the CLI) don't drag the marked ESM build into their
 * import graph.
 */
export function htmlToMarkdown(html: string): string {
  if (!isHtml(html)) return html
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  return turndown.turndown(html)
}
