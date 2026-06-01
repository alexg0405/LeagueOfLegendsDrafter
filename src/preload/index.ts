import { contextBridge, ipcRenderer } from 'electron'
import type { AppUpdateCheckResult, AppUpdateStatus } from '../shared/appUpdate'
import type { PlayerChampionPoolRequest, PlayerChampionPoolResponse } from '../shared/draft'
import type { OverlayEnginePrefsPatch } from '../shared/draft/types'
import type { LcuChampSelectResult } from '../shared/draft/lcuTypes'
import type {
  LcuDiagnosticResult,
  OverlayShortcutStatusResult,
  OverlayStatusResult,
  OverlayToggleResult
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
  getLivePublicData: () =>
    ipcRenderer.invoke('publicMeta:getLive') as Promise<
      | { ok: true; manifest: unknown; metaSeed: unknown; synergySeed: unknown }
      | { ok: false; error: string }
    >,
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
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status') as Promise<OverlayStatusResult>,
  getOverlayShortcutStatus: () =>
    ipcRenderer.invoke('overlay:shortcutsStatus') as Promise<OverlayShortcutStatusResult>,
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
