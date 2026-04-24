import { useEffect, useState } from 'react'
import { MainShell } from './MainShell'
import { OverlayPanel } from './OverlayPanel'
import { PreloadGuard } from './PreloadGuard'
import { isOverlayRoute } from './route'

/**
 * Re-read route when the hash changes (Vite HMR, or if #/overlay loads after first paint).
 * Do not cache with useMemo([]) or the overlay window can show MainShell.
 */
export function App() {
  const [overlay, setOverlay] = useState(() => isOverlayRoute())

  useEffect(() => {
    setOverlay(isOverlayRoute())
    const onHash = () => setOverlay(isOverlayRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <PreloadGuard>
      {overlay ? <OverlayPanel /> : <MainShell />}
    </PreloadGuard>
  )
}
