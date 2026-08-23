import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  desktopCapturer,
  shell,
  type Rectangle,
  type WebContents
} from 'electron'
import { existsSync } from 'node:fs'

const APP_DISPLAY_NAME = 'Nexus Draft'
const APP_USER_MODEL_ID = 'dev.nexusdraft.app'
const APP_PROCESS_NAME = 'NexusDraft'
process.title = APP_PROCESS_NAME
app.setName(APP_DISPLAY_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

{
  // Game/window capture on Windows often kills the GPU process; default to software like many capture UIs.
  const allowGpu = process.env['LEAGUE_DRAFTER_ALLOW_GPU'] === '1'
  const noGpu =
    process.env['LEAGUE_DRAFTER_DISABLE_GPU'] === '1' ||
    process.env['LEAGUE_DRAFTER_SAFE_CAPTURE'] === '1' ||
    (process.platform === 'win32' && !allowGpu)
  if (noGpu) {
    app.disableHardwareAcceleration()
    // eslint-disable-next-line no-console
    console.log(
      '[drafter] software rendering (GPU off). ' +
        (process.platform === 'win32' && !allowGpu
          ? 'Windows default for capture stability — set LEAGUE_DRAFTER_ALLOW_GPU=1 to re-enable hardware GPU if your machine is stable.'
          : 'LEAGUE_DRAFTER_DISABLE_GPU or LEAGUE_DRAFTER_SAFE_CAPTURE was set.')
    )
  }
}
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadLocalEnv, loadLocalEnvWhenReady } from './loadLocalEnv'
import { setupAppUpdater } from './appUpdater'
import { fetchChampSelectSession, getLcuDiagnostics } from './lcuClient'
import { fetchLivePublicDataPayload } from './livePublicDataFetcher'
import { getPlayerChampionPool } from './riotPlayerChampionPool'
import {
  clearOverlayBounds,
  DEFAULT_OVERLAY_HOTKEYS,
  getCaptureSourceId,
  getOverlayBounds,
  getOverlayHotkeys,
  isValidAccelerator,
  setCaptureSourceId,
  setOverlayBounds,
  setOverlayHotkeys
} from './settingsStore'
import { diagLog, diagnosticsLogPath, recentDiagnostics } from './diagnosticsLog'
import { type DraftUpdate } from '../shared/draft/types'
import { isDraftUpdate, isOverlayEnginePrefsPatch } from '../shared/draft/validate'
import {
  loadTrainedEffectsFromDisk,
  watchTrainedEffects,
  type TrainedEffectsLoad
} from './trainedEffectsLoader'

loadLocalEnv()

const _dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

function windowIconPath(): string {
  return isDev ? resolve(process.cwd(), 'favicon.png') : resolve(app.getAppPath(), 'favicon.png')
}

/** Avoid spam when the renderer posts draft payloads that fail `isDraftUpdate` (e.g. mid-hydration). */
let lastInvalidDraftPublishWarnMs = 0
const INVALID_DRAFT_PUBLISH_WARN_EVERY_MS = 5000

/**
 * Preload must be an absolute file path. In dev, electron-vite writes `out/preload/index.mjs`.
 * `sandbox: true` + ESM preload is unreliable on some Windows builds — we keep contextIsolation
 * and nodeIntegration: false, but disable the sandbox so the bridge always loads.
 */
function absolutePreloadPath(): string {
  const mjs = join(_dirname, '../preload/index.mjs')
  const js = join(_dirname, '../preload/index.js')
  if (existsSync(mjs)) {
    return resolve(mjs)
  }
  if (existsSync(js)) {
    return resolve(js)
  }
  return resolve(mjs)
}

function defaultWebPreferences() {
  return {
    preload: absolutePreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    /**
     * Sandboxed ESM preloads can fail to execute on Windows (no `window.drafter`).
     * The app is local-only; this matches common electron-vite templates.
     */
    sandbox: false as const,
    /** Reduces throttling of timers/rAF when the window loses focus (helps while capturing a game). */
    backgroundThrottling: false
  }
}

