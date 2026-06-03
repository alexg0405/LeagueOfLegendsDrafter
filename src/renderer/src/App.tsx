import { lazy, Suspense, useState, type ReactNode } from 'react'
import { ParticleIntroActiveContext, ParticleWordIntroOverlay, ParticleWordLoader } from './ParticleWordLoader'
import { isOverlayRoute } from './route'

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

function shouldShowIntroOverlay(): boolean {
  return typeof window !== 'undefined' && !isOverlayRoute()
}

function IntroShell({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(() => !shouldShowIntroOverlay())

  return (
    <ParticleIntroActiveContext.Provider value={!entered}>
      {children}
      {!entered ? <ParticleWordIntroOverlay onDone={() => setEntered(true)} /> : null}
    </ParticleIntroActiveContext.Provider>
  )
}

export function App() {
  const LoadedApp = IS_WEB_BUILD ? WebDraftApp : DesktopApp

  return (
    <Suspense fallback={<AppLoading />}>
      {LoadedApp ? (
        <IntroShell>
          <LoadedApp />
        </IntroShell>
      ) : (
        <AppLoading />
      )}
    </Suspense>
  )
}
