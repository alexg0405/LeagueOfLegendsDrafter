export type AppUpdateStatus =
  | { state: 'idle'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'available'; message: string; version: string }
  | { state: 'not-available'; message: string; version?: string | null }
  | { state: 'downloading'; message: string; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; message: string; version: string }
  | { state: 'error'; message: string }

export type AppUpdateCheckResult =
  | { ok: true; status: AppUpdateStatus }
  | { ok: false; status: AppUpdateStatus; error: string }