function wirePreloadErrorLogging(w: BrowserWindow, label: string) {
  w.webContents.on('preload-error', (_event, _preloadPath, err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[drafter] ${label} preload-error:`, _preloadPath, err)
    void dialog.showErrorBox(
      'Nexus Draft - preload failed',
      `The script that exposes "window.drafter" did not run.\n\n${msg}\n\n` +
        `Path: ${_preloadPath}\n\n` +
        `From the project folder run: npm run dev (builds out/preload) or npm run build.`
    )
  })
}

function wireWebContentsStabilityLogging(wc: WebContents, label: string) {
  wc.on('render-process-gone', (_event, details) => {
    console.error(
      `[drafter] ${label} render-process-gone: reason=${String(details.reason)} exitCode=${String(details.exitCode)}`
    )
  })
  wc.on('unresponsive', () => {
    console.error(`[drafter] ${label} webContents unresponsive (often heavy work or a stuck main thread)`)
  })
}

function isExternalOpenUrl(rawUrl: string): boolean {
  try {
    const { protocol } = new URL(rawUrl)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function isAllowedAppNavigation(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'file:' || url.protocol === 'data:') {
      return true
    }
    return isDev && (url.protocol === 'http:' || url.protocol === 'https:') && isLocalDevHost(url.hostname)
  } catch {
    return false
  }
}

function wireNavigationGuards(wc: WebContents, label: string) {
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url)
    } else {
      console.warn(`[drafter] blocked ${label} popup: ${url}`)
    }
    return { action: 'deny' }
  })
  wc.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return
    }
    event.preventDefault()
    if (isExternalOpenUrl(url)) {
      void shell.openExternal(url)
    } else {
      console.warn(`[drafter] blocked ${label} navigation: ${url}`)
    }
  })
}

const OVERLAY_WIDTH = 380
/**
 * `ready-to-show` fires on first paint. If the renderer never paints (failed load, crashed
 * chunk, GPU stall) the overlay would stay hidden forever with `skipTaskbar: true` and no
 * error — the shipped `.exe` symptom. Force it visible past this deadline instead.
 */
const OVERLAY_SHOW_WATCHDOG_MS = 4000
/** League taking focus (or another topmost app) can bury a `screen-saver` window. */
const OVERLAY_TOPMOST_REASSERT_MS = 2000
const OVERLAY_BOUNDS_SAVE_DEBOUNCE_MS = 400

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let overlayCompactBounds: Rectangle | null = null
let overlayProjectionOpen = false
let registeredOverlayShortcuts: string[] = []
let failedOverlayShortcuts: string[] = []
let overlayShown = false
let overlayLoadError: string | null = null
let overlayShowWatchdog: ReturnType<typeof setTimeout> | null = null
let overlayTopmostTimer: ReturnType<typeof setInterval> | null = null
let overlayBoundsSaveTimer: ReturnType<typeof setTimeout> | null = null

function overlayStatusResult() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: true as const, exists: false, visible: false, loadError: overlayLoadError }
  }
  return {
    ok: true as const,
    exists: true,
    visible: overlayWindow.isVisible(),
    focused: overlayWindow.isFocused(),
    title: overlayWindow.getTitle(),
    bounds: overlayWindow.getBounds(),
    loadError: overlayLoadError
  }
}

function applyOverlayPriority(win: BrowserWindow) {
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

/** Top-right of the primary work area, using its real origin (not just its size). */
function defaultOverlayBounds(): Rectangle {
  const work = screen.getPrimaryDisplay().workArea
  const height = Math.max(320, Math.min(Math.floor(work.height * 0.62), work.height - 48))
  const width = Math.min(OVERLAY_WIDTH, Math.max(320, work.width - 32))
  return {
    width,
    height,
    x: work.x + Math.max(0, work.width - width - 16),
    y: work.y + 24
  }
}

/**
 * Keep the overlay reachable: a saved rect from an unplugged monitor (or a negative-origin
 * display that is gone) must not strand the window off every screen.
 */
function clampOverlayBounds(bounds: Rectangle): Rectangle {
  const displays = screen.getAllDisplays()
  const intersects = displays.some((display) => {
    const w = display.workArea
    return (
      bounds.x < w.x + w.width &&
      bounds.x + bounds.width > w.x &&
      bounds.y < w.y + w.height &&
      bounds.y + bounds.height > w.y
    )
  })
  if (!intersects) {
    diagLog('[overlay] saved bounds are off-screen; using default', bounds)
    return defaultOverlayBounds()
  }
  const work = screen.getDisplayMatching(bounds).workArea
  const width = Math.max(320, Math.min(bounds.width, work.width))
  const height = Math.max(200, Math.min(bounds.height, work.height))
  return {
    width,
    height,
    // Keep at least a title-bar's worth of window on the work area so it stays draggable.
    x: Math.min(Math.max(bounds.x, work.x - width + 80), work.x + work.width - 80),
    y: Math.min(Math.max(bounds.y, work.y), work.y + work.height - 40)
  }
}

function initialOverlayBounds(): Rectangle {
  const saved = getOverlayBounds()
  if (!saved) {
    return defaultOverlayBounds()
  }
  return clampOverlayBounds(saved)
}

function queueOverlayBoundsSave() {
  if (overlayBoundsSaveTimer) {
    clearTimeout(overlayBoundsSaveTimer)
  }
  overlayBoundsSaveTimer = setTimeout(() => {
    overlayBoundsSaveTimer = null
    // Projection mode temporarily balloons the window; never persist that rect.
    if (!overlayWindow || overlayWindow.isDestroyed() || overlayProjectionOpen) {
      return
    }
    setOverlayBounds(overlayWindow.getBounds())
  }, OVERLAY_BOUNDS_SAVE_DEBOUNCE_MS)
}

function clearOverlayShowWatchdog() {
  if (overlayShowWatchdog) {
    clearTimeout(overlayShowWatchdog)
    overlayShowWatchdog = null
  }
}

/** The single place that makes the overlay visible, so no path can forget the z-order reassert. */
function showOverlay(reason: string) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }
  clearOverlayShowWatchdog()
  applyOverlayPriority(overlayWindow)
  if (!overlayWindow.isVisible()) {
    diagLog(`[overlay] show (${reason})`)
    overlayWindow.showInactive()
  }
  overlayShown = true
  startOverlayTopmostReassert()
}

function startOverlayTopmostReassert() {
  if (overlayTopmostTimer) {
    return
  }
  overlayTopmostTimer = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      stopOverlayTopmostReassert()
      return
    }
    if (overlayWindow.isVisible() && !overlayWindow.isAlwaysOnTop()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }, OVERLAY_TOPMOST_REASSERT_MS)
  overlayTopmostTimer.unref()
}

function stopOverlayTopmostReassert() {
  if (overlayTopmostTimer) {
    clearInterval(overlayTopmostTimer)
    overlayTopmostTimer = null
  }
}

/**
 * Last-resort visible surface. Without this a failed renderer load leaves a frameless,
 * taskbar-less, invisible window and the user has no way to tell the app is broken.
 */
function overlayFallbackHtml(message: string): string {
  const safe = message.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;background:#060f0c;color:#e8f3ee;
    font:13px/1.5 "Segoe UI",system-ui,sans-serif}
  .wrap{padding:14px;-webkit-app-region:drag}
  h1{margin:0 0 8px;font-size:14px;color:#f07167;letter-spacing:.04em}
  p{margin:0 0 8px;color:#7fa896}
  code{color:#1dd4a8;word-break:break-all}
</style></head><body><div class="wrap">
<h1>Overlay failed to load</h1>
<p>${safe}</p>
<p>Press <code>Insert</code> / <code>F9</code> to hide, or use <b>Reset overlay</b> in the main window.</p>
<p>Log: <code>${diagnosticsLogPath().replace(/[&<>]/g, '')}</code></p>
</div></body></html>`
}

function showOverlayLoadFailure(message: string) {
  // `did-fail-load` fires for the fallback page too; never re-enter and loop.
  if (overlayLoadError != null) {
    diagLog('[overlay] additional load failure (already in fallback):', message)
    return
  }
  overlayLoadError = message
  diagLog('[overlay] load failure:', message)
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }
  void overlayWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(overlayFallbackHtml(message))
  )
  // Make a broken overlay findable instead of an invisible ghost window.
  overlayWindow.setSkipTaskbar(false)
  showOverlay('load-failure')
  mainWindow?.webContents.send('overlay:loadError', { message })
}

