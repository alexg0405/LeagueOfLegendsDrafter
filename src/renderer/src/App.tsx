import { lazy, Suspense } from 'react'
import { ParticleWordLoader } from './ParticleWordLoader'

const IS_WEB_BUILD = import.meta.env.VITE_NEXUS_WEB === '1'
const WebDraftApp = IS_WEB_BUILD
  ? lazy(() => import('./WebDraftApp').then((mod) => ({ default: mod.WebDraftApp })))
  : null
const DesktopApp = IS_WEB_BUILD
  ? null
  : lazy(() => import('./DesktopApp').then((mod) => ({ default: mod.DesktopApp })))

function AppLoading() {
  return <ParticleWordLoader />
}

export function App() {
  const LoadedApp = IS_WEB_BUILD ? WebDraftApp : DesktopApp

  return (
    <Suspense fallback={<AppLoading />}>
      {LoadedApp ? <LoadedApp /> : <AppLoading />}
    </Suspense>
  )
}
