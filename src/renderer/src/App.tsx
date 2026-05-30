import { lazy, Suspense } from 'react'

const IS_WEB_BUILD = import.meta.env.VITE_NEXUS_WEB === '1'
const WebDraftApp = IS_WEB_BUILD
  ? lazy(() => import('./WebDraftApp').then((mod) => ({ default: mod.WebDraftApp })))
  : null
const DesktopApp = IS_WEB_BUILD
  ? null
  : lazy(() => import('./DesktopApp').then((mod) => ({ default: mod.DesktopApp })))

function AppLoading() {
  return (
    <div className="min-h-screen bg-nexus-bg px-6 py-5 font-mono text-sm text-nexus-muted">
      Loading Nexus Draft...
    </div>
  )
}

export function App() {
  const LoadedApp = IS_WEB_BUILD ? WebDraftApp : DesktopApp

  return (
    <Suspense fallback={<AppLoading />}>
      {LoadedApp ? <LoadedApp /> : <AppLoading />}
    </Suspense>
  )
}