function setOverlayProjectionMode(open: boolean): { ok: boolean; open: boolean } {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: false, open: false }
  }
  if (open === overlayProjectionOpen) {
    return { ok: true, open: overlayProjectionOpen }
  }
  applyOverlayPriority(overlayWindow)
  if (open) {
    overlayCompactBounds = overlayWindow.getBounds()
    const display = screen.getDisplayMatching(overlayCompactBounds)
    const work = display.workArea
    const maxW = Math.max(320, work.width - 48)
    const maxH = Math.max(240, work.height - 48)
    const minW = Math.min(900, maxW)
    const minH = Math.min(560, maxH)
    const targetW = Math.min(Math.max(minW, Math.floor(work.width * 0.72)), maxW)
    const targetH = Math.min(Math.max(minH, Math.floor(work.height * 0.74)), maxH)
    // Set before `setBounds` so the resulting resize/moved events never persist the big rect.
    overlayProjectionOpen = true
    overlayWindow.setMinimumSize(minW, minH)
    overlayWindow.setBounds(
      {
        width: targetW,
        height: targetH,
        x: work.x + Math.max(24, Math.floor((work.width - targetW) / 2)),
        y: work.y + Math.max(24, Math.floor((work.height - targetH) / 2))
      },
      true
    )
    showOverlay('projection-open')
    return { ok: true, open: true }
  }

  overlayWindow.setMinimumSize(320, 200)
  if (overlayCompactBounds) {
    overlayWindow.setBounds(clampOverlayBounds(overlayCompactBounds), true)
  }
  overlayProjectionOpen = false
  showOverlay('projection-close')
  return { ok: true, open: false }
}

