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
import { getCaptureSourceId, setCaptureSourceId } from './settingsStore'
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

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let overlayCompactBounds: Rectangle | null = null
let overlayProjectionOpen = false
let registeredOverlayShortcuts: string[] = []
let failedOverlayShortcuts: string[] = []

function overlayStatusResult() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: true as const, exists: false, visible: false }
  }
  return {
    ok: true as const,
    exists: true,
    visible: overlayWindow.isVisible(),
    focused: overlayWindow.isFocused(),
    title: overlayWindow.getTitle(),
    bounds: overlayWindow.getBounds()
  }
}

function applyOverlayPriority(win: BrowserWindow) {
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
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
    overlayProjectionOpen = true
    overlayWindow.showInactive()
    return { ok: true, open: true }
  }

  overlayWindow.setMinimumSize(320, 200)
  if (overlayCompactBounds) {
    overlayWindow.setBounds(overlayCompactBounds, true)
  }
  overlayProjectionOpen = false
  overlayWindow.showInactive()
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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
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
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const overlayH = Math.max(320, Math.floor(height * 0.62))
  overlayWindow = new BrowserWindow({
    title: 'Nexus Draft Overlay',
    width: OVERLAY_WIDTH,
    height: overlayH,
    x: width - OVERLAY_WIDTH - 16,
    y: 24,
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
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      applyOverlayPriority(overlayWindow)
      overlayWindow.showInactive()
    }
  })
  if (isDev) {
    const base = devRendererBase()
    overlayWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
      console.error('[drafter] overlay did-fail-load', { code, desc, failedUrl, base })
      if (isDev) {
        void overlayWindow?.webContents.openDevTools({ mode: 'detach' })
        void dialog.showErrorBox(
          'Nexus Draft - overlay failed to load',
          `${String(desc)} (${String(code)})\n${failedUrl}\n\nRun: npm run dev (same dev server as the main window).`
        )
      }
    })
    void overlayWindow.loadURL(`${base}#/overlay`)
  } else {
    const file = join(_dirname, '../renderer/index.html')
    void overlayWindow.loadURL(pathToFileURL(file).href + '#/overlay')
  }
  overlayWindow.on('closed', () => {
    overlayWindow = null
    overlayCompactBounds = null
    overlayProjectionOpen = false
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
      overlayWindow.hide()
    } else {
      applyOverlayPriority(overlayWindow)
      overlayWindow.showInactive()
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
  ipcMain.handle('overlay:status', () => {
    return overlayStatusResult()
  })
  ipcMain.handle('overlay:shortcutsStatus', () => {
    return {
      ok: failedOverlayShortcuts.length === 0,
      registered: registeredOverlayShortcuts,
      failed: failedOverlayShortcuts
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

  const shortcuts = ['Insert', 'F9', 'F10'] as const
  registeredOverlayShortcuts = []
  failedOverlayShortcuts = []
  for (const accelerator of shortcuts) {
    if (globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator)
    }
    const ok = globalShortcut.register(accelerator, () => {
      toggleOverlayWindow()
    })
    if (ok) {
      registeredOverlayShortcuts.push(accelerator)
      if (isDev) {
        console.log(`[drafter] globalShortcut ok: ${accelerator}`)
      }
    } else {
      failedOverlayShortcuts.push(accelerator)
      console.error(
        `[drafter] globalShortcut FAILED: ${accelerator} (try another app using that key, or use F9 / F10 / in-app button)`
      )
    }
  }
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
