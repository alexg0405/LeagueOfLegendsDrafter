import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * `console.*` from the main process is discarded in a packaged build, which is why
 * overlay start-up failures were previously undiagnosable in the shipped `.exe`.
 * Everything on the overlay path also lands in this file.
 */

const MAX_LOG_BYTES = 512 * 1024
const RING = 400

let logPathCache: string | null = null
const recent: string[] = []

export function diagnosticsLogPath(): string {
  if (logPathCache) {
    return logPathCache
  }
  // `userData` is unavailable until `app` is ready; fall back to temp so early calls never throw.
  const base = app.isReady() ? app.getPath('userData') : app.getPath('temp')
  logPathCache = join(base, 'logs', 'nexus-draft-main.log')
  return logPathCache
}

function rotateIfLarge(file: string) {
  try {
    if (statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, `${file}.1`)
    }
  } catch {
    /* file may not exist yet */
  }
}

export function diagLog(...parts: unknown[]) {
  const line = `[${new Date().toISOString()}] ${parts
    .map((p) => (typeof p === 'string' ? p : p instanceof Error ? `${p.name}: ${p.message}` : safeJson(p)))
    .join(' ')}`

  recent.push(line)
  if (recent.length > RING) {
    recent.shift()
  }
  // eslint-disable-next-line no-console
  console.log(line)

  try {
    const file = diagnosticsLogPath()
    mkdirSync(dirname(file), { recursive: true })
    rotateIfLarge(file)
    appendFileSync(file, `${line}\n`, 'utf8')
  } catch {
    /* logging must never break the app */
  }
}

/** In-memory tail, so the renderer can show recent lines without reading the file. */
export function recentDiagnostics(limit = 80): string[] {
  return recent.slice(-limit)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