/**
 * Set by `electron-vite` after the Vite server listens — must not guess a port.
 * @see node_modules/electron-vite (createServer sets process.env.ELECTRON_RENDERER_URL)
 */
function devRendererBase(): string {
  const u = process.env['ELECTRON_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL']
  if (!u) {
    console.error(
      '[drafter] ELECTRON_RENDERER_URL missing. Start with: npm run dev (not raw electron on out/main).'
    )
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(fallbackDevHtml())
  }
  return u.replace(/\/$/, '')
}

function fallbackDevHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nexus Draft</title>
  <style>body{font-family:system-ui;padding:24px;background:#060f0c;color:#e8f3ee;max-width:560px}</style>
  </head><body>
  <h1>Dev server URL missing</h1>
  <p>Run <code>npm run dev</code> from the project root so <code>electron-vite</code> can set <code>ELECTRON_RENDERER_URL</code>.</p>
  <p>Ensure Vite is running (usually on port 5173 or the next free port) and you started with <code>npm run dev</code> from the project root.</p>
  </body></html>`
}

/**
 * The overlay is the product; the big window is the settings/lab surface behind it.
 * Launch shows only the overlay and keeps this window alive but hidden, because the
 * renderer here owns the draft engine that feeds the overlay.
 */
function setMainWindowVisible(visible: boolean): { ok: true; visible: boolean } {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (visible) {
      createMainWindow()
      mainWindow?.show()
      mainWindow?.focus()
    }
    return { ok: true, visible }
  }
  if (visible) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  } else {
    mainWindow.hide()
    // Never leave the user with nothing on screen.
    if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) {
      showOverlay('main-collapsed')
    }
  }
  diagLog(`[main-window] ${visible ? 'shown' : 'hidden'}`)
  return { ok: true, visible }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    // Hidden at launch: the overlay is the front door.
    show: false,
    frame: false,
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
    title: APP_DISPLAY_NAME,
    backgroundColor: '#060f0c',
    icon: windowIconPath(),
    webPreferences: defaultWebPreferences()
  })
  mainWindow.setMenuBarVisibility(false)
  wireNavigationGuards(mainWindow.webContents, 'main')
  wirePreloadErrorLogging(mainWindow, 'main')
  wireWebContentsStabilityLogging(mainWindow.webContents, 'main')
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log('[drafter] ELECTRON_RENDERER_URL =', process.env['ELECTRON_RENDERER_URL'] ?? '(unset)')
    const url = devRendererBase()
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
      console.error('[drafter] main did-fail-load', { code, desc, failedUrl, expected: url })
      if (isDev) {
        void mainWindow?.webContents.openDevTools({ mode: 'detach' })
        void dialog.showErrorBox(
          'Nexus Draft - page failed to load',
          `The UI could not be loaded (Vite may not be running, or a firewall blocked localhost).\n\n${desc} (${String(
            code
          )})\n${failedUrl}\n\nFrom the project folder run: npm run dev`
        )
      }
    })
    void mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(_dirname, '../renderer/index.html'))
  }
  if (isDev && process.env['ELECTRON_OPEN_DEVTOOLS'] === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      void mainWindow?.webContents.openDevTools({ mode: 'detach' })
    })
  }
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (isDev) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.webContents
            .executeJavaScript("typeof globalThis.drafter", true)
            .then((t) => {
              // eslint-disable-next-line no-console
              console.log('[drafter] dev check main window: typeof drafter =', t)
            })
            .catch((e) => {
              // eslint-disable-next-line no-console
              console.error('[drafter] dev check main failed', e)
            })
        }
      }, 200)
    })
  }
}

function createOverlayWindow() {
  const startBounds = initialOverlayBounds()
  overlayShown = false
  overlayLoadError = null
  diagLog('[overlay] creating window', startBounds)
  overlayWindow = new BrowserWindow({
    title: 'Nexus Draft Overlay',
    width: startBounds.width,
    height: startBounds.height,
    x: startBounds.x,
    y: startBounds.y,
    frame: false,
    /**
     * `transparent: true` on Windows often composes to a solid black webview. Use a solid background;
     * the UI still uses a glassy panel in CSS.
     */
    transparent: false,
    backgroundColor: '#060f0c',
    resizable: true,
    minHeight: 200,
    minWidth: 320,
    alwaysOnTop: true,
    skipTaskbar: true,
    /** Show with `ready-to-show` + `showInactive` so the game/client keeps input focus. */
    show: false,
    icon: windowIconPath(),
    webPreferences: defaultWebPreferences()
  })
  applyOverlayPriority(overlayWindow)
  wireNavigationGuards(overlayWindow.webContents, 'overlay')
  wirePreloadErrorLogging(overlayWindow, 'overlay')
  wireWebContentsStabilityLogging(overlayWindow.webContents, 'overlay')

  overlayWindow.once('ready-to-show', () => {
    showOverlay('ready-to-show')
  })

  /**
   * Belt and braces: if first paint never happens the overlay used to stay hidden forever
   * (no frame, no taskbar entry, no error). Show it anyway and log why.
   */
  clearOverlayShowWatchdog()
  overlayShowWatchdog = setTimeout(() => {
    overlayShowWatchdog = null
    if (overlayShown || !overlayWindow || overlayWindow.isDestroyed()) {
      return
    }
    diagLog(
      `[overlay] ready-to-show did not fire within ${OVERLAY_SHOW_WATCHDOG_MS}ms; forcing show`,
      { url: overlayWindow.webContents.getURL(), loading: overlayWindow.webContents.isLoading() }
    )
    showOverlay('watchdog')
  }, OVERLAY_SHOW_WATCHDOG_MS)
  overlayShowWatchdog.unref()

  // Registered for dev *and* production — a silent packaged failure is the bug we are fixing.
  overlayWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED, fired on normal navigations */) {
      return
    }
    diagLog('[overlay] did-fail-load', { code, desc, failedUrl })
    if (isDev) {
      void overlayWindow?.webContents.openDevTools({ mode: 'detach' })
      void dialog.showErrorBox(
        'Nexus Draft - overlay failed to load',
        `${String(desc)} (${String(code)})\n${failedUrl}\n\nRun: npm run dev (same dev server as the main window).`
      )
      return
    }
    showOverlayLoadFailure(`${desc} (${code})`)
  })

  overlayWindow.webContents.on('did-finish-load', () => {
    diagLog('[overlay] did-finish-load', overlayWindow?.webContents.getURL() ?? '(gone)')
  })

  /** A crashed overlay renderer must not leave an invisible husk behind. */
  overlayWindow.webContents.on('render-process-gone', (_event, details) => {
    diagLog('[overlay] render-process-gone', details.reason, details.exitCode)
    showOverlayLoadFailure(`Overlay renderer stopped (${details.reason}).`)
  })

  if (isDev) {
    void overlayWindow.loadURL(`${devRendererBase()}#/overlay`)
  } else {
    const file = join(_dirname, '../renderer/index.html')
    if (!existsSync(file)) {
      diagLog('[overlay] renderer entry missing', file)
      showOverlayLoadFailure(`Missing UI file: ${file}`)
    } else {
      const target = pathToFileURL(file).href + '#/overlay'
      diagLog('[overlay] loading', target)
      overlayWindow.loadURL(target).catch((err: unknown) => {
        showOverlayLoadFailure(err instanceof Error ? err.message : String(err))
      })
    }
  }

  overlayWindow.on('moved', queueOverlayBoundsSave)
  overlayWindow.on('resize', queueOverlayBoundsSave)

  overlayWindow.on('closed', () => {
    clearOverlayShowWatchdog()
    stopOverlayTopmostReassert()
    overlayWindow = null
    overlayCompactBounds = null
    overlayProjectionOpen = false
    overlayShown = false
  })

  if (isDev) {
    overlayWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          void overlayWindow.webContents
            .executeJavaScript("typeof globalThis.drafter", true)
            .then((t) => {
              // eslint-disable-next-line no-console
              console.log('[drafter] dev check overlay: typeof drafter =', t)
            })
            .catch((e) => {
              // eslint-disable-next-line no-console
              console.error('[drafter] dev check overlay failed', e)
            })
        }
      }, 200)
    })
  }

  if (isDev && process.env['LEAGUE_DRAFTER_OVERLAY_DEVTOOLS'] === '1') {
    void overlayWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function toggleOverlayWindow() {
  let created = false
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isVisible()) {
      diagLog('[overlay] hide (toggle)')
      overlayWindow.hide()
      stopOverlayTopmostReassert()
      /*
       * With the main window hidden by default, hiding the overlay could leave zero visible
       * windows — and if the hotkey is the one that failed to register, no way back in.
       */
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
        if (registeredOverlayShortcuts.length === 0) {
          diagLog('[overlay] hidden with no working hotkey; surfacing the main window instead')
          setMainWindowVisible(true)
        }
      }
    } else {
      showOverlay('toggle')
    }
  } else {
    createOverlayWindow()
    created = true
  }
  return {
    ok: true as const,
    visible: overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.isVisible() : false,
    created,
    route: 'overlay' as const
  }
}

