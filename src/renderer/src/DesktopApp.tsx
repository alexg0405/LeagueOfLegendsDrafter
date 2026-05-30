import { lazy, Suspense, useEffect, useState } from 'react'
import { PreloadGuard } from './PreloadGuard'
import { isOverlayRoute } from './route'

const MainShell = lazy(() => import('./MainShell').then((mod) => ({ default: mod.MainShell })))
const OverlayPanel = lazy(() => import('./OverlayPanel').then((mod) => ({ default: mod.OverlayPanel })))

function DesktopLoading() {
  return (
    <div className="min-h-screen bg-nexus-bg px-6 py-5 font-mono text-sm text-nexus-muted">
      Loading Nexus Draft...
    </div>
  )
}

/**
 * Re-read route when the hash changes (Vite HMR, or if #/overlay loads after first paint).
 * Do not cache with useMemo([]) or the overlay window can show MainShell.
 */
export function DesktopApp() {
  const [overlay, setOverlay] = useState(() => isOverlayRoute())

  useEffect(() => {
    setOverlay(isOverlayRoute())
    const onHash = () => setOverlay(isOverlayRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <PreloadGuard>
      <Suspense fallback={<DesktopLoading />}>{overlay ? <OverlayPanel /> : <MainShell />}</Suspense>
    </PreloadGuard>
  )
}
