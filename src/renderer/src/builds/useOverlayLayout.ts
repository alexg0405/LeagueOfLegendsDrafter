import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_OVERLAY_LAYOUT, type OverlayLayout, type OverlayLayoutState } from '@shared/overlayLayout'

const FALLBACK: OverlayLayoutState = { layout: DEFAULT_OVERLAY_LAYOUT, arranging: false, boxesVisible: false }

/**
 * The in-game layout lives in the main process (so box windows exist before any renderer asks);
 * every window reads it here and gets pushed changes.
 */
export function useOverlayLayout(): {
  state: OverlayLayoutState
  setLayout: (layout: OverlayLayout) => void
  setArranging: (arranging: boolean) => void
} {
  const [state, setState] = useState<OverlayLayoutState>(FALLBACK)
  useEffect(() => {
    const bridge = (window as Window & { drafter?: Window['drafter'] }).drafter
    if (!bridge?.getOverlayLayout) {
      return
    }
    let cancelled = false
    void bridge
      .getOverlayLayout()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        /* older main process: defaults */
      })
    const un = bridge.onOverlayLayout((next) => setState(next))
    return () => {
      cancelled = true
      un()
    }
  }, [])
  const setLayout = useCallback((layout: OverlayLayout) => {
    setState((current) => ({ ...current, layout }))
    void window.drafter
      .setOverlayLayout(layout)
      .then(setState)
      .catch(() => {
        /* keep the optimistic layout */
      })
  }, [])
  const setArranging = useCallback((arranging: boolean) => {
    void window.drafter
      .setArrangeBoxes(arranging)
      .then(setState)
      .catch(() => {
        /* main may be mid-teardown */
      })
  }, [])
  return { state, setLayout, setArranging }
}
