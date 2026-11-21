import * as https from 'node:https'
import {
  liveGameStatusSignature,
  parseLiveClientAllGameData,
  type LiveGameStatus
} from '../shared/draft/liveGame'

/**
 * Riot's Live Client Data API runs inside the game process on https://127.0.0.1:2999 while a
 * match is loaded. It needs no auth and only exposes what the player can already see, so the
 * overlay can show items and the scoreboard state mid-game.
 *
 * `NEXUS_LIVE_CLIENT_URL` overrides the base URL (used for local testing with a mock server).
 */

const DEFAULT_BASE_URL = 'https://127.0.0.1:2999'
const REQUEST_TIMEOUT_MS = 1500
const IN_GAME_POLL_MS = 2000
const IDLE_POLL_MS = 4000
/** Re-send an unchanged in-game state at least this often so the overlay clock keeps moving. */
const HEARTBEAT_MS = 10000

function baseUrl(): URL {
  const configured = process.env['NEXUS_LIVE_CLIENT_URL']?.trim()
  try {
    const url = new URL(configured || DEFAULT_BASE_URL)
    // Only ever talk to this machine; the API never lives anywhere else.
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return new URL(DEFAULT_BASE_URL)
    }
    return url
  } catch {
    return new URL(DEFAULT_BASE_URL)
  }
}

function liveClientGet(path: string): Promise<{ status: number; body: string }> {
  const base = baseUrl()
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: base.hostname,
        port: Number(base.port || 2999),
        path,
        method: 'GET',
        headers: { Accept: 'application/json' },
        // The game serves a Riot-signed cert for 127.0.0.1; it is never a public host.
        rejectUnauthorized: false
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
          if (body.length > 4_000_000) {
            req.destroy(new Error('Live Client response too large'))
          }
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      }
    )
    req.on('error', reject)
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Live Client request timeout'))
    })
    req.end()
  })
}

function isNoGameError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'EPIPE'
}

export async function fetchLiveGameStatus(): Promise<LiveGameStatus> {
  const checkedAt = new Date().toISOString()
  try {
    const { status, body } = await liveClientGet('/liveclientdata/allgamedata')
    if (status === 404 || status === 503) {
      return { state: 'loading', snapshot: null, error: null, checkedAt }
    }
    if (status < 200 || status >= 300) {
      return { state: 'error', snapshot: null, error: `Live Client HTTP ${status}`, checkedAt }
    }
    let json: unknown
    try {
      json = JSON.parse(body) as unknown
    } catch {
      return { state: 'loading', snapshot: null, error: null, checkedAt }
    }
    const snapshot = parseLiveClientAllGameData(json)
    return snapshot
      ? { state: 'in-game', snapshot, error: null, checkedAt }
      : { state: 'loading', snapshot: null, error: null, checkedAt }
  } catch (error) {
    if (isNoGameError(error)) {
      return { state: 'no-game', snapshot: null, error: null, checkedAt }
    }
    const message = error instanceof Error ? error.message : String(error)
    // A timeout usually means the game is still loading the map.
    return /timeout/i.test(message)
      ? { state: 'loading', snapshot: null, error: null, checkedAt }
      : { state: 'error', snapshot: null, error: message, checkedAt }
  }
}

let lastStatus: LiveGameStatus = { state: 'no-game', snapshot: null, error: null, checkedAt: new Date(0).toISOString() }

export function getLastLiveGameStatus(): LiveGameStatus {
  return lastStatus
}

/** Polls fast during a game, slowly otherwise; calls `onChange` only when something changed. */
export function startLiveGamePolling(onChange: (status: LiveGameStatus) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSignature = ''
  let lastSentAt = 0

  const tick = async () => {
    if (stopped) {
      return
    }
    const status = await fetchLiveGameStatus().catch(
      (): LiveGameStatus => ({ state: 'error', snapshot: null, error: 'poll failed', checkedAt: new Date().toISOString() })
    )
    if (stopped) {
      return
    }
    lastStatus = status
    const signature = liveGameStatusSignature(status)
    const now = Date.now()
    if (signature !== lastSignature || (status.state === 'in-game' && now - lastSentAt >= HEARTBEAT_MS)) {
      lastSignature = signature
      lastSentAt = now
      onChange(status)
    }
    timer = setTimeout(() => void tick(), status.state === 'in-game' || status.state === 'loading' ? IN_GAME_POLL_MS : IDLE_POLL_MS)
    timer.unref?.()
  }

  void tick()
  return () => {
    stopped = true
    if (timer) {
      clearTimeout(timer)
    }
  }
}
