'use client'

import { useEffect, useState } from 'react'

/**
 * Live content-box width of an element, or `null` until it has been measured
 * (and where ResizeObserver is unavailable, e.g. jsdom). ResizeObserver
 * reports once on `observe()`, after layout and before paint, so the first
 * measurement lands without a visible frame at the unmeasured value.
 */
export function useElementWidth(el: HTMLElement | null): number | null {
  const [measured, setMeasured] = useState<{
    el: HTMLElement
    width: number
  } | null>(null)

  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      setMeasured({ el, width: el.clientWidth })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])

  // A measurement of a previous element doesn't describe the current one.
  return measured && measured.el === el ? measured.width : null
}
