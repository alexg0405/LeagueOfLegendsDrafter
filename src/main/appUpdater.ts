import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import type { AppUpdateCheckResult, AppUpdateStatus } from '../shared/appUpdate'

const DEFAULT_FEED_URL = 'https://nexusdraft.lol/downloads/'
const { autoUpdater } = electronUpdater

type UpdateInfoLike = {
  version?: string
}

type ProgressInfoLike = {
  percent?: number
  transferred?: number
  total?: number
}

let currentStatus: AppUpdateStatus = { state: 'idle', message: 'Update checker is ready.' }
let initialized = false

function feedUrl(): string {
  const configured = process.env['NEXUS_UPDATE_FEED_URL']?.trim()
  const value = configured || DEFAULT_FEED_URL
  return value.endsWith('/') ? value : `${value}/`
}

function publishStatus(status: AppUpdateStatus): AppUpdateStatus {
  currentStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('appUpdate:status', status)
    }
  }
  return status
}

function versionFromInfo(info: UpdateInfoLike | null | undefined): string {
  return typeof info?.version === 'string' && info.version.trim() ? info.version.trim() : 'unknown'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function checkForUpdates(isDev: boolean): Promise<AppUpdateCheckResult> {
  if (isDev || !app.isPackaged) {
    const status = publishStatus({
      state: 'not-available',
      message: 'App updater runs in packaged Windows builds.',
      version: app.getVersion()
    })
    return { ok: true, status }
  }

  publishStatus({ state: 'checking', message: 'Checking for Nexus Draft updates...' })
  try {
    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo as UpdateInfoLike | null | undefined
    if (currentStatus.state !== 'checking') {
      return { ok: true, status: currentStatus }
    }
    const status = publishStatus({
      state: 'not-available',
      message: 'Nexus Draft is up to date.',
      version: versionFromInfo(info)
    })
    return { ok: true, status }
  } catch (error) {
    const message = errorMessage(error)
    const status = publishStatus({ state: 'error', message })
    return { ok: false, status, error: message }
  }
}

async function downloadUpdate(): Promise<AppUpdateCheckResult> {
  if (!app.isPackaged) {
    const status = publishStatus({
      state: 'not-available',
      message: 'Downloads are only available in packaged builds.',
      version: app.getVersion()
    })
    return { ok: true, status }
  }

  try {
    await autoUpdater.downloadUpdate()
    return { ok: true, status: currentStatus }
  } catch (error) {
    const message = errorMessage(error)
    const status = publishStatus({ state: 'error', message })
    return { ok: false, status, error: message }
  }
}

export function setupAppUpdater(isDev: boolean): void {
  if (initialized) {
    return
  }
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  if (!isDev) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl() })
  }

  autoUpdater.on('checking-for-update', () => {
    publishStatus({ state: 'checking', message: 'Checking for Nexus Draft updates...' })
  })
  autoUpdater.on('update-available', (info: UpdateInfoLike) => {
    publishStatus({
      state: 'available',
      message: `Nexus Draft ${versionFromInfo(info)} is available.`,
      version: versionFromInfo(info)
    })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfoLike) => {
    publishStatus({
      state: 'not-available',
      message: 'Nexus Draft is up to date.',
      version: versionFromInfo(info)
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfoLike) => {
    publishStatus({
      state: 'downloading',
      message: 'Downloading Nexus Draft update...',
      percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
      transferred: Math.max(0, Number(progress.transferred) || 0),
      total: Math.max(0, Number(progress.total) || 0)
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfoLike) => {
    publishStatus({
      state: 'downloaded',
      message: `Nexus Draft ${versionFromInfo(info)} is ready to install.`,
      version: versionFromInfo(info)
    })
  })
  autoUpdater.on('error', (error) => {
    publishStatus({ state: 'error', message: errorMessage(error) })
  })

  ipcMain.handle('appUpdate:check', () => checkForUpdates(isDev))
  ipcMain.handle('appUpdate:download', () => downloadUpdate())
  ipcMain.handle('appUpdate:quitAndInstall', () => {
    if (app.isPackaged) {
      autoUpdater.quitAndInstall(false, true)
    }
    return { ok: true, status: currentStatus } satisfies AppUpdateCheckResult
  })

  if (!isDev) {
    setTimeout(() => {
      void checkForUpdates(isDev)
    }, 5000).unref()
  }
}
