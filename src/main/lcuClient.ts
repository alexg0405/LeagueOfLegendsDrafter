import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as https from 'node:https'
import { parseLcuChampSelectSession } from '../shared/draft/lcuMap'
import type { LcuChampSelectResult } from '../shared/draft/lcuTypes'
import type { LcuDiagnosticResult } from '../shared/desktopInterop'
export type { LcuChampSelectResult } from '../shared/draft/lcuTypes'

let warnedBadLockfile = false

export function getDefaultLockfilePaths(): string[] {
  const p: string[] = []
  const fromEnv = process.env['LEAGUE_LOCKFILE']?.trim()
  if (fromEnv) {
    p.push(fromEnv)
  }
  const la = process.env.LOCALAPPDATA
  if (la) {
    p.push(join(la, 'Riot Games', 'League of Legends', 'lockfile'))
  }
  const pf = process.env['ProgramFiles']
  if (pf) {
    p.push(join(pf, 'Riot Games', 'League of Legends', 'lockfile'))
  }
  const pfx86 = process.env['ProgramFiles(x86)']
  if (pfx86) {
    p.push(join(pfx86, 'Riot Games', 'League of Legends', 'lockfile'))
  }
  p.push('C:\\Riot Games\\League of Legends\\lockfile')
  p.push('C:\\Riot Games\\PBE\\lockfile')
  p.push('D:\\Riot Games\\League of Legends\\lockfile')
  p.push('E:\\Riot Games\\League of Legends\\lockfile')
  return p
}

function readFirstExistingLockfile(): string | null {
  for (const filePath of getDefaultLockfilePaths()) {
    if (existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

export function getLcuDiagnostics(): LcuDiagnosticResult {
  const checkedPaths = getDefaultLockfilePaths().map((filePath) => ({
    path: filePath,
    exists: existsSync(filePath),
    source: 'electron-default'
  }))
  const selectedPath = checkedPaths.find((probe) => probe.exists)?.path ?? null
  return {
    checkedPaths,
    detectedProcesses: [],
    selectedPath,
    lockfileFound: selectedPath != null,
    lcuReachable: false,
    error: selectedPath == null ? 'League client lockfile not found. Start the League client.' : null
  }
}

export function parseLockfileLine(content: string): { port: number; password: string } | null {
  const line = (content.split(/\r?\n/)[0] ?? '').trim()
  const parts = line.split(':')
  if (parts.length < 5) {
    return null
  }
  const port = Number(parts[2])
  const password = parts[3] ?? ''
  if (!Number.isFinite(port) || port <= 0 || !password) {
    return null
  }
  return { port, password }
}

function lcuGet(path: string, port: number, password: string): Promise<{ status: number; body: string }> {
  const auth = Buffer.from(`riot:${password}`, 'utf8').toString('base64')
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json'
        },
        rejectUnauthorized: false
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => {
          body += c
        })
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body })
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(5000, () => {
      req.destroy(new Error('LCU request timeout'))
    })
    req.end()
  })
}

export async function fetchChampSelectSession(): Promise<LcuChampSelectResult> {
  const lockPath = readFirstExistingLockfile()
  if (!lockPath) {
    return {
      lockfileFound: false,
      lcuReachable: false,
      snapshot: null,
      error: 'League client lockfile not found. Start the Riot / League client.'
    }
  }
  let content: string
  try {
    content = readFileSync(lockPath, 'utf8')
  } catch (e) {
    return {
      lockfileFound: true,
      lcuReachable: false,
      snapshot: null,
      error: e instanceof Error ? e.message : String(e)
    }
  }
  const creds = parseLockfileLine(content)
  if (!creds) {
    if (!warnedBadLockfile) {
      warnedBadLockfile = true
      console.warn('[drafter] could not parse League lockfile (format changed?)')
    }
    return {
      lockfileFound: true,
      lcuReachable: false,
      snapshot: null,
      error: 'Invalid lockfile format.'
    }
  }
  try {
    const { status, body } = await lcuGet('/lol-champ-select/v1/session', creds.port, creds.password)
    if (status === 404) {
      return { lockfileFound: true, lcuReachable: true, snapshot: null, error: null }
    }
    if (status < 200 || status >= 300) {
      return {
        lockfileFound: true,
        lcuReachable: true,
        snapshot: null,
        error: `Champ select HTTP ${status}`
      }
    }
    let json: unknown
    try {
      json = JSON.parse(body) as unknown
    } catch {
      return { lockfileFound: true, lcuReachable: true, snapshot: null, error: 'Invalid JSON from LCU' }
    }
    const snap = parseLcuChampSelectSession(json)
    return { lockfileFound: true, lcuReachable: true, snapshot: snap, error: null }
  } catch (e) {
    return {
      lockfileFound: true,
      lcuReachable: false,
      snapshot: null,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
