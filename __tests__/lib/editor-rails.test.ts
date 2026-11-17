import {
  BODY_MIN_WIDTH,
  GUTTER_WIDTH,
  TOC_RAIL_WIDTH,
  TOC_WIDTH,
  computeEditorRails,
} from '@/lib/editor/editor-rails'

const base = {
  hasToc: true,
  hasComments: true,
  tocCollapsed: false,
}

/** Width the body is left with under a given result. */
function bodyWidth(
  paneWidth: number,
  r: ReturnType<typeof computeEditorRails>
) {
  const toc =
    r.toc === 'expanded'
      ? TOC_WIDTH
      : r.toc === 'collapsed'
        ? TOC_RAIL_WIDTH
        : 0
  return paneWidth - toc - (r.gutter ? GUTTER_WIDTH : 0)
}

describe('computeEditorRails', () => {
  it('shows both rails when the body still gets its minimum width', () => {
    const paneWidth = BODY_MIN_WIDTH + TOC_WIDTH + GUTTER_WIDTH
    expect(computeEditorRails({ ...base, paneWidth })).toEqual({
      toc: 'expanded',
      gutter: true,
      tocForced: false,
    })
  })

  it('collapses the outline before giving up the comment gutter', () => {
    // 1600px window minus a 256px sidebar and a 240px doc tree.
    expect(computeEditorRails({ ...base, paneWidth: 1104 })).toEqual({
      toc: 'collapsed',
      gutter: true,
      tocForced: true,
    })
  })

  it('moves comments to the drawer when even the icon rail leaves no room', () => {
    // 1280px window minus the same sidebars: the case that squeezed the body
    // to ~215px when the rails keyed off the viewport.
    const r = computeEditorRails({ ...base, paneWidth: 784 })
    expect(r).toEqual({ toc: 'collapsed', gutter: false, tocForced: true })
    expect(bodyWidth(784, r)).toBeGreaterThanOrEqual(BODY_MIN_WIDTH)
  })

  it('hides both rails on a pane narrower than the body minimum plus a rail', () => {
    expect(computeEditorRails({ ...base, paneWidth: 600 })).toEqual({
      toc: 'hidden',
      gutter: false,
      tocForced: true,
    })
  })

  it('lets the outline win the space when the reader asked for it', () => {
    expect(
      computeEditorRails({ ...base, paneWidth: 1104, preferToc: true })
    ).toEqual({ toc: 'expanded', gutter: false, tocForced: false })
  })

  it("keeps the reader's collapsed outline collapsed, without calling it forced", () => {
    expect(
      computeEditorRails({ ...base, paneWidth: 2000, tocCollapsed: true })
    ).toEqual({ toc: 'collapsed', gutter: true, tocForced: false })
  })

  it('never offers a rail the document has no content for', () => {
    expect(
      computeEditorRails({
        paneWidth: 2000,
        hasToc: false,
        hasComments: false,
        tocCollapsed: false,
      })
    ).toEqual({ toc: 'hidden', gutter: false, tocForced: false })
  })

  it('assumes there is room before the pane has been measured', () => {
    expect(computeEditorRails({ ...base, paneWidth: null })).toEqual({
      toc: 'expanded',
      gutter: true,
      tocForced: false,
    })
  })

  it('never leaves the body under its minimum while any rail is shown', () => {
    for (let paneWidth = 300; paneWidth <= 1600; paneWidth += 7) {
      for (const preferToc of [false, true]) {
        const r = computeEditorRails({ ...base, paneWidth, preferToc })
        if (r.toc !== 'hidden' || r.gutter) {
          expect(bodyWidth(paneWidth, r)).toBeGreaterThanOrEqual(BODY_MIN_WIDTH)
        }
      }
    }
  })
})
