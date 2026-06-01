import type { AppUpdateCheckResult, AppUpdateStatus } from '@shared/appUpdate'
import { parseLcuChampSelectSession } from '@shared/draft/lcuMap'
import type { LcuChampSelectResult } from '@shared/draft/lcuTypes'
import type {
  OverlayEnginePrefsPatch,
  PlayerChampionPoolRequest,
  PlayerChampionPoolResponse
} from '@shared/draft'
import type { DrafterPreload } from '../../../preload'
import { isOverlayRouteFromLocation } from '../route'
import { emitTauriEvent, invokeTauriCommand, listenTauriEvent } from './commands'

type TauriLcuRawResult = {
  lockfileFound: boolean
  lcuReachable: boolean
  rawSession?: unknown
  error: string | null
}

type TrainingLoad = { ok: true; path: string; raw: unknown } | { ok: false; path: string; error: string }

function eventUnlisten<T>(event: string, cb: (payload: T) => void): () => void {
  return listenTauriEvent<T>(event, cb)
}

function lcuResultFromRaw(raw: TauriLcuRawResult): LcuChampSelectResult {
  if (!raw.rawSession) {
    return {
      lockfileFound: raw.lockfileFound,
      lcuReachable: raw.lcuReachable,
      snapshot: null,
      error: raw.error
    }
  }
  try {
    return {
      lockfileFound: raw.lockfileFound,
      lcuReachable: raw.lcuReachable,
      snapshot: parseLcuChampSelectSession(raw.rawSession),
      error: raw.error
    }
  } catch {
    return {
      lockfileFound: raw.lockfileFound,
      lcuReachable: raw.lcuReachable,
      snapshot: null,
      error: 'Invalid JSON from LCU'
    }
  }
}

function installLcuPoll(cb: (payload: LcuChampSelectResult) => void): () => void {
  let stopped = false
  const tick = async () => {
    try {
      const raw = await invokeTauriCommand<TauriLcuRawResult>('lcu_fetch_raw')
      if (!stopped) {
        cb(lcuResultFromRaw(raw))
      }
    } catch (error) {
      if (!stopped) {
        cb({
          lockfileFound: false,
          lcuReachable: false,
          snapshot: null,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
  void tick()
  const timer = window.setInterval(() => {
    void tick()
  }, 400)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

function isOverlayWindow(): boolean {
  return isOverlayRouteFromLocation(window.location)
}

export function installTauriBridge(): void {
  const api: DrafterPreload = {
    listCaptureSources: () => invokeTauriCommand('list_capture_sources'),
    getCaptureSourceId: () => invokeTauriCommand('settings_get_capture_source_id'),
    setCaptureSourceId: (id: string | null) => invokeTauriCommand('settings_set_capture_source_id', { id }),

    publishDraft: (payload: unknown) => {
      void invokeTauriCommand('draft_publish', { payload }).catch(() => {
        void emitTauriEvent('draft:update', payload)
      })
    },
    onDraftUpdate: (cb: (payload: unknown) => void) => {
      const unlisten = eventUnlisten('draft:update', cb)
      if (isOverlayWindow()) {
        window.setTimeout(() => {
          void invokeTauriCommand('overlay_ready').catch(() => {
            /* The next live draft publish will refresh the overlay. */
          })
        }, 0)
      }
      return unlisten
    },

    setOverlayEnginePrefs: async (patch: OverlayEnginePrefsPatch) => {
      await invokeTauriCommand('overlay_set_engine_prefs', { patch })
      return { ok: true }
    },
    onOverlayEnginePrefs: (cb: (patch: OverlayEnginePrefsPatch) => void) =>
      eventUnlisten('overlay:enginePrefs', cb),

    lcuFetch: async () => lcuResultFromRaw(await invokeTauriCommand<TauriLcuRawResult>('lcu_fetch_raw')),
    getLcuDiagnostics: () => invokeTauriCommand('lcu_diagnostics'),
    getLivePublicData: () => invokeTauriCommand('public_meta_get_live'),
    getPlayerChampionPool: (_request: PlayerChampionPoolRequest) =>
      invokeTauriCommand<PlayerChampionPoolResponse>('riot_player_champion_pool'),
    importPlayerChampionPoolFromOverlay: async (request: PlayerChampionPoolRequest) => {
      const result = await invokeTauriCommand<PlayerChampionPoolResponse>('riot_player_champion_pool', { request })
      if (result.ok) {
        await emitTauriEvent('overlay:playerChampionPoolImported', result)
      }
      return result
    },
    onOverlayPlayerChampionPoolImported: (cb: (response: PlayerChampionPoolResponse) => void) =>
      eventUnlisten('overlay:playerChampionPoolImported', cb),

    onLcuChampSelect: (cb: (payload: LcuChampSelectResult) => void) => installLcuPoll(cb),

    toggleOverlay: () => invokeTauriCommand('overlay_toggle'),
    getOverlayStatus: () => invokeTauriCommand('overlay_status'),
    getOverlayShortcutStatus: () => invokeTauriCommand('overlay_shortcuts_status'),
    setOverlayProjectionMode: (open: boolean) => invokeTauriCommand('overlay_set_projection_mode', { open }),
    closeApp: () => invokeTauriCommand('app_close'),
    minimizeApp: () => invokeTauriCommand('app_minimize'),
    checkForAppUpdate: () => invokeTauriCommand<AppUpdateCheckResult>('app_update_check'),
    downloadAppUpdate: () => invokeTauriCommand<AppUpdateCheckResult>('app_update_download'),
    quitAndInstallAppUpdate: () => invokeTauriCommand<AppUpdateCheckResult>('app_update_quit_and_install'),
    onAppUpdateStatus: (cb: (status: AppUpdateStatus) => void) =>
      eventUnlisten('appUpdate:status', cb),

    getTrainedEffects: () => invokeTauriCommand<TrainingLoad>('training_get_effects'),
    onTrainedEffectsUpdate: (cb: (payload: TrainingLoad) => void) =>
      eventUnlisten('training:update', cb)
  }

  window.drafter = api
}
