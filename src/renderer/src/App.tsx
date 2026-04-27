import { useEffect, useState } from 'react'
import { MainShell } from './MainShell'
import { OverlayPanel } from './OverlayPanel'
import { PreloadGuard } from './PreloadGuard'
import { WebDraftApp } from './WebDraftApp'
import { isOverlayRoute } from './route'

/**
 * Re-read route when the hash changes (Vite HMR, or if #/overlay loads after first paint).
 * Do not cache with useMemo([]) or the overlay window can show MainShell.
 */
export function App() {
  const [overlay, setOverlay] = useState(() => isOverlayRoute())
  const webMode = import.meta.env.VITE_NEXUS_WEB === '1'

  useEffect(() => {
    setOverlay(isOverlayRoute())
    const onHash = () => setOverlay(isOverlayRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (webMode) {
    return <WebDraftApp />
  }

  return (
    <PreloadGuard>
      {overlay ? <OverlayPanel /> : <MainShell />}
    </PreloadGuard>
  )
}
