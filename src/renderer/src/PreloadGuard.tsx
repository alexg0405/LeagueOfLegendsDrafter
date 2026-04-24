import { type ReactNode, useEffect, useState } from 'react'

type Props = { children: ReactNode }

function drafterPresent(): boolean {
  return typeof globalThis !== 'undefined' && (globalThis as unknown as { drafter?: object }).drafter != null
}

/** Vite in a normal browser: no Electron, no preload. */
function isElectronUserAgent(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /electron/i.test(navigator.userAgent)
}

/**
 * The preload must expose <code>window.drafter</code>. A second pass catches rare timing; we also
 * distinguish "opened localhost in Chrome" from "real Electron" via the user agent.
 */
export function PreloadGuard({ children }: Props) {
  const [ready, setReady] = useState(drafterPresent)

  useEffect(() => {
    if (drafterPresent()) {
      setReady(true)
      return
    }
    const tries: ReturnType<typeof setTimeout>[] = []
    for (const ms of [0, 16, 50, 100, 200, 400]) {
      tries.push(
        setTimeout(() => {
          if (drafterPresent()) {
            setReady(true)
          }
        }, ms)
      )
    }
    return () => {
      for (const t of tries) {
        clearTimeout(t)
      }
    }
  }, [])

  if (ready) {
    return <>{children}</>
  }

  const inElectron = isElectronUserAgent()
  if (!inElectron) {
    return (
      <div
        className="boot-error"
        style={{ padding: 24, maxWidth: 640, lineHeight: 1.5, background: '#060f0c', minHeight: '100vh' }}
      >
        <h1 style={{ color: '#f85149', fontSize: '1.1rem', margin: '0 0 8px' }}>Wrong place — you’re in a web browser</h1>
        <p style={{ color: '#c9d1d9' }}>
          This app only works inside the <strong>League Drafter (Electron)</strong> process. Your browser has no
          <code> window.drafter</code> bridge, so the UI cannot talk to the PC (capture, settings, etc.).
        </p>
        <p style={{ color: '#c9d1d9' }}>
          <strong>Close this tab</strong> (or the whole browser window) and use only the desktop window opened by{' '}
          <code style={{ color: '#58a6ff' }}>npm run dev</code> from the project folder. Do not use “Open in browser”
          on the Vite URL for this project.
        </p>
        <p style={{ color: '#8b949e', fontSize: 14 }}>
          The small frameless <strong>overlay</strong> (F9 / hotkeys) is also Electron, not a browser; it will show
          the same as the main app when launched correctly.
        </p>
      </div>
    )
  }

  return (
    <div
      className="boot-error"
      style={{ padding: 24, maxWidth: 640, lineHeight: 1.5, background: '#060f0c', minHeight: '100vh' }}
    >
      <h1 style={{ color: '#f85149', fontSize: '1.1rem', margin: '0 0 8px' }}>Preload did not run</h1>
      <p style={{ color: '#c9d1d9' }}>
        The User-Agent says Electron, but <code>window.drafter</code> is still missing. That means the <strong>preload
        script</strong> did not complete (wrong path, crash, or a broken <code>out/preload</code> build).
      </p>
      <p style={{ color: '#c9d1d9' }}>
        From the <strong>project root</strong> run: <code style={{ color: '#58a6ff' }}>npm run dev</code> (rebuilds{' '}
        <code>out/main</code> + <code>out/preload</code>). Do not start a random <code>electron</code> on stale files.
      </p>
      <p style={{ color: '#8b949e', fontSize: 14 }}>
        Open DevTools here with <kbd>ctrl+shift+i</kbd>. You should see <code style={{ color: '#58a6ff' }}>[drafter]
        preload: window.drafter is bound</code> in the <strong>Console</strong> before the React app runs. In the
        terminal, look for <code style={{ color: '#58a6ff' }}>[drafter] preload path:</code> and any{' '}
        <code>preload-error</code> lines.
      </p>
    </div>
  )
}
