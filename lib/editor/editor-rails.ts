/**
 * Which side rails the document editor can afford at a given pane width.
 *
 * The body comes first: a rail is shown only if the text column keeps at least
 * BODY_MIN_WIDTH. When both rails can't fit, comments win over the outline
 * (the outline falls back to its icon rail, then disappears) unless the reader
 * asked for the outline (`preferToc`), in which case comments move to the
 * drawer instead.
 */
export const BODY_MIN_WIDTH = 640
export const TOC_WIDTH = 240
export const TOC_RAIL_WIDTH = 48
export const GUTTER_WIDTH = 256

export type TocRailMode = 'expanded' | 'collapsed' | 'hidden'

export interface EditorRails {
  toc: TocRailMode
  /** Comment gutter beside the text; when false, threads live in the drawer. */
  gutter: boolean
  /** The outline is collapsed for lack of room, not by the reader's choice. */
  tocForced: boolean
}

export interface EditorRailsInput {
  /** Width of the editor pane in px; `null` before it has been measured. */
  paneWidth: number | null
  hasToc: boolean
  hasComments: boolean
  /** The reader's persisted choice to keep the outline collapsed. */
  tocCollapsed: boolean
  /** The reader opened the outline while it was collapsed for lack of room. */
  preferToc?: boolean
}

const TOC_MODE_WIDTH: Record<TocRailMode, number> = {
  expanded: TOC_WIDTH,
  collapsed: TOC_RAIL_WIDTH,
  hidden: 0,
}

export function computeEditorRails({
  paneWidth,
  hasToc,
  hasComments,
  tocCollapsed,
  preferToc = false,
}: EditorRailsInput): EditorRails {
  const bestToc: TocRailMode = !hasToc
    ? 'hidden'
    : tocCollapsed
      ? 'collapsed'
      : 'expanded'
  // Unmeasured (first paint, or no ResizeObserver): assume there is room.
  if (paneWidth === null) {
    return { toc: bestToc, gutter: hasComments, tocForced: false }
  }

  const tocModes: TocRailMode[] =
    bestToc === 'expanded'
      ? ['expanded', 'collapsed', 'hidden']
      : bestToc === 'collapsed'
        ? ['collapsed', 'hidden']
        : ['hidden']
  const gutters = hasComments ? [true, false] : [false]

  // Candidates in order of preference; the first that leaves the body its
  // minimum width wins.
  const candidates: Array<{ toc: TocRailMode; gutter: boolean }> = []
  if (preferToc) {
    for (const toc of tocModes)
      for (const gutter of gutters) candidates.push({ toc, gutter })
  } else {
    for (const gutter of gutters)
      for (const toc of tocModes) candidates.push({ toc, gutter })
  }

  const fit = candidates.find(
    c =>
      paneWidth - TOC_MODE_WIDTH[c.toc] - (c.gutter ? GUTTER_WIDTH : 0) >=
      BODY_MIN_WIDTH
  ) ?? { toc: 'hidden' as const, gutter: false }

  return {
    ...fit,
    tocForced: bestToc === 'expanded' && fit.toc !== 'expanded',
  }
}
