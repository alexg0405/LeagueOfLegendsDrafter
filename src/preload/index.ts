import { contextBridge, ipcRenderer } from 'electron'
import type { AppUpdateCheckResult, AppUpdateStatus } from '../shared/appUpdate'
import type { PlayerChampionPoolRequest, PlayerChampionPoolResponse } from '../shared/draft'
import type { OverlayEnginePrefsPatch } from '../shared/draft/types'
import type { LcuChampSelectResult } from '../shared/draft/lcuTypes'
import type { LiveGameStatus } from '../shared/draft/liveGame'
import type { OverlayLayout, OverlayLayoutState } from '../shared/overlayLayout'
import type {
  LcuDiagnosticResult,
  OverlayDiagnosticsResult,
  OverlayResetResult,
  OverlayShortcutStatusResult,
  OverlayStatusResult,
  OverlayPositionRequest,
  OverlayPositionStatus,
  OverlayToggleResult,
  PeekSettingsPatch,
  PeekStatus
} from '../shared/desktopInterop'

const api = {
  listCaptureSources: () =>
    ipcRenderer.invoke('capture:listSources') as Promise<
      Array<{
        id: string
        name: string
        display_id?: string
        thumbnailDataUrl: string | null
      }>
    >,
  getCaptureSourceId: () =>
    ipcRenderer.invoke('settings:getCaptureSourceId') as Promise<string | null>,
  setCaptureSourceId: (id: string | null) =>
    ipcRenderer.invoke('settings:setCaptureSourceId', id) as Promise<void>,

  /** Push draft state to the overlay. */
  publishDraft: (p: unknown) => {
    ipcRenderer.send('draft:publish', p)
  },
  onDraftUpdate: (cb: (p: unknown) => void) => {
    const handler = (_: unknown, p: unknown) => {
      cb(p)
    }
    ipcRenderer.on('draft:update', handler)
    return () => {
      ipcRenderer.removeListener('draft:update', handler)
    }
  },

  /** Overlay → main window: tweak suggestion role / sort / Monte Carlo without opening Operations. */
  setOverlayEnginePrefs: (patch: OverlayEnginePrefsPatch) =>
    ipcRenderer.invoke('overlay:setEnginePrefs', patch) as Promise<{ ok: boolean }>,
  onOverlayEnginePrefs: (cb: (patch: OverlayEnginePrefsPatch) => void) => {
    const handler = (_: unknown, p: unknown) => {
      cb(p as OverlayEnginePrefsPatch)
    }
    ipcRenderer.on('overlay:enginePrefs', handler)
    return () => {
      ipcRenderer.removeListener('overlay:enginePrefs', handler)
    }
  },

  lcuFetch: () => ipcRenderer.invoke('lcu:fetch') as Promise<LcuChampSelectResult>,
  getLcuDiagnostics: () => ipcRenderer.invoke('lcu:diagnostics') as Promise<LcuDiagnosticResult>,
  /** Pass the build data you already hold so main skips downloading an identical copy. */
  getLivePublicData: (have?: { buildsPatch?: string | null; buildsUpdatedAt?: string | null }) =>
    ipcRenderer.invoke('publicMeta:getLive', have ?? null) as Promise<
      | { ok: true; manifest: unknown; metaSeed: unknown; synergySeed: unknown; buildSeed?: unknown }
      | { ok: false; error: string }
    >,
  /** In-game peek key (Caps Lock by default) that shows the overlay's Build tab. */
  getPeekStatus: () => ipcRenderer.invoke('overlay:peekStatus') as Promise<PeekStatus>,
  setPeekSettings: (patch: PeekSettingsPatch) => ipcRenderer.invoke('overlay:setPeek', patch) as Promise<PeekStatus>,
  onPeekStatus: (cb: (status: PeekStatus) => void) => {
    const handler = (_: unknown, status: PeekStatus) => {
      cb(status)
    }
    ipcRenderer.on('overlay:peekStatusChanged', handler)
    return () => {
      ipcRenderer.removeListener('overlay:peekStatusChanged', handler)
    }
  },
  /** Champ select and in game each remember their own overlay spot; presets move it. */
  getOverlayPosition: () => ipcRenderer.invoke('overlay:position') as Promise<OverlayPositionStatus>,
  setOverlayPosition: (req: OverlayPositionRequest) =>
    ipcRenderer.invoke('overlay:setPosition', req) as Promise<OverlayPositionStatus>,
  /** In-game layout: which sections show in the main overlay vs floating boxes. */
  getOverlayLayout: () => ipcRenderer.invoke('overlay:layout') as Promise<OverlayLayoutState>,
  setOverlayLayout: (layout: OverlayLayout) => ipcRenderer.invoke('overlay:setLayout', layout) as Promise<OverlayLayoutState>,
  /** Show boxes (with placeholders when no game is running) so they can be dragged into place. */
  setArrangeBoxes: (arranging: boolean) => ipcRenderer.invoke('overlay:arrangeBoxes', arranging) as Promise<OverlayLayoutState>,
  onOverlayLayout: (cb: (state: OverlayLayoutState) => void) => {
    const handler = (_: unknown, state: OverlayLayoutState) => {
      cb(state)
    }
    ipcRenderer.on('overlay:layoutChanged', handler)
    return () => {
      ipcRenderer.removeListener('overlay:layoutChanged', handler)
    }
  },
  /** Overlay, in game: report the height the Build tab needs so the window hugs it. */
  fitOverlayHeight: (height: number) => {
    ipcRenderer.send('overlay:fitHeight', height)
  },
  /** Box windows: report content height so the window hugs it. */
  fitBox: (height: number) => {
    ipcRenderer.send('box:fit', height)
  },
  /** Main -> overlay: peek started/ended during a game. */
  onOverlayPeek: (cb: (payload: { active: boolean }) => void) => {
    const handler = (_: unknown, payload: { active: boolean }) => {
      cb(payload)
    }
    ipcRenderer.on('overlay:peek', handler)
    return () => {
      ipcRenderer.removeListener('overlay:peek', handler)
    }
  },
  /** Riot Live Client Data API (in-game items/levels/KDA), polled by the main process. */
  getLiveGame: () => ipcRenderer.invoke('livegame:get') as Promise<LiveGameStatus>,
  onLiveGameUpdate: (cb: (status: LiveGameStatus) => void) => {
    const handler = (_: unknown, status: LiveGameStatus) => {
      cb(status)
    }
    ipcRenderer.on('livegame:update', handler)
    return () => {
      ipcRenderer.removeListener('livegame:update', handler)
    }
  },
  getPlayerChampionPool: (request: PlayerChampionPoolRequest) =>
    ipcRenderer.invoke('riot:playerChampionPool', request) as Promise<PlayerChampionPoolResponse>,
  importPlayerChampionPoolFromOverlay: (request: PlayerChampionPoolRequest) =>
    ipcRenderer.invoke('overlay:importPlayerChampionPool', request) as Promise<PlayerChampionPoolResponse>,
  onOverlayPlayerChampionPoolImported: (cb: (response: PlayerChampionPoolResponse) => void) => {
    const handler = (_: unknown, response: PlayerChampionPoolResponse) => {
      cb(response)
    }
    ipcRenderer.on('overlay:playerChampionPoolImported', handler)
    return () => {
      ipcRenderer.removeListener('overlay:playerChampionPoolImported', handler)
    }
  },

  onLcuChampSelect: (cb: (p: LcuChampSelectResult) => void) => {
    const handler = (_: unknown, p: LcuChampSelectResult) => {
      cb(p)
    }
    ipcRenderer.on('lcu:champ-select', handler)
    return () => {
      ipcRenderer.removeListener('lcu:champ-select', handler)
    }
  },

  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle') as Promise<OverlayToggleResult>,
  /** Forget saved geometry and rebuild the overlay at a guaranteed on-screen position. */
  resetOverlay: () => ipcRenderer.invoke('overlay:reset') as Promise<OverlayResetResult>,
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status') as Promise<OverlayStatusResult>,
  getOverlayDiagnostics: () =>
    ipcRenderer.invoke('overlay:diagnostics') as Promise<OverlayDiagnosticsResult>,
  openOverlayLogFolder: () => ipcRenderer.invoke('overlay:openLogFolder') as Promise<{ ok: true }>,
  onOverlayLoadError: (cb: (payload: { message: string }) => void) => {
    const handler = (_: unknown, payload: { message: string }) => {
      cb(payload)
    }
    ipcRenderer.on('overlay:loadError', handler)
    return () => {
      ipcRenderer.removeListener('overlay:loadError', handler)
    }
  },
  getOverlayShortcutStatus: () =>
    ipcRenderer.invoke('overlay:shortcutsStatus') as Promise<OverlayShortcutStatusResult>,
  /** Rebind the overlay toggle keys; pass [] to restore Insert / F9 / F10. */
  setOverlayHotkeys: (accelerators: string[]) =>
    ipcRenderer.invoke('overlay:setHotkeys', accelerators) as Promise<OverlayShortcutStatusResult>,
  onOverlayHotkeysChanged: (cb: (status: { registered: string[]; failed: string[] }) => void) => {
    const handler = (_: unknown, status: { registered: string[]; failed: string[] }) => {
      cb(status)
    }
    ipcRenderer.on('overlay:hotkeysChanged', handler)
    return () => {
      ipcRenderer.removeListener('overlay:hotkeysChanged', handler)
    }
  },

  /** The big window is hidden at launch; the overlay expands it on demand. */
  showMainWindow: () => ipcRenderer.invoke('mainWindow:show') as Promise<{ ok: true; visible: boolean }>,
  /** Open the main window on Setup (theme, in-game layout). */
  openSettings: () => ipcRenderer.invoke('mainWindow:openSettings') as Promise<{ ok: true; visible: boolean }>,
  takePendingMainView: () => ipcRenderer.invoke('mainWindow:takePendingView') as Promise<'settings' | null>,
  onMainNavigate: (cb: (payload: { view: 'settings' }) => void) => {
    const handler = (_: unknown, payload: { view: 'settings' }) => {
      cb(payload)
    }
    ipcRenderer.on('mainWindow:navigate', handler)
    return () => {
      ipcRenderer.removeListener('mainWindow:navigate', handler)
    }
  },
  hideMainWindow: () => ipcRenderer.invoke('mainWindow:hide') as Promise<{ ok: true; visible: boolean }>,
  toggleMainWindow: () => ipcRenderer.invoke('mainWindow:toggle') as Promise<{ ok: true; visible: boolean }>,
  getMainWindowStatus: () =>
    ipcRenderer.invoke('mainWindow:status') as Promise<{ ok: true; visible: boolean }>,
  setOverlayProjectionMode: (open: boolean) =>
    ipcRenderer.invoke('overlay:setProjectionMode', open) as Promise<{ ok: boolean; open: boolean }>,
  closeApp: () => ipcRenderer.invoke('app:close') as Promise<{ ok: true }>,
  minimizeApp: () => ipcRenderer.invoke('app:minimize') as Promise<{ ok: true }>,
  checkForAppUpdate: () => ipcRenderer.invoke('appUpdate:check') as Promise<AppUpdateCheckResult>,
  downloadAppUpdate: () => ipcRenderer.invoke('appUpdate:download') as Promise<AppUpdateCheckResult>,
  quitAndInstallAppUpdate: () => ipcRenderer.invoke('appUpdate:quitAndInstall') as Promise<AppUpdateCheckResult>,
  onAppUpdateStatus: (cb: (status: AppUpdateStatus) => void) => {
    const handler = (_: unknown, status: AppUpdateStatus) => {
      cb(status)
    }
    ipcRenderer.on('appUpdate:status', handler)
    return () => {
      ipcRenderer.removeListener('appUpdate:status', handler)
    }
  },

  /** Trained-effects JSON from `npm run train:export`; returns the raw bundle or a load error. */
  getTrainedEffects: () =>
    ipcRenderer.invoke('training:getEffects') as Promise<
      { ok: true; path: string; raw: unknown } | { ok: false; path: string; error: string }
    >,
  onTrainedEffectsUpdate: (
    cb: (p: { ok: true; path: string; raw: unknown } | { ok: false; path: string; error: string }) => void
  ) => {
    const handler = (
      _: unknown,
      p: { ok: true; path: string; raw: unknown } | { ok: false; path: string; error: string }
    ) => {
      cb(p)
    }
    ipcRenderer.on('training:update', handler)
    return () => {
      ipcRenderer.removeListener('training:update', handler)
    }
  },
}

try {
  contextBridge.exposeInMainWorld('drafter', api)
  // eslint-disable-next-line no-console
  console.log('[drafter] preload: window.drafter is bound')
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[drafter] preload: contextBridge failed', e)
  throw e
}

export type DrafterPreload = typeof api
