/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { useElementWidth } from '@/app/workspace/[workspaceUrl]/hooks/useElementWidth'

type Callback = () => void

describe('useElementWidth', () => {
  const original = globalThis.ResizeObserver
  let callbacks: Callback[] = []
  let disconnects = 0

  beforeEach(() => {
    callbacks = []
    disconnects = 0
    globalThis.ResizeObserver = class {
      constructor(cb: Callback) {
        callbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnects++
      }
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => {
    globalThis.ResizeObserver = original
  })

  function makeEl(width: number) {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      get: () => width,
    })
    return el
  }

  it('is null until the observer reports, then tracks the element width', () => {
    let width = 800
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { get: () => width })

    const { result } = renderHook(() => useElementWidth(el))
    expect(result.current).toBeNull()

    act(() => callbacks[0]!())
    expect(result.current).toBe(800)

    width = 640
    act(() => callbacks[0]!())
    expect(result.current).toBe(640)
  })

  it('drops a stale measurement when the element changes, and disconnects', () => {
    const first = makeEl(800)
    const second = makeEl(500)
    const { result, rerender } = renderHook(
      ({ el }: { el: HTMLElement | null }) => useElementWidth(el),
      { initialProps: { el: first as HTMLElement | null } }
    )
    act(() => callbacks[0]!())
    expect(result.current).toBe(800)

    rerender({ el: second })
    expect(result.current).toBeNull()
    expect(disconnects).toBe(1)
    act(() => callbacks[1]!())
    expect(result.current).toBe(500)
  })

  it('stays null without an element or without ResizeObserver', () => {
    expect(renderHook(() => useElementWidth(null)).result.current).toBeNull()
    // @ts-expect-error simulate an environment without ResizeObserver
    delete globalThis.ResizeObserver
    expect(
      renderHook(() => useElementWidth(makeEl(800))).result.current
    ).toBeNull()
  })
})
