import { lazy, Suspense, useEffect, useState } from 'react'
import { ParticleWordLoader } from './ParticleWordLoader'
import { PreloadGuard } from './PreloadGuard'
import { currentBoxId, isOverlayRoute } from './route'

const MainShell = lazy(() => import('./MainShell').then((mod) => ({ default: mod.MainShell })))
const OverlayPanel = lazy(() => import('./OverlayPanel').then((mod) => ({ default: mod.OverlayPanel })))
const OverlayBoxView = lazy(() => import('./OverlayBoxView').then((mod) => ({ default: mod.OverlayBoxView })))

function DesktopLoading() {
  return <ParticleWordLoader />
}

/**
 * Re-read route when the hash changes (Vite HMR, or if #/overlay loads after first paint).
 * Do not cache with useMemo([]) or the overlay window can show MainShell.
 */
export function DesktopApp() {
  const [overlay, setOverlay] = useState(() => isOverlayRoute())
  const [boxId, setBoxId] = useState(() => currentBoxId())

  useEffect(() => {
    setOverlay(isOverlayRoute())
    setBoxId(currentBoxId())
    const onHash = () => {
      setOverlay(isOverlayRoute())
      setBoxId(currentBoxId())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <PreloadGuard>
      <Suspense fallback={<DesktopLoading />}>
        {boxId ? <OverlayBoxView boxId={boxId} /> : overlay ? <OverlayPanel /> : <MainShell />}
      </Suspense>
    </PreloadGuard>
  )
}