/**
 * (Re)binds the overlay toggle keys. Unregisters whatever we held first so switching
 * hotkeys at runtime cannot leak a stale binding.
 */
function applyOverlayHotkeys(next: string[]): { registered: string[]; failed: string[] } {
  for (const accelerator of registeredOverlayShortcuts) {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator)
    }
  }
  registeredOverlayShortcuts = []
  failedOverlayShortcuts = []

  for (const accelerator of next) {
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, () => {
        toggleOverlayWindow()
      })
    } catch (error) {
      diagLog(`[drafter] globalShortcut threw for ${accelerator}:`, error)
      ok = false
    }
    if (ok) {
      registeredOverlayShortcuts.push(accelerator)
      diagLog(`[drafter] globalShortcut ok: ${accelerator}`)
    } else {
      failedOverlayShortcuts.push(accelerator)
      diagLog(`[drafter] globalShortcut FAILED: ${accelerator} (another app owns that key)`)
    }
  }
  if (registeredOverlayShortcuts.length === 0) {
    diagLog(
      '[drafter] no overlay hotkeys registered — pick a different key in Settings, or use the in-app toggle'
    )
  }
  // Both windows render the active key, so broadcast rather than target the main window.
  const payload = { registered: registeredOverlayShortcuts, failed: failedOverlayShortcuts }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('overlay:hotkeysChanged', payload)
    }
  }
  return payload
}

/**
 * Recovery for "the overlay is gone and nothing brings it back": forget saved geometry,
 * rebuild the window from scratch, and park it at the default on-screen spot.
 */
function resetOverlayWindow() {
  diagLog('[overlay] reset requested')
  clearOverlayBounds()
  if (overlayBoundsSaveTimer) {
    clearTimeout(overlayBoundsSaveTimer)
    overlayBoundsSaveTimer = null
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
  overlayCompactBounds = null
  overlayProjectionOpen = false
  createOverlayWindow()
  // Do not wait on `ready-to-show`; a reset must produce a visible window promptly.
  showOverlay('reset')
  return {
    ok: true as const,
    bounds: overlayWindow ? (overlayWindow as BrowserWindow).getBounds() : defaultOverlayBounds()
  }
}

function sendDraftToOverlay(payload: DraftUpdate) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('draft:update', payload)
  }
}

app.whenReady().then(() => {
  loadLocalEnvWhenReady()
  const preloadFile = absolutePreloadPath()
  if (!existsSync(preloadFile)) {
    void dialog.showErrorBox(
      'Nexus Draft - missing preload',
      `Expected preload at:\n${preloadFile}\n\n` +
        'Run: npm run dev\n' +
        '(or npm run build, then start via electron-vite’s output — not a bare "electron" on stale files).'
    )
    app.quit()
    return
  }
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log('[drafter] preload path:', preloadFile)
  }
  setupAppUpdater(isDev)

  ipcMain.handle('capture:listSources', async () => {
    const src = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      fetchWindowIcons: true,
      thumbnailSize: { width: 200, height: 120 }
    })
    return src.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      thumbnailDataUrl: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null
    }))
  })

  ipcMain.handle('settings:getCaptureSourceId', () => getCaptureSourceId())
  ipcMain.handle('settings:setCaptureSourceId', (_e, id: string | null) => {
    setCaptureSourceId(id)
  })


  /**
   * Trained-effects bundle (from `npm run train:export`).
   * Kept in main so both windows can `invoke('training:getEffects')` and re-receive it
   * via `training:update` when the JSON is rewritten by another `train:export` run.
   */
  let currentTrainedLoad: TrainedEffectsLoad = loadTrainedEffectsFromDisk()
  if (isDev) {
    if (currentTrainedLoad.ok) {
      console.log('[drafter] trained effects loaded from', currentTrainedLoad.path)
    } else {
      console.log('[drafter] trained effects not loaded:', currentTrainedLoad.error)
    }
  }
  const broadcastTrainedEffects = (payload: TrainedEffectsLoad) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('training:update', payload)
      }
    }
  }
  const unwatchTrained = watchTrainedEffects((next) => {
    currentTrainedLoad = next
    broadcastTrainedEffects(next)
    if (isDev) {
      console.log(
        '[drafter] trained effects reloaded',
        next.ok ? `(${next.path})` : `(error: ${next.error})`
      )
    }
  })
  app.on('before-quit', () => {
    try {
      unwatchTrained()
    } catch {
      /* ignore */
    }
  })
  ipcMain.handle('training:getEffects', () => currentTrainedLoad)

  ipcMain.on('draft:publish', (_event, raw: unknown) => {
    if (!isDraftUpdate(raw)) {
      const now = Date.now()
      if (now - lastInvalidDraftPublishWarnMs >= INVALID_DRAFT_PUBLISH_WARN_EVERY_MS) {
        lastInvalidDraftPublishWarnMs = now
        console.warn(
          '[drafter] invalid draft:publish; ignored (further messages suppressed for 5s while invalid)'
        )
      }
      return
    }
    sendDraftToOverlay(raw)
  })

  ipcMain.handle('overlay:setEnginePrefs', (_event, raw: unknown) => {
    if (!isOverlayEnginePrefsPatch(raw)) {
      return { ok: false as const }
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false as const }
    }
    mainWindow.webContents.send('overlay:enginePrefs', raw)
    return { ok: true as const }
  })

  ipcMain.handle('lcu:fetch', async () => {
    return fetchChampSelectSession()
  })
  ipcMain.handle('lcu:diagnostics', () => {
    return getLcuDiagnostics()
  })
  ipcMain.handle('publicMeta:getLive', async () => {
    return fetchLivePublicDataPayload()
  })
  ipcMain.handle('riot:playerChampionPool', async (_event, raw: unknown) => {
    return getPlayerChampionPool(raw)
  })
  ipcMain.handle('overlay:importPlayerChampionPool', async (_event, raw: unknown) => {
    const result = await getPlayerChampionPool(raw)
    if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay:playerChampionPoolImported', result)
    }
    return result
  })

  ipcMain.handle('overlay:toggle', () => {
    return toggleOverlayWindow()
  })
  ipcMain.handle('overlay:reset', () => {
    return resetOverlayWindow()
  })
  ipcMain.handle('overlay:status', () => {
    return overlayStatusResult()
  })
  /** Everything needed to explain "the overlay is not showing" without a dev build. */
  ipcMain.handle('overlay:diagnostics', () => {
    const win = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
    return {
      ok: true as const,
      exists: win != null,
      visible: win?.isVisible() ?? false,
      alwaysOnTop: win?.isAlwaysOnTop() ?? false,
      bounds: win?.getBounds() ?? null,
      savedBounds: getOverlayBounds(),
      url: win?.webContents.getURL() ?? null,
      loadError: overlayLoadError,
      shortcutsRegistered: registeredOverlayShortcuts,
      shortcutsFailed: failedOverlayShortcuts,
      displays: screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, scale: d.scaleFactor })),
      logPath: diagnosticsLogPath(),
      recent: recentDiagnostics(60)
    }
  })
  ipcMain.handle('overlay:openLogFolder', () => {
    void shell.showItemInFolder(diagnosticsLogPath())
    return { ok: true as const }
  })
  ipcMain.handle('overlay:shortcutsStatus', () => {
    return {
      ok: failedOverlayShortcuts.length === 0,
      registered: registeredOverlayShortcuts,
      failed: failedOverlayShortcuts,
      configured: getOverlayHotkeys(),
      defaults: [...DEFAULT_OVERLAY_HOTKEYS]
    }
  })
  /** Rebind the overlay toggle keys. `null`/empty restores the defaults. */
  ipcMain.handle('overlay:setHotkeys', (_event, raw: unknown) => {
    const requested = Array.isArray(raw) ? raw : []
    const invalid = requested.filter((v) => !isValidAccelerator(v))
    if (invalid.length) {
      return {
        ok: false as const,
        error: `Not a usable key: ${invalid.map(String).join(', ')}`,
        registered: registeredOverlayShortcuts,
        failed: failedOverlayShortcuts,
        configured: getOverlayHotkeys(),
        defaults: [...DEFAULT_OVERLAY_HOTKEYS]
      }
    }
    const stored = setOverlayHotkeys(requested)
    const result = applyOverlayHotkeys(stored)
    return {
      ok: result.registered.length > 0,
      error:
        result.registered.length > 0
          ? undefined
          : 'Windows would not give us that key — another app already owns it. Try another.',
      registered: result.registered,
      failed: result.failed,
      configured: stored,
      defaults: [...DEFAULT_OVERLAY_HOTKEYS]
    }
  })
  ipcMain.handle('overlay:setProjectionMode', (_event, open: unknown) => {
    return setOverlayProjectionMode(open === true)
  })
  ipcMain.handle('app:close', () => {
    app.quit()
    return { ok: true as const }
  })
  ipcMain.handle('app:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
    return { ok: true as const }
  })
  ipcMain.handle('mainWindow:show', () => setMainWindowVisible(true))
  ipcMain.handle('mainWindow:hide', () => setMainWindowVisible(false))
  ipcMain.handle('mainWindow:toggle', () => {
    const visible = mainWindow != null && !mainWindow.isDestroyed() && mainWindow.isVisible()
    return setMainWindowVisible(!visible)
  })
  ipcMain.handle('mainWindow:status', () => ({
    ok: true as const,
    visible: mainWindow != null && !mainWindow.isDestroyed() && mainWindow.isVisible()
  }))

  createMainWindow()
  createOverlayWindow()

  /** REST-only LCU poll; pick intent + locks refresh faster during champ select. */
  const LCU_POLL_MS = 400
  const sendLcuToMain = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    void fetchChampSelectSession()
      .then((r) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return
        }
        mainWindow.webContents.send('lcu:champ-select', r)
      })
      .catch(() => {
        /* ignore */
      })
  }
  sendLcuToMain()
  const lcuTimer = setInterval(sendLcuToMain, LCU_POLL_MS)
  lcuTimer.unref()

  applyOverlayHotkeys(getOverlayHotkeys())
})

app.on('child-process-gone', (_event, details) => {
  console.error(
    '[drafter] child-process-gone:',
    details.type,
    'reason=',
    details.reason,
    'exitCode=',
    details.exitCode
  )
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
